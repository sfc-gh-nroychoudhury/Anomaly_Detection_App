import { NextResponse } from 'next/server';
import { runQuery, runQueryAsObjects } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

// The 20 models themselves live outside the app (see
// ../../../external/install_external_ml.sql) -- this app has no visibility
// into that external schema beyond the one bound reference, so "model
// health" here means: is the external connection alive, and when did each
// model last produce results through it. There is no in-app task to report
// on anymore -- the weekly retrain task is external too.
const MODEL_NAMES = [
  'ad_login_count', 'ad_failed_auth', 'ad_distinct_ips', 'ad_client_diversity',
  'ad_query_volume', 'ad_bytes_scanned', 'ad_bytes_to_result', 'ad_rows_unloaded', 'ad_network_egress',
  'ad_db_breadth', 'ad_table_breadth', 'ad_failed_queries',
  'ad_role_usage', 'ad_ddl_operations', 'ad_grant_operations',
  'ad_data_staging', 'ad_outbound_transfer', 'ad_ext_function_calls',
  'ad_warehouse_credits', 'ad_warehouse_queries',
];

export async function GET() {
  let connected = false;
  try {
    // No documented SYSTEM$ getter for reference binding state (confirmed
    // against a real account) -- probe with the same query the scan
    // procedure uses.
    await runQuery(`SELECT COUNT(*) FROM reference('external_detection')`);
    connected = true;
  } catch {
    // treat as not connected
  }

  let lastRuns: Record<string, string> = {};
  try {
    const rows = await runQueryAsObjects<{ MODEL_NAME: string; LAST_RUN: string }>(
      `SELECT MODEL_NAME, MAX(RUN_TIMESTAMP) AS LAST_RUN FROM trust_center.anomaly_results GROUP BY MODEL_NAME`
    );
    lastRuns = Object.fromEntries(rows.map((r) => [r.MODEL_NAME, r.LAST_RUN]));
  } catch {
    // no results yet -- fine, models will just show "never"
  }

  const models = MODEL_NAMES.map((name) => ({
    name,
    lastRun: lastRuns[name] ?? null,
  }));

  return NextResponse.json({ connected, models });
}
