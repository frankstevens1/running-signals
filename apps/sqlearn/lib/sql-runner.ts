import "server-only";
import postgres from "postgres";
import type { QueryResult, Engine } from "./types";

const FORBIDDEN_KEYWORDS = [
  "DROP",
  "DELETE",
  "INSERT",
  "UPDATE",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "VACUUM",
  "REINDEX",
  "COPY",
  "\\c",
  "\\connect",
];

function sanitizeSql(sql: string): void {
  const upper = sql.toUpperCase();
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upper)) {
      throw new Error(`Forbidden SQL keyword: ${keyword}. Only read-only queries are allowed.`);
    }
  }
}

function isPlainRow(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  return true;
}

type PgRow = Record<string, unknown> & { columns?: readonly string[] };

function extractColumns(rows: unknown[]): string[] {
  if (rows.length === 0) return [];

  const first = rows[0] as PgRow;

  if (first.columns && Array.isArray(first.columns) && first.columns.length > 0) {
    return [...first.columns] as string[];
  }

  if (isPlainRow(first)) {
    const keys = Object.keys(first);
    if (keys.length > 0) return keys;
  }

  return [];
}

function rowToObject(row: unknown, columns: string[]): Record<string, unknown> {
  if (isPlainRow(row)) {
    const obj: Record<string, unknown> = {};
    for (const col of columns) {
      const val = row[col];
      obj[col] = val === null ? null : val;
    }
    return obj;
  }

  const obj: Record<string, unknown> = {};
  for (const col of columns) {
    obj[col] = null;
  }
  return obj;
}

async function executeSupabase(sql: string): Promise<QueryResult> {
  sanitizeSql(sql);

  const connectionString =
    process.env.SUPABASE_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  const sql_client = postgres(connectionString, {
    max: 1,
    idle_timeout: 30,
    connect_timeout: 10,
    debug: false,
  });

  try {
    const start = Date.now();

    let resultArr: unknown[];
    try {
      resultArr = await sql_client.unsafe(sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Query failed: ${msg}`);
    }

    const durationMs = Date.now() - start;

    const rows = Array.isArray(resultArr) ? resultArr : [];
    const sliced = rows.length > 1000 ? rows.slice(0, 1000) : rows;
    const columns = extractColumns(sliced);
    const flatRows = sliced.map((row) => rowToObject(row, columns));

    return { columns, rows: flatRows, rowCount: rows.length, durationMs };
  } finally {
    await sql_client.end();
  }
}

async function executeDatabricks(sql: string): Promise<QueryResult> {
  sanitizeSql(sql);

  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const httpPath = process.env.DATABRICKS_HTTP_PATH;

  if (!host || !token || !httpPath) {
    throw new Error("Databricks is not configured. Set DATABRICKS_HOST, DATABRICKS_TOKEN, and DATABRICKS_HTTP_PATH.");
  }

  const start = Date.now();

  const response = await fetch(`https://${host}/api/2.0/sql/statements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      statement: sql,
      warehouse_id: httpPath.replace("/sql/1.0/warehouses/", ""),
      wait_timeout: "30s",
      byte_limit: 10485760,
      disposition: "INLINE",
      format: "JSON_ARRAY",
    }),
  });

  const body = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    const message = typeof body.message === "string" ? body.message : JSON.stringify(body);
    throw new Error(`Databricks query failed: ${message}`);
  }

  const durationMs = Date.now() - start;
  const manifest = body.manifest as Record<string, unknown> | undefined;
  const schema = (manifest?.schema as { columns?: { name: string }[] }) ?? { columns: [] };
  const columns = (schema.columns ?? []).map((c: unknown) => (c as { name: string }).name);

  const result = body.result as Record<string, unknown> | undefined;
  const dataArray = (result?.data_array ?? []) as unknown[][];

  const rows = dataArray.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col: string, idx: number) => {
      obj[col] = row[idx];
    });
    return obj;
  });

  return { columns, rows: rows.slice(0, 1000), rowCount: rows.length, durationMs };
}

export async function executeQuery(sql: string, engine: Engine): Promise<QueryResult> {
  if (engine === "databricks") {
    return executeDatabricks(sql);
  }
  return executeSupabase(sql);
}
