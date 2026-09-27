// lib/snowflake.ts
//
// SQL API client for the container's own queries against the app's schemas.
//
// UNVERIFIED (see tests/dev_account_checklist.md §6, "single highest-risk
// unverified item"): this assumes the standard SPCS-in-Native-App pattern --
// a mounted OAuth token file that Snowflake refreshes automatically, used to
// call the SQL API REST endpoint as the application's own identity. Confirm
// the exact token path/host env vars in a real dev-account deployment before
// relying on this in production; the token path and header names below are
// the commonly documented convention, not something this scaffold could
// execute-test itself.

import { readFileSync } from 'fs';

const TOKEN_PATH = '/snowflake/session/token';
const SQL_API_PATH = '/api/v2/statements';

// Next.js standalone mode webpack inlines `process.env.X` with the build-time
// value (undefined during Docker build). Iterating `Object.entries(process.env)`
// is NOT inlined and sees the real runtime env.
function envLookup(key: string): string | undefined {
  for (const [k, v] of Object.entries(process.env)) {
    if (k === key) return v;
  }
  return undefined;
}

function getHost(): string {
  const host = envLookup('SNOWFLAKE_HOST');
  if (!host) {
    throw new Error(
      'SNOWFLAKE_HOST is not set. This client only works when running inside ' +
        'the SPCS service container, where Snowflake injects it automatically.'
    );
  }
  return host;
}

function getDatabase(): string | undefined {
  return envLookup('SNOWFLAKE_DATABASE');
}

function getToken(): string {
  // Local dev: use SNOWFLAKE_TOKEN env var (e.g. a PAT) when the SPCS token file doesn't exist.
  try {
    return readFileSync(TOKEN_PATH, 'utf-8').trim();
  } catch {
    const envToken = envLookup('SNOWFLAKE_TOKEN');
    if (envToken) return envToken;
    throw new Error(
      `Could not read OAuth token at ${TOKEN_PATH} and SNOWFLAKE_TOKEN env var is not set. ` +
        `Set SNOWFLAKE_TOKEN for local dev, or run inside the SPCS container.`
    );
  }
}

function getTokenType(): string {
  // SPCS uses OAuth; local dev with a PAT uses PROGRAMMATIC_ACCESS_TOKEN
  try {
    readFileSync(TOKEN_PATH, 'utf-8');
    return 'OAUTH';
  } catch {
    return 'PROGRAMMATIC_ACCESS_TOKEN';
  }
}

export interface SqlApiResult {
  columns: string[];
  rows: unknown[][];
  rowType: Array<{ name: string; type: string }>;
}

/**
 * Executes a single SQL statement as the application's own identity and
 * returns the result as plain column names + row arrays.
 *
 * Binds use the SQL API's positional `bindings` object: { "1": {type, value}, ... }.
 */
export async function runQuery(
  statement: string,
  binds: Array<{ type: string; value: string }> = []
): Promise<SqlApiResult> {
  const host = getHost();
  const token = getToken();

  const bindings: Record<string, { type: string; value: string }> = {};
  binds.forEach((b, i) => {
    bindings[String(i + 1)] = b;
  });

  const res = await fetch(`https://${host}${SQL_API_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Snowflake-Authorization-Token-Type': getTokenType(),
      Accept: 'application/json',
    },
    body: JSON.stringify({
      statement,
      timeout: 60,
      ...(getDatabase() ? { database: getDatabase() } : {}),
      ...(envLookup('SNOWFLAKE_ROLE') ? { role: envLookup('SNOWFLAKE_ROLE') } : {}),
      ...(envLookup('SNOWFLAKE_WAREHOUSE') ? { warehouse: envLookup('SNOWFLAKE_WAREHOUSE') } : {}),
      ...(binds.length ? { bindings } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SQL API request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const rowType: Array<{ name: string; type: string }> = (
    data.resultSetMetaData?.rowType ?? []
  ).map((c: { name: string; type: string }) => ({ name: c.name, type: c.type }));
  const columns: string[] = rowType.map((c) => c.name);
  const rows: unknown[][] = data.data ?? [];

  return { columns, rows, rowType };
}

// SQL API type names that should be coerced to JS number
const NUMERIC_TYPES = new Set([
  'FIXED', 'REAL', 'FLOAT', 'NUMBER', 'DECIMAL', 'NUMERIC',
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'BYTEINT',
  'DOUBLE', 'DOUBLE PRECISION',
]);

const TIMESTAMP_TYPES = new Set([
  'TIMESTAMP_NTZ', 'TIMESTAMP_LTZ', 'TIMESTAMP_TZ', 'TIMESTAMP',
  'DATE', 'TIME',
]);

function coerceValue(val: unknown, sqlType: string): unknown {
  if (val === null || val === undefined) return val;
  const t = sqlType.toUpperCase();
  if (NUMERIC_TYPES.has(t)) {
    const n = Number(val);
    return Number.isNaN(n) ? val : n;
  }
  if (t === 'BOOLEAN') {
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return Boolean(val);
  }
  // Snowflake SQL API sends timestamps as epoch seconds (float), sometimes with
  // a timezone offset suffix (e.g. "1790519192.183000000 1200" for TIMESTAMP_LTZ).
  // Convert to ISO strings so new Date() works in the frontend.
  if (TIMESTAMP_TYPES.has(t) && typeof val === 'string') {
    // Strip timezone offset suffix (e.g. " 1200" or " -0700") and nanosecond padding
    const cleaned = val.split(' ')[0];
    const epoch = Number(cleaned);
    if (!Number.isNaN(epoch) && epoch > 1e9 && epoch < 1e11) {
      return new Date(epoch * 1000).toISOString();
    }
    // Trim nanosecond precision from date strings
    return val.replace(/(\.\d{3})\d+$/, '$1');
  }
  return val;
}

/** Convenience helper: runs a query and returns an array of plain objects keyed by column name. */
export async function runQueryAsObjects<T = Record<string, unknown>>(
  statement: string,
  binds: Array<{ type: string; value: string }> = []
): Promise<T[]> {
  const { columns, rows, rowType } = await runQuery(statement, binds);
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = coerceValue(row[i], rowType[i]?.type ?? 'TEXT');
    });
    return obj as T;
  });
}
