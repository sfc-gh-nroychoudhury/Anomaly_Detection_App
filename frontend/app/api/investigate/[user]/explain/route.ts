import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

// Calls the existing trust_center.explain_anomaly SQL procedure (sql/05_cortex_ai_procs.sql)
// rather than duplicating prompt-construction logic in the frontend. A follow-up
// enhancement could swap this for true token-by-token streaming via the Cortex
// REST inference API (`/api/v2/cortex/inference:complete` with `stream: true`),
// using the same OAuth token as lib/snowflake.ts -- kept out of this pass to
// avoid maintaining two separate LLM-calling code paths for a first cut.
export async function POST(_req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  try {
    const { rows } = await runQuery('CALL trust_center.explain_anomaly(?)', [
      { type: 'TEXT', value: userName },
    ]);
    return NextResponse.json({ narrative: rows[0]?.[0] ?? '' });
  } catch (err) {
    return NextResponse.json({ narrative: '', error: (err as Error).message }, { status: 200 });
  }
}
