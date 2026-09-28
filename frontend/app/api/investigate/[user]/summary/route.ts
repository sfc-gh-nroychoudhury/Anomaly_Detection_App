import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  try {
    const { rows } = await runQuery('CALL trust_center.summarize_user_activity(?, 7)', [
      { type: 'TEXT', value: userName },
    ]);
    const raw = String(rows[0]?.[0] ?? '{}');

    // Extract JSON object from LLM response (may have markdown fences or prose)
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({ summary: parsed });
    } catch {
      // Fallback: return raw text in a basic structure
      return NextResponse.json({
        summary: {
          risk_level: 'medium',
          headline: 'Activity summary generated.',
          findings: [{ label: 'Activity', detail: raw }],
          recommendation: 'Review the user activity details above.',
        },
      });
    }
  } catch (err) {
    return NextResponse.json(
      { summary: null, error: (err as Error).message },
      { status: 200 },
    );
  }
}
