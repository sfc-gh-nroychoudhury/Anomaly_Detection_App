import { NextResponse } from 'next/server';
import { runQueryAsObjects } from '@/lib/snowflake';
import type { DriftSeriesRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  try {
    const rows = await runQueryAsObjects<DriftSeriesRow>(
      'CALL trust_center.get_drift_series(?)',
      [{ type: 'TEXT', value: userName }]
    );
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ rows: [], error: (err as Error).message });
  }
}
