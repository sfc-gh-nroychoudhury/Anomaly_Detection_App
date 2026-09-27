'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Copy, RefreshCw, Check, ExternalLink, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '@/components/PageHeader';
import type { SetupCheck } from '@/lib/types';

export default function SetupPage() {
  const [checks, setChecks] = useState<SetupCheck[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/setup-status');
    const json = await res.json();
    setChecks(json.checks ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const allDone = checks.length > 0 && checks.every((c) => c.status === 'ok');

  return (
    <div>
      <PageHeader
        title="One-time setup"
        description="One-time steps, live-checked below. Most are Snowflake platform requirements no app can automate (explicit consent is required before an app can read account-activity data or register with Trust Center); the last connects the ML models, which must be installed outside the app -- see that step for why."
        actions={
          <button onClick={load} className="sf-btn-secondary" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Re-check
          </button>
        }
      />

      {allDone && (
        <div className="sf-card mb-6 border-risk-low/30 bg-risk-low/5 px-4 py-3 text-sm font-medium text-risk-low">
          All set — the app is fully configured. Head to the Dashboard.
        </div>
      )}

      <div className="space-y-3">
        {checks.map((check, i) => (
          <CheckRow key={check.id} index={i + 1} check={check} />
        ))}
        {loading && checks.length === 0 && (
          <div className="sf-card px-5 py-8 text-center text-sf-slate">Checking setup status…</div>
        )}
      </div>
    </div>
  );
}

function CheckRow({ index, check }: { index: number; check: SetupCheck }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="sf-card px-5 py-4">
      <div className="flex items-start gap-3">
        {check.status === 'ok' ? (
          <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0 text-risk-low" />
        ) : (
          <Circle size={20} className="mt-0.5 flex-shrink-0 text-sf-line" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-sf-slate">Step {index}</span>
          </div>
          <div
            className={clsx(
              'text-sm font-medium',
              check.status === 'ok' ? 'text-sf-ink' : 'text-sf-midnight'
            )}
          >
            {check.label}
          </div>
          {check.detail && <p className="mt-1 text-sm text-sf-slate">{check.detail}</p>}

          {check.downloadUrl && (
            <a
              href={check.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-sf-blue-dark underline"
            >
              <ExternalLink size={14} />
              Open install_external_ml.sql
            </a>
          )}

          {check.sql && check.status !== 'ok' && (
            <div className="mt-3">
              <pre className="sf-code overflow-x-auto whitespace-pre-wrap">{check.sql}</pre>
              <button
                className="sf-btn-secondary mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(check.sql!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy SQL'}
              </button>
            </div>
          )}

          {check.sql && check.status === 'ok' && (
            <details className="mt-3 group">
              <summary className="cursor-pointer text-xs font-medium text-sf-slate flex items-center gap-1 select-none">
                <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                Show SQL
              </summary>
              <div className="mt-2 opacity-60">
                <pre className="sf-code overflow-x-auto whitespace-pre-wrap text-xs">{check.sql}</pre>
                <button
                  className="sf-btn-secondary mt-2"
                  onClick={() => {
                    navigator.clipboard.writeText(check.sql!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied' : 'Copy SQL'}
                </button>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
