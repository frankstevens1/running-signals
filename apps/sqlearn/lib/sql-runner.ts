import "server-only";

import postgres from "postgres";
import { MAX_RESULT_ROWS, validateReadQuery } from "./sql-validation";
import type { QueryResult } from "./types";

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

export async function executeQuery(input: string): Promise<QueryResult> {
  const sql = validateReadQuery(input);
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("Query execution is not configured.");
  }

  const sql_client = postgres(connectionString, {
    max: 1,
    idle_timeout: 30,
    connect_timeout: 10,
    debug: false,
  });

  try {
    const start = Date.now();

    try {
      const resultArr = await sql_client.begin(async (transaction) => {
        await transaction.unsafe("set local transaction read only");
        await transaction.unsafe("set local statement_timeout = '3000ms'");
        await transaction.unsafe("set local idle_in_transaction_session_timeout = '5000ms'");
        return transaction.unsafe(sql);
      });

      const durationMs = Date.now() - start;
      const rows = Array.isArray(resultArr) ? resultArr : [];
      const sliced = rows.slice(0, MAX_RESULT_ROWS);
      const columns = extractColumns(sliced);
      const flatRows = sliced.map((row) => rowToObject(row, columns));

      return { columns, rows: flatRows, rowCount: rows.length, durationMs };
    } catch (err) {
      console.error("Sqlearn query failed", err);
      throw new Error("Query execution failed.");
    }
  } finally {
    await sql_client.end();
  }
}
