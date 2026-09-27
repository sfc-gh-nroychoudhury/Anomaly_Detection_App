'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import type { ScanExclusion } from '@/lib/types';

export default function ExclusionsPage() {
  const [rows, setRows] = useState<ScanExclusion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ entityName: '', reason: '', approvedBy: '', expiresOn: '' });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch('/api/exclusions');
    const json = await res.json();
    setRows(json.rows ?? []);
    setError(json.error ?? null);
  }

  useEffect(() => {
    load();
  }, []);

  async function addExclusion(e: React.FormEvent) {
    e.preventDefault();
    if (!form.entityName) return;
    setSubmitting(true);
    await fetch('/api/exclusions/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ entityName: '', reason: '', approvedBy: '', expiresOn: '' });
    setSubmitting(false);
    load();
  }

  async function removeExclusion(entityName: string) {
    await fetch('/api/exclusions/manage', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityName }),
    });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Exclusions"
        description="Approved exceptions are filtered out of every scan before findings are generated. Optional expiry for time-boxed approvals."
      />

      {error && (
        <div className="sf-card mb-6 border-severity-medium/30 bg-severity-medium/5 px-4 py-3 text-sm text-sf-ink">
          Couldn&apos;t load exclusions yet ({error}). Complete setup first.
        </div>
      )}

      <form onSubmit={addExclusion} className="sf-card mb-6 grid grid-cols-5 gap-3 px-5 py-4">
        <input
          className="sf-input col-span-1"
          placeholder="Username"
          value={form.entityName}
          onChange={(e) => setForm({ ...form, entityName: e.target.value })}
          required
        />
        <input
          className="sf-input col-span-2"
          placeholder="Reason"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        <input
          className="sf-input col-span-1"
          placeholder="Approved by"
          value={form.approvedBy}
          onChange={(e) => setForm({ ...form, approvedBy: e.target.value })}
        />
        <input
          type="date"
          className="sf-input col-span-1"
          value={form.expiresOn}
          onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
          title="Optional expiry -- leave blank for a permanent exclusion"
        />
        <button type="submit" className="sf-btn-primary col-span-5 justify-center" disabled={submitting}>
          <Plus size={15} /> Add exclusion
        </button>
      </form>

      <div className="sf-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sf-line bg-sf-mist/60 text-left text-xs font-medium uppercase tracking-wide text-sf-slate">
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Reason</th>
              <th className="px-5 py-3">Approved by</th>
              <th className="px-5 py-3">Expires</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ENTITY_NAME} className="border-b border-sf-line last:border-0">
                <td className="px-5 py-3 font-medium text-sf-ink">{r.ENTITY_NAME}</td>
                <td className="px-5 py-3 text-sf-slate">{r.REASON ?? '—'}</td>
                <td className="px-5 py-3 text-sf-slate">{r.APPROVED_BY ?? '—'}</td>
                <td className="px-5 py-3 text-sf-slate">
                  {r.EXPIRES_ON ? new Date(r.EXPIRES_ON).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => removeExclusion(r.ENTITY_NAME)}
                    className="text-sf-slate hover:text-severity-critical"
                    title="Remove exclusion"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sf-slate">
                  No exclusions configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
