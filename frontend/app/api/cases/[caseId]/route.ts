import { NextResponse } from 'next/server';
import { runQuery, runQueryAsObjects } from '@/lib/snowflake';
import type { CaseNoteRow, CaseRow, ResponseActionRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { caseId: string } }) {
  const { caseId } = params;
  try {
    const [caseRows, notes, actions] = await Promise.all([
      runQueryAsObjects<CaseRow>(
        `SELECT CASE_ID, USER_NAME, ATTACK_CHAIN, SEVERITY, STATUS, PRIORITY, ASSIGNED_TO, SUMMARY, CREATED_AT, UPDATED_AT, CLOSED_AT
         FROM trust_center.cases WHERE CASE_ID = ?`,
        [{ type: 'TEXT', value: caseId }]
      ),
      runQueryAsObjects<CaseNoteRow>(
        `SELECT NOTE_ID, CASE_ID, AUTHOR, NOTE, CREATED_AT FROM trust_center.case_notes WHERE CASE_ID = ? ORDER BY CREATED_AT ASC`,
        [{ type: 'TEXT', value: caseId }]
      ),
      runQueryAsObjects<ResponseActionRow>(
        `SELECT ACTION_ID, CASE_ID, USER_NAME, ACTION_TYPE, TIER, STATUS, SCRIPT_TEXT, CREATED_BY, CREATED_AT
         FROM trust_center.response_actions WHERE CASE_ID = ? ORDER BY CREATED_AT DESC`,
        [{ type: 'TEXT', value: caseId }]
      ),
    ]);
    return NextResponse.json({ case: caseRows[0] ?? null, notes, actions });
  } catch (err) {
    return NextResponse.json({ case: null, notes: [], actions: [], error: (err as Error).message });
  }
}

export async function PATCH(req: Request, { params }: { params: { caseId: string } }) {
  const { caseId } = params;
  const { status, priority, assignedTo, summary } = await req.json();
  const closing = status === 'RESOLVED' || status === 'DISMISSED';

  const sets: string[] = [];
  const binds: Array<{ type: string; value: string }> = [];
  if (status) {
    sets.push('status = ?');
    binds.push({ type: 'TEXT', value: status });
  }
  if (priority) {
    sets.push('priority = ?');
    binds.push({ type: 'TEXT', value: priority });
  }
  if (assignedTo !== undefined) {
    sets.push('assigned_to = ?');
    binds.push({ type: 'TEXT', value: assignedTo ?? '' });
  }
  if (summary !== undefined) {
    sets.push('summary = ?');
    binds.push({ type: 'TEXT', value: summary ?? '' });
  }
  sets.push('updated_at = CURRENT_TIMESTAMP()');
  if (closing) sets.push('closed_at = CURRENT_TIMESTAMP()');

  try {
    await runQuery(
      `UPDATE trust_center.cases SET ${sets.join(', ')} WHERE case_id = ?`,
      [...binds, { type: 'TEXT', value: caseId }]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
