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
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ rows: [], error: (err as Error).message });
  }
}
