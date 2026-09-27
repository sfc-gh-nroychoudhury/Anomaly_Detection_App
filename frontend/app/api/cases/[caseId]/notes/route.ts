import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { caseId: string } }) {
  const { caseId } = params;
  const { author, note } = await req.json();
  try {
    await runQuery(
      `INSERT INTO trust_center.case_notes (case_id, author, note) VALUES (?, ?, ?)`,
      [
        { type: 'TEXT', value: caseId },
        { type: 'TEXT', value: author ?? 'Analyst' },
        { type: 'TEXT', value: note },
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
