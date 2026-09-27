import { NextResponse } from 'next/server';
import { runQuery, runQueryAsObjects } from '@/lib/snowflake';
import type { CaseRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userName = searchParams.get('user');
  try {
    const rows = await runQueryAsObjects<CaseRow>(
      userName
        ? `SELECT CASE_ID, USER_NAME, ATTACK_CHAIN, SEVERITY, STATUS, PRIORITY, ASSIGNED_TO, SUMMARY, CREATED_AT, UPDATED_AT, CLOSED_AT
           FROM trust_center.cases WHERE USER_NAME = ? ORDER BY CREATED_AT DESC`
        : `SELECT CASE_ID, USER_NAME, ATTACK_CHAIN, SEVERITY, STATUS, PRIORITY, ASSIGNED_TO, SUMMARY, CREATED_AT, UPDATED_AT, CLOSED_AT
           FROM trust_center.cases ORDER BY CREATED_AT DESC`,
      userName ? [{ type: 'TEXT', value: userName }] : []
    );
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ rows: [], error: (err as Error).message });
  }
}

export async function POST(req: Request) {
  const { userName, attackChain, severity, priority, summary, assignedTo } = await req.json();
  try {
    await runQuery(
      `INSERT INTO trust_center.cases (user_name, attack_chain, severity, priority, summary, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        { type: 'TEXT', value: userName },
        { type: 'TEXT', value: attackChain ?? '' },
        { type: 'TEXT', value: severity ?? '' },
        { type: 'TEXT', value: priority ?? 'MEDIUM' },
        { type: 'TEXT', value: summary ?? '' },
        { type: 'TEXT', value: assignedTo ?? '' },
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
