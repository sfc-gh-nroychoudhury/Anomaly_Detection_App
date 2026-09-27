'use client';

import { useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import type { AnomalyResultRow, AttackChainRow } from '@/lib/types';

export default function StreamingNarrative({
  userName,
  signals,
  chain,
}: {
  userName: string;
  signals: AnomalyResultRow[];
  chain: AttackChainRow | null;
}) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function start() {
    setText('');
    setError(null);
    setStreaming(true);
    abortRef.current = new AbortController();

    const signalSummary = signals
      .filter((s) => s.IS_ANOMALY && s.DISTANCE > 0)
      .map((s) => `${s.MODEL_NAME}: actual=${Number(s.METRIC_VALUE).toFixed(1)} vs forecast=${Number(s.FORECAST).toFixed(1)} (distance=${Number(s.DISTANCE).toFixed(2)})`)
      .join('; ');

    try {
      const res = await fetch(`/api/investigate/${encodeURIComponent(userName)}/explain-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalSummary, querySummary: chain?.ATTACK_CHAIN ?? '' }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        setError(`Streaming request failed (${res.status})`);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            if (json.error) setError(json.error);
            if (json.delta) setText((t) => t + json.delta);
          } catch {
            // ignore partial chunk
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="sf-card mb-6 border-l-4 border-l-sf-blue px-5 py-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="sf-section-title">
          <Sparkles size={15} className="text-sf-blue-dark" />
          Cortex AI narrative
        </div>
        <button onClick={start} disabled={streaming} className="sf-btn-secondary py-1.5 text-xs">
          {streaming ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {streaming ? 'Streaming…' : text ? 'Regenerate' : 'Generate'}
        </button>
      </div>
      {error && <p className="text-sm text-severity-critical">{error}</p>}
      {!error && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-sf-ink">
          {text || (streaming ? '' : 'Streams a live, per-user security narrative token-by-token from Cortex, grounded in this week\u2019s flagged signals.')}
          {streaming && <span className="ml-0.5 inline-block w-1.5 animate-pulse bg-sf-blue align-middle">&nbsp;</span>}
        </p>
      )}
    </div>
  );
}
