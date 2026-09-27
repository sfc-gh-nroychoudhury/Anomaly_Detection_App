import { NextResponse } from 'next/server';
import { runQueryAsObjects } from '@/lib/snowflake';
import type { AnomalyResultRow, AttackChainRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);

  try {
    const [signals, chain] = await Promise.all([
      runQueryAsObjects<AnomalyResultRow>(
        `SELECT MODEL_NAME, USER_NAME, TS, METRIC_VALUE, FORECAST, LOWER_BOUND, UPPER_BOUND, IS_ANOMALY, PERCENTILE, DISTANCE
         FROM trust_center.anomaly_results
         WHERE USER_NAME = ? AND RUN_TIMESTAMP >= DATEADD('day', -7, CURRENT_TIMESTAMP())
         ORDER BY MODEL_NAME, TS`,
        [{ type: 'TEXT', value: userName }]
      ),
      runQueryAsObjects<AttackChainRow>(
        `SELECT RUN_ID, RUN_TIMESTAMP, USER_NAME, RISK_SCORE, SEVERITY, SIGNAL_COUNT, SIGNALS, ATTACK_CHAIN, TIMELINE, ANOMALY_DETAILS
         FROM trust_center.attack_chains
         WHERE USER_NAME = ?
         ORDER BY RUN_TIMESTAMP DESC
         LIMIT 1`,
        [{ type: 'TEXT', value: userName }]
      ),
    ]);

    return NextResponse.json({ signals, chain: chain[0] ?? null });
  } catch (err) {
    return NextResponse.json({ signals: [], chain: null, error: (err as Error).message });
  }
}
