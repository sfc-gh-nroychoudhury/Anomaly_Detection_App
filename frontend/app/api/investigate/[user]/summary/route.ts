import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  try {
    const { rows } = await runQuery('CALL trust_center.summarize_user_activity(?, 7)', [
      { type: 'TEXT', value: userName },
    ]);
    return NextResponse.json({ summary: rows[0]?.[0] ?? '' });
  } catch (err) {
    return NextResponse.json({ summary: '', error: (err as Error).message }, { status: 200 });
  }
}
