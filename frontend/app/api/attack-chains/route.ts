import { NextResponse } from 'next/server';
import { runQueryAsObjects } from '@/lib/snowflake';
import type { AttackChainRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await runQueryAsObjects<AttackChainRow>(`
      SELECT RUN_ID, RUN_TIMESTAMP, USER_NAME, RISK_SCORE, SEVERITY, SIGNAL_COUNT,
             SIGNALS, ATTACK_CHAIN, TIMELINE, ANOMALY_DETAILS
      FROM trust_center.attack_chains
      WHERE RUN_TIMESTAMP = (SELECT MAX(RUN_TIMESTAMP) FROM trust_center.attack_chains)
      ORDER BY RISK_SCORE DESC
      LIMIT 100
    `);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ rows: [], error: (err as Error).message }, { status: 200 });
  }
}
