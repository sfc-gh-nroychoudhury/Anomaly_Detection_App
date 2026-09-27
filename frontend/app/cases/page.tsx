'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, RefreshCw, FolderOpen, FolderClock, FolderCheck } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import SeverityBadge from '@/components/SeverityBadge';
import EmptyState from '@/components/EmptyState';
import type { CaseRow, CaseStatus } from '@/lib/types';

const STATUS_FILTERS: (CaseStatus | 'ALL')[] = ['ALL', 'OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];

export default function CasesPage() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'ALL'>('ALL');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/cases');
    const json = await res.json();
    setRows(json.rows ?? []);
    setError(json.error ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => (statusFilter === 'ALL' ? rows : rows.filter((r) => r.STATUS === statusFilter)),
    [rows, statusFilter]
  );

  return (
    <div>
      <PageHeader
        title="Cases"
        description="Investigation cases opened from the Investigate page's Case tab."
        actions={
          <button onClick={load} className="sf-btn-secondary" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {error && (
        <div className="sf-card mb-6 border-severity-medium/30 bg-severity-medium/5 px-4 py-3 text-sm text-sf-ink">
          Couldn&apos;t load cases yet ({error}). Complete setup first.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total cases" value={rows.length} accent="blue" icon={FolderOpen} />
        <StatCard label="Open" value={rows.filter((r) => r.STATUS === 'OPEN').length} icon={FolderOpen} />
        <StatCard label="Investigating" value={rows.filter((r) => r.STATUS === 'INVESTIGATING').length} icon={FolderClock} />
        <StatCard label="Resolved" value={rows.filter((r) => r.STATUS === 'RESOLVED').length} icon={FolderCheck} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              'sf-pill border',
              statusFilter === s
                ? 'border-sf-blue bg-sf-blue-tint text-sf-blue-dark'
                : 'border-sf-line bg-sf-surface text-sf-slate hover:text-sf-ink'
            )}
          >
            {s === 'ALL' ? 'All statuses' : s}
          </button>
        ))}
      </div>

      {!loading && filtered.length === 0 && !error ? (
        <EmptyState
          icon={FolderOpen}
          title="No cases yet"
          description="Open a case from any flagged user's Investigate → Case tab to start tracking it here."
        />
      ) : (
        <div className="sf-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sf-line bg-sf-mist/60 text-left text-xs font-medium uppercase tracking-wide text-sf-slate">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Priority</th>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">Assigned to</th>
                <th className="px-5 py-3">Opened</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.CASE_ID} className="group border-b border-sf-line last:border-0 transition-colors hover:bg-sf-blue-tint/40">
                  <td className="px-5 py-3.5 font-medium text-sf-ink">{r.USER_NAME}</td>
                  <td className="px-5 py-3.5">
                    <span className="sf-pill border border-sf-line bg-sf-mist text-sf-ink">{r.STATUS}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sf-slate">{r.PRIORITY}</td>
                  <td className="px-5 py-3.5">{r.SEVERITY && <SeverityBadge severity={r.SEVERITY} />}</td>
                  <td className="px-5 py-3.5 text-sf-slate">{r.ASSIGNED_TO ?? '—'}</td>
                  <td className="px-5 py-3.5 text-sf-slate">{new Date(r.CREATED_AT).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/investigate/${encodeURIComponent(r.USER_NAME)}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-sf-blue-dark opacity-70 transition-opacity group-hover:opacity-100"
                    >
                      Open <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
