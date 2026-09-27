import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  const { attackChain, signals } = await req.json();
  try {
    const { rows } = await runQuery('CALL trust_center.recommend_remediation(?, ?, SPLIT(?, \',\'))', [
      { type: 'TEXT', value: userName },
      { type: 'TEXT', value: attackChain ?? 'behavioral_anomaly' },
      { type: 'TEXT', value: (signals ?? []).join(',') },
    ]);
    return NextResponse.json({ remediation: rows[0]?.[0] ?? '' });
  } catch (err) {
    return NextResponse.json({ remediation: '', error: (err as Error).message }, { status: 200 });
  }
}
