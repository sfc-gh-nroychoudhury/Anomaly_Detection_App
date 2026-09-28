import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

interface RemediationStep {
  title: string;
  description: string;
  sql: string | null;
  priority: 'immediate' | 'short_term' | 'long_term';
}

export async function POST(req: Request, { params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  const { attackChain, signals } = await req.json();
  try {
    const { rows } = await runQuery('CALL trust_center.recommend_remediation(?, ?, SPLIT(?, \',\'))', [
      { type: 'TEXT', value: userName },
      { type: 'TEXT', value: attackChain ?? 'behavioral_anomaly' },
      { type: 'TEXT', value: Array.isArray(signals) ? signals.join(',') : String(signals ?? '') },
    ]);
    const raw = String(rows[0]?.[0] ?? '[]');

    // The LLM may wrap JSON in markdown fences or add prose — extract the JSON array
    let cleaned = raw.trim();
    // Strip markdown code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    // Find the first [ and last ] to extract the JSON array
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
    let steps: RemediationStep[];
    try {
      steps = JSON.parse(cleaned);
      if (!Array.isArray(steps)) steps = [];
    } catch {
      // Fallback: return raw text as a single step
      steps = [{ title: 'Remediation guidance', description: raw, sql: null, priority: 'immediate' }];
    }

    return NextResponse.json({ steps });
  } catch (err) {
    return NextResponse.json({ steps: [], error: (err as Error).message }, { status: 200 });
  }
}
