import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

// Tier A actions execute directly against the app's own schema (no privileges
// beyond what the app already owns). Tier B actions generate a SQL script for
// a human admin to review and run manually against the consumer's account --
// this app has no grant to ALTER USER / REVOKE on objects outside itself, so
// it can only assist, not execute, those actions.
function buildTierBScript(actionType: string, userName: string): string {
  switch (actionType) {
    case 'DISABLE_USER':
      return `-- Run as a role with ownership on the user object.\nALTER USER "${userName}" SET DISABLED = TRUE;`;
    case 'FORCE_PASSWORD_RESET':
      return `-- Run as a role with ownership on the user object.\nALTER USER "${userName}" SET MUST_CHANGE_PASSWORD = TRUE;`;
    case 'REVOKE_ROLES':
      return `-- Review SHOW GRANTS output before revoking.\nSHOW GRANTS TO USER "${userName}";\n-- REVOKE ROLE <role_name> FROM USER "${userName}";`;
    default:
      return `-- No canned script for action type "${actionType}".`;
  }
}

export async function POST(req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  const { actionType, tier, caseId, reason, createdBy } = await req.json();

  try {
    if (tier === 'A') {
      if (actionType === 'EXCLUDE_USER') {
        await runQuery(
          `INSERT INTO trust_center.scan_exclusions (entity_name, entity_type, reason, approved_by) VALUES (?, 'USER', ?, ?)`,
          [
            { type: 'TEXT', value: userName },
            { type: 'TEXT', value: reason ?? 'Excluded from Investigate page' },
            { type: 'TEXT', value: createdBy ?? 'Analyst' },
          ]
        );
      } else if (actionType === 'RESOLVE_CASE' && caseId) {
        await runQuery(
          `UPDATE trust_center.cases SET status = 'RESOLVED', updated_at = CURRENT_TIMESTAMP(), closed_at = CURRENT_TIMESTAMP() WHERE case_id = ?`,
          [{ type: 'TEXT', value: caseId }]
        );
      }
      await runQuery(
        `INSERT INTO trust_center.response_actions (case_id, user_name, action_type, tier, status, created_by) VALUES (?, ?, ?, 'A', 'EXECUTED', ?)`,
        [
          { type: 'TEXT', value: caseId ?? '' },
          { type: 'TEXT', value: userName },
          { type: 'TEXT', value: actionType },
          { type: 'TEXT', value: createdBy ?? 'Analyst' },
        ]
      );
      return NextResponse.json({ ok: true, executed: true });
    }

    // Tier B: generate the script and log that it was generated.
    const scriptText = buildTierBScript(actionType, userName);
    await runQuery(
      `INSERT INTO trust_center.response_actions (case_id, user_name, action_type, tier, status, script_text, created_by) VALUES (?, ?, ?, 'B', 'GENERATED', ?, ?)`,
      [
        { type: 'TEXT', value: caseId ?? '' },
        { type: 'TEXT', value: userName },
        { type: 'TEXT', value: actionType },
        { type: 'TEXT', value: scriptText },
        { type: 'TEXT', value: createdBy ?? 'Analyst' },
      ]
    );
    return NextResponse.json({ ok: true, executed: false, scriptText });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
