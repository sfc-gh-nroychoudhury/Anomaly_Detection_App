import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { entityName, reason, approvedBy, expiresOn } = await req.json();
  try {
    await runQuery(
      `INSERT INTO trust_center.scan_exclusions (entity_name, entity_type, reason, approved_by, expires_on)
       VALUES (?, 'USER', ?, ?, ${expiresOn ? '?' : 'NULL'})`,
      [
        { type: 'TEXT', value: entityName },
        { type: 'TEXT', value: reason ?? '' },
        { type: 'TEXT', value: approvedBy ?? '' },
        ...(expiresOn ? [{ type: 'TEXT', value: expiresOn }] : []),
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}

export async function DELETE(req: Request) {
  const { entityName } = await req.json();
  try {
    await runQuery('DELETE FROM trust_center.scan_exclusions WHERE entity_name = ?', [
      { type: 'TEXT', value: entityName },
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
