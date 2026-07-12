import "server-only";

type DatabricksConfig = {
  host: string;
  token: string;
  warehouseId: string;
  catalog: string;
  schema: string;
};

type StatementResponse = {
  statement_id?: string;
  status?: {
    state?: string;
    error?: {
      message?: string;
    };
  };
  manifest?: {
    truncated?: boolean;
    total_row_count?: number | string;
    schema?: {
      columns?: Array<{ name: string }>;
    };
  };
  result?: {
    data_array?: unknown[][];
    next_chunk_internal_link?: string;
  };
};

type StatementChunk = {
  data_array?: unknown[][];
  next_chunk_internal_link?: string;
};

const NOT_CONFIGURED_MESSAGE =
  "Databricks SQL is not configured. Set DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_HTTP_PATH, DATABRICKS_CATALOG, and DATABRICKS_GOLD_SCHEMA.";

export class DatabricksNotConfiguredError extends Error {
  constructor() {
    super(NOT_CONFIGURED_MESSAGE);
  }
}

function getWarehouseId(httpPath: string): string | null {
  const match = httpPath.match(/\/warehouses\/([^/]+)$/);
  return match?.[1] ?? null;
}

function cleanHost(host: string): string {
  return host.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function getConfig(): DatabricksConfig {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const httpPath = process.env.DATABRICKS_HTTP_PATH;
  const catalog = process.env.DATABRICKS_CATALOG;
  const schema = process.env.DATABRICKS_GOLD_SCHEMA;
  const warehouseId = httpPath ? getWarehouseId(httpPath) : null;

  if (!host || !token || !warehouseId || !catalog || !schema) {
    throw new DatabricksNotConfiguredError();
  }

  return {
    host: cleanHost(host),
    token,
    warehouseId,
    catalog,
    schema,
  };
}

export function quoteIdentifier(value: string): string {
  return `\`${value.replaceAll("`", "``")}\``;
}

export function goldTable(name: string): string {
  const config = getConfig();
  return [
    quoteIdentifier(config.catalog),
    quoteIdentifier(config.schema),
    quoteIdentifier(name),
  ].join(".");
}

function rowsFromData(columns: string[], rows: unknown[][]): Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])),
  );
}

async function fetchStatementChunk(
  config: DatabricksConfig,
  internalLink: string,
): Promise<StatementChunk> {
  const url = new URL(internalLink, `https://${config.host}`);
  if (url.host !== config.host) {
    throw new Error("Databricks returned a chunk link for an unexpected host.");
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Databricks SQL chunk request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as StatementChunk;
}

async function submitStatement(
  config: DatabricksConfig,
  statement: string,
): Promise<StatementResponse> {
  const response = await fetch(`https://${config.host}/api/2.0/sql/statements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      statement,
      warehouse_id: config.warehouseId,
      catalog: config.catalog,
      schema: config.schema,
      wait_timeout: "10s",
      disposition: "INLINE",
      format: "JSON_ARRAY",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Databricks SQL request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as StatementResponse;
}

async function pollStatement(
  config: DatabricksConfig,
  statementId: string,
): Promise<StatementResponse> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(
      `https://${config.host}/api/2.0/sql/statements/${statementId}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Databricks SQL polling failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as StatementResponse;
    const state = payload.status?.state;

    if (state === "SUCCEEDED" || state === "FAILED" || state === "CANCELED") {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error("Databricks SQL statement timed out.");
}

export async function queryDatabricks(
  statement: string,
): Promise<Record<string, unknown>[]> {
  const config = getConfig();
  const submitted = await submitStatement(config, statement);
  const initialState = submitted.status?.state;
  const finalResponse =
    initialState === "PENDING" || initialState === "RUNNING"
      ? await pollStatement(config, submitted.statement_id ?? "")
      : submitted;

  if (finalResponse.status?.state !== "SUCCEEDED") {
    throw new Error(
      finalResponse.status?.error?.message ?? "Databricks SQL statement failed.",
    );
  }

  const columns =
    finalResponse.manifest?.schema?.columns?.map((column) => column.name) ?? [];
  if (finalResponse.manifest?.truncated === true) {
    throw new Error("Databricks SQL reported a truncated result set.");
  }

  const rows = [...(finalResponse.result?.data_array ?? [])];
  let nextChunkLink = finalResponse.result?.next_chunk_internal_link;
  const visitedChunkLinks = new Set<string>();

  while (nextChunkLink) {
    if (visitedChunkLinks.has(nextChunkLink)) {
      throw new Error("Databricks returned a repeated result chunk link.");
    }
    visitedChunkLinks.add(nextChunkLink);

    const chunk = await fetchStatementChunk(config, nextChunkLink);
    rows.push(...(chunk.data_array ?? []));
    nextChunkLink = chunk.next_chunk_internal_link;
  }

  const rawExpectedRowCount = finalResponse.manifest?.total_row_count;
  const expectedRowCount =
    rawExpectedRowCount === undefined ? undefined : Number(rawExpectedRowCount);

  if (expectedRowCount !== undefined && !Number.isSafeInteger(expectedRowCount)) {
    throw new Error("Databricks SQL returned an invalid total row count.");
  }

  if (expectedRowCount !== undefined && rows.length !== expectedRowCount) {
    throw new Error(
      `Databricks SQL returned ${rows.length} rows, expected ${expectedRowCount}.`,
    );
  }

  return rowsFromData(columns, rows);
}

export function isDatabricksNotConfigured(error: unknown): boolean {
  return error instanceof DatabricksNotConfiguredError;
}
