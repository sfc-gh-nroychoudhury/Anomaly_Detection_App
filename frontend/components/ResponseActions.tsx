'use client';

import { useState } from 'react';
import { ShieldOff, CheckCircle2, KeyRound, Users, Copy, Check, Loader2 } from 'lucide-react';

const TIER_A_ACTIONS = [
  { type: 'EXCLUDE_USER', label: 'Exclude from future scans', icon: ShieldOff },
  { type: 'RESOLVE_CASE', label: 'Mark case resolved', icon: CheckCircle2 },
];

const TIER_B_ACTIONS = [
  { type: 'DISABLE_USER', label: 'Disable user login', icon: ShieldOff },
  { type: 'FORCE_PASSWORD_RESET', label: 'Force password reset', icon: KeyRound },
  { type: 'REVOKE_ROLES', label: 'Review & revoke roles', icon: Users },
];

export default function ResponseActions({
  userName,
  caseId,
  onExecuted,
}: {
  userName: string;
  caseId?: string | null;
  onExecuted?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  async function runTierA(actionType: string) {
    setBusy(actionType);
    await fetch(`/api/investigate/${encodeURIComponent(userName)}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType, tier: 'A', caseId }),
    });
    setBusy(null);
    onExecuted?.();
  }

  async function generateTierB(actionType: string) {
    setBusy(actionType);
    const res = await fetch(`/api/investigate/${encodeURIComponent(userName)}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType, tier: 'B', caseId }),
    });
    const json = await res.json();
    if (json.scriptText) setScripts((s) => ({ ...s, [actionType]: json.scriptText }));
    setBusy(null);
  }

  async function copyScript(actionType: string) {
    const script = scripts[actionType];
    if (!script) return;
    await navigator.clipboard.writeText(script);
    setCopied(actionType);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="sf-card px-5 py-5">
      <div className="sf-section-title mb-4">Response actions</div>

      <div className="mb-5">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="sf-pill bg-risk-low/10 text-risk-low">Tier A</span>
          <span className="text-xs text-sf-slate">Executed directly by the app</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {TIER_A_ACTIONS.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => runTierA(type)}
              disabled={busy === type || (type === 'RESOLVE_CASE' && !caseId)}
              className="sf-btn-secondary text-xs"
            >
              {busy === type ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-center gap-2">
          <span className="sf-pill bg-risk-mid/10 text-risk-mid">Tier B</span>
          <span className="text-xs text-sf-slate">Generates a script for manual review — nothing runs automatically</span>
        </div>
        <div className="space-y-2.5">
          {TIER_B_ACTIONS.map(({ type, label, icon: Icon }) => (
            <div key={type}>
              <button
                onClick={() => generateTierB(type)}
                disabled={busy === type}
                className="sf-btn-secondary text-xs"
              >
                {busy === type ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                {label}
              </button>
              {scripts[type] && (
                <div className="mt-2 flex items-start gap-2">
                  <pre className="sf-code flex-1 overflow-x-auto whitespace-pre-wrap">{scripts[type]}</pre>
                  <button onClick={() => copyScript(type)} className="sf-btn-secondary shrink-0 text-xs">
                    {copied === type ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
