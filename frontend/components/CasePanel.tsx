'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, FolderOpen } from 'lucide-react';
import type { CaseNoteRow, CaseRow, CasePriority, CaseStatus, AttackChainRow } from '@/lib/types';
import ResponseActions from './ResponseActions';
import EmptyState from './EmptyState';
import Skeleton from './Skeleton';

const STATUSES: CaseStatus[] = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];
const PRIORITIES: CasePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function CasePanel({ userName, chain }: { userName: string; chain: AttackChainRow | null }) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [notes, setNotes] = useState<CaseNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const activeCase = cases[0] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/cases?user=${encodeURIComponent(userName)}`);
    const json = await res.json();
    setCases(json.rows ?? []);
    setLoading(false);
  }, [userName]);

  const loadNotes = useCallback(async (caseId: string) => {
    const res = await fetch(`/api/cases/${caseId}`);
    const json = await res.json();
    setNotes(json.notes ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeCase) {
      setSummaryDraft(activeCase.SUMMARY ?? '');
      loadNotes(activeCase.CASE_ID);
    }
  }, [activeCase, loadNotes]);

  async function openCase() {
    await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName,
        attackChain: chain?.ATTACK_CHAIN,
        severity: chain?.SEVERITY,
        priority: chain?.SEVERITY === 'CRITICAL' ? 'URGENT' : chain?.SEVERITY === 'HIGH' ? 'HIGH' : 'MEDIUM',
      }),
    });
    await load();
  }

  async function patchCase(fields: Partial<{ status: CaseStatus; priority: CasePriority; assignedTo: string; summary: string }>) {
    if (!activeCase) return;
    setSaving(true);
    await fetch(`/api/cases/${activeCase.CASE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    await load();
    setSaving(false);
  }

  async function addNote() {
    if (!activeCase || !noteText.trim()) return;
    await fetch(`/api/cases/${activeCase.CASE_ID}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: noteText }),
    });
    setNoteText('');
    await loadNotes(activeCase.CASE_ID);
  }

  if (loading) return <Skeleton height={140} />;

  if (!activeCase) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No case has been opened for this user yet"
        description="Open a case to track investigation status, assign an owner, and log response actions."
        action={
          <button onClick={openCase} className="sf-btn-primary">
            <Plus size={15} /> Open case
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="sf-card px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs text-sf-slate">
            Case <span className="font-mono text-sf-ink">{activeCase.CASE_ID.slice(0, 8)}</span> · opened{' '}
            {new Date(activeCase.CREATED_AT).toLocaleDateString()}
          </div>
          <PriorityPill priority={activeCase.PRIORITY} />
        </div>
        <div className="mb-4 grid grid-cols-3 gap-4">
          <Field label="Status">
            <select
              value={activeCase.STATUS}
              onChange={(e) => patchCase({ status: e.target.value as CaseStatus })}
              className="sf-input text-sm"
              disabled={saving}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={activeCase.PRIORITY}
              onChange={(e) => patchCase({ priority: e.target.value as CasePriority })}
              className="sf-input text-sm"
              disabled={saving}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned to">
            <input
              defaultValue={activeCase.ASSIGNED_TO ?? ''}
              onBlur={(e) => patchCase({ assignedTo: e.target.value })}
              placeholder="Unassigned"
              className="sf-input text-sm"
            />
          </Field>
        </div>
        <Field label="Summary">
          <div className="flex gap-2">
            <textarea
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              rows={2}
              className="sf-input text-sm"
              placeholder="What's going on with this case?"
            />
            <button
              onClick={() => patchCase({ summary: summaryDraft })}
              className="sf-btn-secondary self-start"
              disabled={saving}
            >
              <Save size={14} />
            </button>
          </div>
        </Field>
      </div>

      <ResponseActions userName={userName} caseId={activeCase.CASE_ID} onExecuted={load} />

      <div className="sf-card px-5 py-5">
        <div className="sf-section-title mb-3">Notes</div>
        <div className="mb-3 space-y-2">
          {notes.map((n) => (
            <div key={n.NOTE_ID} className="rounded-md border border-sf-line bg-sf-mist/50 px-3.5 py-2.5 text-sm">
              <div className="mb-0.5 text-xs text-sf-slate">
                {n.AUTHOR ?? 'Analyst'} · {new Date(n.CREATED_AT).toLocaleString()}
              </div>
              <div className="text-sf-ink">{n.NOTE}</div>
            </div>
          ))}
          {notes.length === 0 && <p className="text-sm text-sf-slate">No notes yet.</p>}
        </div>
        <div className="flex gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNote()}
            placeholder="Add a note…"
            className="sf-input text-sm"
          />
          <button onClick={addNote} className="sf-btn-secondary">Add</button>
        </div>
      </div>
    </div>
  );
}

function PriorityPill({ priority }: { priority: CasePriority }) {
  const styles: Record<CasePriority, string> = {
    LOW: 'bg-sf-mist text-sf-slate',
    MEDIUM: 'bg-risk-mid/10 text-risk-mid',
    HIGH: 'bg-risk-high/10 text-risk-high',
    URGENT: 'bg-severity-critical/10 text-severity-critical',
  };
  return <span className={`sf-pill ${styles[priority]}`}>{priority} priority</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="sf-eyebrow mb-1.5">{label}</div>
      {children}
    </label>
  );
}
