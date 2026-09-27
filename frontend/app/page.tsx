'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, ChevronRight, Users, AlertTriangle, Flame, Link2, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import SeverityBadge from '@/components/SeverityBadge';
import AttackChainChip from '@/components/AttackChainChip';
import RiskScoreBar from '@/components/RiskScoreBar';
import EmptyState from '@/components/EmptyState';
import type { AttackChainRow, Severity } from '@/lib/types';

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export default function DashboardPage() {
  const [rows, setRows] = useState<AttackChainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/attack-chains');
    const json = await res.json();
    setRows(json.rows ?? []);
    setError(json.error ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    rows.forEach((r) => (c[r.SEVERITY] = (c[r.SEVERITY] ?? 0) + 1));
    return c;
  }, [rows]);

  const filtered = useMemo(
    () => (severityFilter === 'ALL' ? rows : rows.filter((r) => r.SEVERITY === severityFilter)),
    [rows, severityFilter]
  );

  return (
    <div>
      <PageHeader
        title="Risk Dashboard"
        description="Users flagged by ML behavioral anomaly detection in the most recent scan."
        actions={
          <button onClick={load} className="sf-btn-secondary" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {error && (
        <div className="sf-card mb-6 border-severity-medium/30 bg-severity-medium/5 px-4 py-3 text-sm text-sf-ink">
          Couldn&apos;t load results yet ({error}). This is expected before one-time setup is
          complete —{' '}
          <Link href="/setup" className="font-medium text-sf-blue-dark underline">
            finish setup
          </Link>
          .
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Flagged users" value={rows.length} accent="blue" icon={Users} />
        <StatCard label="Critical" value={counts.CRITICAL} accent="critical" icon={Flame} />
        <StatCard label="High" value={counts.HIGH} icon={AlertTriangle} />
        <StatCard label="Top attack chain" value={topAttackChain(rows)} icon={Link2} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        {(['ALL', ...SEVERITY_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className={clsx(
              'sf-pill border',
              severityFilter === s
                ? 'border-sf-blue bg-sf-blue-tint text-sf-blue-dark'
                : 'border-sf-line bg-sf-surface text-sf-slate hover:text-sf-ink'
            )}
          >
            {s === 'ALL' ? 'All severities' : s}
          </button>
        ))}
      </div>

      {filtered.length === 0 && !loading && !error ? (
        <EmptyState
          icon={ShieldCheck}
          title="No anomalies in the most recent scan"
          description="Clean bill of health — nothing flagged for this severity filter."
        />
      ) : (
        <div className="sf-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sf-line bg-sf-mist/60 text-left text-xs font-medium uppercase tracking-wide text-sf-slate">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Risk score</th>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">Attack chain</th>
                <th className="px-5 py-3">Signals</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.USER_NAME}
                  className="group border-b border-sf-line last:border-0 transition-colors hover:bg-sf-blue-tint/40"
                >
                  <td className="px-5 py-3.5 font-medium text-sf-ink">{row.USER_NAME}</td>
                  <td className="px-5 py-3.5">
                    <RiskScoreBar score={row.RISK_SCORE} />
                  </td>
                  <td className="px-5 py-3.5">
                    <SeverityBadge severity={row.SEVERITY} />
                  </td>
                  <td className="px-5 py-3.5">
                    <AttackChainChip chain={row.ATTACK_CHAIN} />
                  </td>
                  <td className="px-5 py-3.5 text-sf-slate">{row.SIGNAL_COUNT} models</td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/investigate/${encodeURIComponent(row.USER_NAME)}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-sf-blue-dark opacity-70 transition-opacity group-hover:opacity-100"
                    >
                      Investigate <ChevronRight size={14} />
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

function topAttackChain(rows: AttackChainRow[]): string {
  if (rows.length === 0) return '—';
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(r.ATTACK_CHAIN, (counts.get(r.ATTACK_CHAIN) ?? 0) + 1));
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return top ? top[0].replace(/_/g, ' ') : '—';
}
