import { NextResponse } from 'next/server';
import type { SetupCheck } from '@/lib/types';
import { readFileSync } from 'fs';

// Force Next.js to evaluate this route on every request instead of caching
// the response at build time (when SPCS env vars aren't available).
export const dynamic = 'force-dynamic';

const PLACEHOLDER_TOKENS = ['<this_app_name>', '<this_package_name>'] as const;

async function sqlQuery(host: string, token: string, statement: string, binds: Array<{ type: string; value: string }> = []) {
  const bindings: Record<string, { type: string; value: string }> = {};
  binds.forEach((b, i) => { bindings[String(i + 1)] = b; });
  const res = await fetch(`https://${host}/api/v2/statements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Snowflake-Authorization-Token-Type': 'OAUTH',
      Accept: 'application/json',
    },
    body: JSON.stringify({ statement, timeout: 60, ...(binds.length ? { bindings } : {}) }),
  });
  if (!res.ok) throw new Error(`SQL API ${res.status}`);
  const data = await res.json();
  const columns: string[] = (data.resultSetMetaData?.rowType ?? []).map((c: { name: string }) => c.name);
  const rows: unknown[][] = data.data ?? [];
  return { columns, rows };
}

async function sqlQueryObjects<T = Record<string, unknown>>(host: string, token: string, statement: string, binds: Array<{ type: string; value: string }> = []): Promise<T[]> {
  const { columns, rows } = await sqlQuery(host, token, statement, binds);
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj as T;
  });
}

export async function GET() {
  const checks: SetupCheck[] = [];

  // Read ALL env vars via iteration directly in the handler — this pattern
  // survives webpack inlining in Next.js standalone mode (proven in debug-env).
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v) env[k] = v;
  }

  // Resolve app name from SPCS-injected SNOWFLAKE_DATABASE env var
  let appName = '<this_app_name>';
  if (env['SNOWFLAKE_DATABASE']) {
    appName = env['SNOWFLAKE_DATABASE'];
  } else if (env['SNOWFLAKE_HOST']) {
    // Fallback: SQL API call
    try {
      const token = readFileSync('/snowflake/session/token', 'utf-8').trim();
      const res = await fetch(`https://${env['SNOWFLAKE_HOST']}/api/v2/statements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Snowflake-Authorization-Token-Type': 'OAUTH',
          Accept: 'application/json',
        },
        body: JSON.stringify({ statement: 'SELECT CURRENT_DATABASE()', timeout: 30 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.[0]?.[0]) appName = String(data.data[0][0]);
      }
    } catch { /* stays as placeholder */ }
  }

  // Resolve the app's own application package name dynamically too -- `SHOW
  // APPLICATIONS LIKE <appName>` returns a `source`/`source_type` pair that
  // identifies what the running application was created from. This is metadata
  // visibility (like `SHOW DATABASES`), not data access, so it does not require
  // any of the one-time grants below to already be in place. If the app's own
  // restricted session can't see it for some reason, the token stays in place
  // and the UI prompts for it instead of ever letting a placeholder be copied
  // into a real SQL statement.
  // Get SQL API credentials from the env snapshot
  const host = env['SNOWFLAKE_HOST'] || '';
  let token = '';
  try { token = readFileSync('/snowflake/session/token', 'utf-8').trim(); } catch {}

  let packageName = '<this_package_name>';
  if (appName !== '<this_app_name>' && host && token) {
    try {
      const { columns, rows } = await sqlQuery(host, token, 'SHOW APPLICATIONS LIKE ?', [
        { type: 'TEXT', value: appName },
      ]);
      const sourceIdx = columns.findIndex((c) => c.toLowerCase() === 'source');
      const sourceTypeIdx = columns.findIndex((c) => c.toLowerCase() === 'source_type');
      const sourceType = sourceTypeIdx >= 0 ? String(rows[0]?.[sourceTypeIdx] ?? '') : '';
      if (sourceIdx >= 0 && rows[0]?.[sourceIdx] && sourceType.toUpperCase().includes('APPLICATION PACKAGE')) {
        packageName = String(rows[0][sourceIdx]);
      }
    } catch {
      // Leave packageName as the placeholder; the client renders an input for it.
    }
  }

  // Check 1: IMPORTED PRIVILEGES ON SNOWFLAKE DB
  try {
    await sqlQuery(host, token, 'SELECT COUNT(*) FROM SNOWFLAKE.ACCOUNT_USAGE.USERS LIMIT 1');
    checks.push({ id: 'imported_privileges', label: 'Read access to ACCOUNT_USAGE granted', status: 'ok',
      sql: `USE ROLE ACCOUNTADMIN;\nGRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION ${appName};`,
    });
  } catch {
    checks.push({
      id: 'imported_privileges',
      label: 'Read access to ACCOUNT_USAGE granted',
      status: 'pending',
      detail: 'Run this once as ACCOUNTADMIN (or approve the pending access request in Snowsight → Apps).',
      sql: `USE ROLE ACCOUNTADMIN;
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION ${appName};`,
    });
  }

  // Check 2 + 3: Trust Center registration status.
  try {
    const rows = await sqlQueryObjects<{ NAME: string; REGISTRATION_STATE: string }>(host, token,
      `SELECT NAME, REGISTRATION_STATE FROM SNOWFLAKE.TRUST_CENTER.EXTENSIONS WHERE NAME = CURRENT_DATABASE()`
    );
    if (rows.length > 0) {
      checks.push({
        id: 'registered',
        label: 'Registered with Trust Center',
        status: 'ok',
        detail: `State: ${rows[0].REGISTRATION_STATE}`,
        sql: `USE ROLE ACCOUNTADMIN;\nGRANT APPLICATION ROLE ${appName}.trust_center_integration_role TO APPLICATION snowflake;\nCALL SNOWFLAKE.TRUST_CENTER.REGISTER_EXTENSION('APPLICATION PACKAGE', '${packageName}', '${appName}');`,
      });
    } else {
      checks.push({
        id: 'registered',
        label: 'Registered with Trust Center',
        status: 'pending',
        detail:
          'Run this as a role with SNOWFLAKE.TRUST_CENTER_ADMIN granted. If this app was installed from a public Marketplace listing, this may already be done automatically -- refresh this page to check.',
        sql: `USE ROLE ACCOUNTADMIN;
GRANT APPLICATION ROLE ${appName}.trust_center_integration_role TO APPLICATION snowflake;
CALL SNOWFLAKE.TRUST_CENTER.REGISTER_EXTENSION('APPLICATION PACKAGE', '${packageName}', '${appName}');`,
      });
    }
  } catch {
    checks.push({
      id: 'registered',
      label: 'Registered with Trust Center',
      status: 'pending',
      detail: 'Complete Step 1 first, then run the SQL below as ACCOUNTADMIN.',
      sql: `USE ROLE ACCOUNTADMIN;\nGRANT APPLICATION ROLE ${appName}.trust_center_integration_role TO APPLICATION snowflake;\nCALL SNOWFLAKE.TRUST_CENTER.REGISTER_EXTENSION('APPLICATION PACKAGE', '${packageName}', '${appName}');`,
    });
  }

  // Check 4: scanner package enabled.
  try {
    const rows = await sqlQueryObjects<{ NAME: string; STATE: string }>(host, token,
      `SELECT NAME, STATE FROM SNOWFLAKE.TRUST_CENTER.SCANNER_PACKAGES WHERE EXTENSION_NAME = CURRENT_DATABASE()`
    );
    const pkg = rows.find((r) => r.NAME?.toLowerCase().includes('ml behavioral'));
    if (pkg && pkg.STATE?.toUpperCase() === 'ENABLED') {
      checks.push({ id: 'scanner_enabled', label: 'Scanner package enabled', status: 'ok',
        detail: 'Snowsight → Governance & Security → Trust Center → Scanner Packages → "ML Behavioral Anomaly Detection" → Enable package → Grant → Enable.',
      });
    } else {
      checks.push({
        id: 'scanner_enabled',
        label: 'Scanner package enabled',
        status: 'pending',
        detail:
          'Snowsight → Governance & Security → Trust Center → Scanner Packages → "ML Behavioral Anomaly Detection" → Enable package → Grant → Enable. This step cannot be automated by any app, by design.',
      });
    }
  } catch {
    checks.push({
      id: 'scanner_enabled',
      label: 'Scanner package enabled',
      status: 'pending',
      detail: 'Complete the steps above first, then follow the instructions below.\n\nSnowsight → Governance & Security → Trust Center → Scanner Packages → "ML Behavioral Anomaly Detection" → Enable package → Grant → Enable. This step cannot be automated by any app, by design.',
    });
  }

  // Check 5: external ML models installed + reference bound. The app cannot
  // see the external database/schema directly (no reference to it exists
  // until bound), and there is no documented SYSTEM$ getter for reference
  // binding state (confirmed against a real account) -- so the only reliable
  // signal is attempting the same query the scan procedure uses and seeing
  // whether it succeeds.
  try {
    await sqlQuery(host, token, `SELECT COUNT(*) FROM reference('external_detection')`);
    checks.push({ id: 'external_ml', label: 'External ML models connected', status: 'ok',
      sql: `USE ROLE ACCOUNTADMIN;\nCALL ${appName}.config.register_single_reference(\n  'EXTERNAL_DETECTION', 'ADD',\n  SYSTEM$REFERENCE('TABLE', 'ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS', 'PERSISTENT', 'SELECT'));`,
    });
  } catch {
    checks.push({
      id: 'external_ml',
      label: 'External ML models connected',
      status: 'pending',
      detail:
        'The 20 ML models cannot live inside this app (Snowflake does not support ML model objects inside a Native App\u2019s own database). Two steps: (1) run install_external_ml.sql as ACCOUNTADMIN in this account -- open it below -- then (2) run the CALL command below to connect it to this app.',
      downloadUrl: '/install_external_ml.sql',
      sql: `USE ROLE ACCOUNTADMIN;\nCALL ${appName}.config.register_single_reference(\n  'EXTERNAL_DETECTION', 'ADD',\n  SYSTEM$REFERENCE('TABLE', 'ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS', 'PERSISTENT', 'SELECT'));`,
    });
  }

  // Flag, per check, exactly which placeholder tokens (if any) are still
  // literally present in its `sql` -- this is what the client uses to decide
  // whether to prompt for manual input before allowing a copy.
  for (const check of checks) {
    if (!check.sql) continue;
    const missing = PLACEHOLDER_TOKENS.filter((token) => check.sql!.includes(token));
    if (missing.length > 0) check.missingPlaceholders = [...missing];
  }

  return NextResponse.json({ checks, appName });
}
