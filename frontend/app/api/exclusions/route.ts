import { NextResponse } from 'next/server';
import { runQueryAsObjects } from '@/lib/snowflake';
import type { ScanExclusion } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await runQueryAsObjects<ScanExclusion>(
      `SELECT ENTITY_NAME, ENTITY_TYPE, REASON, APPROVED_BY, APPROVED_ON, EXPIRES_ON
       FROM trust_center.scan_exclusions
       ORDER BY APPROVED_ON DESC`
    );
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ rows: [], error: (err as Error).message });
  }
}
