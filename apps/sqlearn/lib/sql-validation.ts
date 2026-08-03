import { parse } from "pgsql-ast-parser";

const ALLOWED_TABLES = new Set([
  "site_days",
  "site_fitness",
  "site_route_segments",
  "site_routes",
  "site_runs",
  "site_weeks",
]);
const ALLOWED_FUNCTIONS = new Set([
  "abs",
  "avg",
  "ceil",
  "ceiling",
  "coalesce",
  "concat",
  "count",
  "date_trunc",
  "dense_rank",
  "floor",
  "lag",
  "last_value",
  "lead",
  "length",
  "lower",
  "max",
  "min",
  "ntile",
  "nullif",
  "percent_rank",
  "rank",
  "replace",
  "round",
  "row_number",
  "split_part",
  "sum",
  "to_char",
  "trim",
  "upper",
]);

export const MAX_QUERY_LENGTH = 10_000;
export const MAX_RESULT_ROWS = 1_000;

type AstNode = Record<string, unknown>;

function isAstNode(value: unknown): value is AstNode {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function visitAst(value: unknown, visit: (node: AstNode) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitAst(item, visit));
    return;
  }
  if (!isAstNode(value)) return;

  visit(value);
  Object.values(value).forEach((item) => visitAst(item, visit));
}

function collectCteNames(statement: AstNode, names: Set<string>) {
  if (statement.type !== "with" && statement.type !== "with recursive") return;
  const bindings = statement.bind;
  if (!Array.isArray(bindings)) return;

  for (const binding of bindings) {
    if (!isAstNode(binding) || !isAstNode(binding.alias) || typeof binding.alias.name !== "string") continue;
    names.add(binding.alias.name.toLowerCase());
    if (isAstNode(binding.statement)) collectCteNames(binding.statement, names);
  }
}

function assertReadOnlyStatement(statement: AstNode) {
  if (statement.type === "select") {
    if (statement.for || statement.skip) {
      throw new Error("Locking clauses are not allowed.");
    }
    return;
  }

  if (statement.type === "union" || statement.type === "union all") {
    if (!isAstNode(statement.left) || !isAstNode(statement.right)) {
      throw new Error("Invalid UNION query.");
    }
    assertReadOnlyStatement(statement.left);
    assertReadOnlyStatement(statement.right);
    return;
  }

  if (statement.type === "with" || statement.type === "with recursive") {
    const bindings = statement.bind;
    const result = statement.in;
    if (!Array.isArray(bindings) || !isAstNode(result)) {
      throw new Error("Invalid common table expression.");
    }
    for (const binding of bindings) {
      if (!isAstNode(binding) || !isAstNode(binding.statement)) {
        throw new Error("Invalid common table expression.");
      }
      assertReadOnlyStatement(binding.statement);
    }
    assertReadOnlyStatement(result);
    return;
  }
  throw new Error("Only SELECT queries and read-only common table expressions are allowed.");
}

function getFinalSelect(statement: AstNode): AstNode {
  if (statement.type === "with" || statement.type === "with recursive") {
    if (!isAstNode(statement.in)) throw new Error("Invalid common table expression.");
    return getFinalSelect(statement.in);
  }
  if (statement.type === "union" || statement.type === "union all") {
    if (!isAstNode(statement.right)) throw new Error("Invalid UNION query.");
    return getFinalSelect(statement.right);
  }
  return statement;
}

function assertResultLimit(statement: AstNode) {
  const finalSelect = getFinalSelect(statement);
  if (finalSelect.type !== "select" || !isAstNode(finalSelect.limit) || !isAstNode(finalSelect.limit.limit)) {
    throw new Error(`Queries must include LIMIT ${MAX_RESULT_ROWS} or lower.`);
  }

  const limit = finalSelect.limit.limit;
  if ((limit.type !== "integer" && limit.type !== "numeric") || typeof limit.value !== "number"
    || limit.value < 1 || limit.value > MAX_RESULT_ROWS) {
    throw new Error(`Queries must include LIMIT ${MAX_RESULT_ROWS} or lower.`);
  }
}

function assertAllowedReferences(statement: AstNode, cteNames: Set<string>) {
  visitAst(statement, (node) => {
    if (node.type === "table") {
      const name = isAstNode(node.name) && typeof node.name.name === "string"
        ? node.name.name.toLowerCase()
        : null;
      const schema = isAstNode(node.name) && typeof node.name.schema === "string"
        ? node.name.schema.toLowerCase()
        : null;
      if (!name || (schema && schema !== "sqlearn") || (!cteNames.has(name) && !ALLOWED_TABLES.has(name))) {
        throw new Error("Queries may only read approved Sqlearn views.");
      }
    }

    if (node.type === "call") {
      const functionName = isAstNode(node.function) && typeof node.function.name === "string"
        ? node.function.name.toLowerCase()
        : null;
      const functionSchema = isAstNode(node.function) && typeof node.function.schema === "string"
        ? node.function.schema.toLowerCase()
        : null;
      if (!functionName || functionSchema || !ALLOWED_FUNCTIONS.has(functionName)) {
        throw new Error("This SQL function is not allowed.");
      }
    }

  });
}

function assertNoSetReturningFunctions(statement: AstNode) {
  visitAst(statement, (node) => {
    if (node.type !== "select" || !Array.isArray(node.from)) return;
    if (node.from.some((source) => isAstNode(source) && source.type === "call")) {
      throw new Error("Set-returning functions are not allowed in FROM.");
    }
  });
}

export function validateReadQuery(input: string) {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_QUERY_LENGTH) {
    throw new Error(`Queries must be between 1 and ${MAX_QUERY_LENGTH} characters.`);
  }

  const sql = trimmed.endsWith(";") ? trimmed.slice(0, -1).trim() : trimmed;
  if (sql.includes(";")) {
    throw new Error("Only one SQL statement is allowed.");
  }

  let statements: AstNode[];
  try {
    statements = parse(sql) as unknown as AstNode[];
  } catch {
    throw new Error("The SQL query could not be parsed.");
  }
  if (statements.length !== 1) {
    throw new Error("Only one SQL statement is allowed.");
  }

  const statement = statements[0];
  assertReadOnlyStatement(statement);
  assertResultLimit(statement);

  const cteNames = new Set<string>();
  collectCteNames(statement, cteNames);
  assertAllowedReferences(statement, cteNames);
  assertNoSetReturningFunctions(statement);
  return sql;
}
