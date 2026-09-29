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

    const coercedSignals = signals.map((r) => ({
      ...r,
      METRIC_VALUE: Number(r.METRIC_VALUE) || 0,
      FORECAST: Number(r.FORECAST) || 0,
      LOWER_BOUND: Number(r.LOWER_BOUND) || 0,
      UPPER_BOUND: Number(r.UPPER_BOUND) || 0,
      PERCENTILE: Number(r.PERCENTILE) || 0,
      DISTANCE: Number(r.DISTANCE) || 0,
    }));
    const coercedChain = chain[0] ? {
      ...chain[0],
      RISK_SCORE: Number(chain[0].RISK_SCORE) || 0,
      SIGNAL_COUNT: Number(chain[0].SIGNAL_COUNT) || 0,
    } : null;

    return NextResponse.json({ signals: coercedSignals, chain: coercedChain });
  } catch (err) {
    return NextResponse.json({ signals: [], chain: null, error: (err as Error).message });
  }
}
