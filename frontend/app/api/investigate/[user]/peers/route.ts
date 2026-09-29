import { NextResponse } from 'next/server';
import { runQueryAsObjects } from '@/lib/snowflake';
import type { PeerComparisonRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  try {
    const rows = await runQueryAsObjects<PeerComparisonRow>(
      'CALL trust_center.get_peer_comparison(?)',
      [{ type: 'TEXT', value: userName }]
    );
    return NextResponse.json({
      rows: rows.map((r) => ({
        ...r,
        USER_VALUE: Number(r.USER_VALUE) || 0,
        PEER_AVG: Number(r.PEER_AVG) || 0,
        PEER_P95: Number(r.PEER_P95) || 0,
        PEER_MAX: Number(r.PEER_MAX) || 0,
      })),
    });
  } catch (err) {
    return NextResponse.json({ rows: [], error: (err as Error).message });
  }
}
