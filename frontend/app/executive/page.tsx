'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  RefreshCw, Users, Flame, AlertTriangle, TrendingUp, Clock, Briefcase,
  ChevronRight,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts';
import PageHeader from '@/components/PageHeader';
import SeverityBadge from '@/components/SeverityBadge';
import AttackChainChip from '@/components/AttackChainChip';
import RiskScoreBar from '@/components/RiskScoreBar';
import type { Severity } from '@/lib/types';

const MODEL_LABELS: Record<string, string> = {
  ad_login_count: 'Login count', ad_failed_auth: 'Failed auth',
  ad_distinct_ips: 'Distinct IPs', ad_client_diversity: 'Client diversity',
  ad_query_volume: 'Query volume', ad_bytes_scanned: 'Bytes scanned',
  ad_bytes_to_result: 'Bytes to result', ad_rows_unloaded: 'Rows unloaded',
  ad_network_egress: 'Network egress', ad_db_breadth: 'DB breadth',
  ad_table_breadth: 'Table breadth', ad_failed_queries: 'Failed queries',
  ad_role_usage: 'Role usage', ad_ddl_operations: 'DDL operations',
  ad_grant_operations: 'Grant ops', ad_data_staging: 'Data staging',
  ad_outbound_transfer: 'Outbound transfer', ad_ext_function_calls: 'Ext functions',
  ad_warehouse_credits: 'WH credits', ad_warehouse_queries: 'WH queries',
  ad_cloud_services_credits: 'Cloud svc credits', ad_serverless_task_credits: 'Task credits',
  ad_pipe_credits: 'Pipe credits', ad_user_credits: 'User credits',
  ad_storage_growth: 'Storage growth',
};

const CHAIN_LABELS: Record<string, string> = {
  credential_theft_exfiltration: 'Credential Theft + Exfiltration',
  insider_data_theft: 'Insider Data Theft',
  privilege_escalation_attack: 'Privilege Escalation',
  account_takeover: 'Account Takeover',
  data_exfiltration: 'Data Exfiltration',
  privilege_abuse: 'Privilege Abuse',
  reconnaissance_activity: 'Reconnaissance',
  resource_hijacking: 'Resource Hijacking',
  behavioral_anomaly: 'Behavioral Anomaly',
  cost_abuse: 'Cost Abuse',
};

interface ExecData {
  kpis: {
    totalUsersMonitored: number;
    flaggedUsers: number;
    criticalAlerts: number;
    avgRiskScore: number;
    openCases: number;
    mttrHours: number | null;
  };
  dailyTrend: Array<{ day: string; anomalies: number; usersAffected: number }>;
  chainDistribution: Array<{ chain: string; count: number }>;
  modelSignals: Array<{ model: string; anomalies: number; avgDistance: number }>;
  topUsers: Array<{
    userName: string; riskScore: number; severity: string;
    attackChain: string; signalCount: number;
  }>;
}

function formatDay(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ExecutiveDashboard() {
  const [data, setData] = useState<ExecData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/executive');
      const json = await res.json();
      if (json.error) { setError(json.error); setData(null); }
      else setData(json);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sf-slate">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading executive overview...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title="Executive Risk Overview" description="Organization-wide security posture at a glance." />
        <div className="sf-card px-5 py-10 text-center text-sf-slate">
          <p>Could not load executive data{error ? `: ${error}` : ''}.</p>
          <Link href="/setup" className="mt-2 inline-block text-sm font-medium text-sf-blue-dark underline">
            Check setup
          </Link>
        </div>
      </div>
    );
  }

  const { kpis, dailyTrend, chainDistribution, modelSignals, topUsers } = data;

  return (
    <div>
      <PageHeader
        title="Executive Risk Overview"
        description="Organization-wide security posture at a glance."
        actions={
          <button onClick={load} className="sf-btn-secondary" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Users monitored" value={kpis.totalUsersMonitored} icon={Users} color="blue" />
        <KpiCard label="Flagged users" value={kpis.flaggedUsers} icon={AlertTriangle} color="orange" />
        <KpiCard label="Critical alerts" value={kpis.criticalAlerts} icon={Flame} color="red" />
        <KpiCard label="Avg risk score" value={kpis.avgRiskScore} icon={TrendingUp} color="red" />
        <KpiCard label="Open cases" value={kpis.openCases} icon={Briefcase} color="blue" />
        <KpiCard label="MTTR" value={kpis.mttrHours != null ? `${kpis.mttrHours}h` : '—'} icon={Clock} color="green" />
      </div>

      {/* 30-day Anomaly Trend */}
      <div className="sf-card mb-6 px-5 py-4">
        <h2 className="mb-1 text-sm font-semibold text-sf-ink">30-Day Anomaly Trend</h2>
        <p className="mb-4 text-xs text-sf-muted">Above-baseline anomaly events and affected users over time</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradAnomalies" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sf-line, #334155)" opacity={0.3} />
              <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11, fill: 'var(--sf-slate, #94a3b8)' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: 'var(--sf-slate, #94a3b8)' }} width={36} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--sf-surface, #0f172a)', border: '1px solid var(--sf-line, #334155)', borderRadius: 8, fontSize: 12 }}
                labelFormatter={formatDay}
              />
              <Area type="monotone" dataKey="anomalies" name="Anomalies" stroke="#ef4444" fill="url(#gradAnomalies)" strokeWidth={2} />
              <Area type="monotone" dataKey="usersAffected" name="Users affected" stroke="#f59e0b" fill="url(#gradUsers)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Middle row: Attack chains + Model signals */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Attack Chain Breakdown */}
        <div className="sf-card px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-sf-ink">Attack Chain Breakdown</h2>
          <p className="mb-4 text-xs text-sf-muted">Distribution of classified attack patterns</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chainDistribution} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sf-line, #334155)" opacity={0.3} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--sf-slate, #94a3b8)' }} allowDecimals={false} />
                <YAxis
                  dataKey="chain" type="category" width={160}
                  tick={{ fontSize: 11, fill: 'var(--sf-slate, #94a3b8)' }}
                  tickFormatter={(v: string) => CHAIN_LABELS[v] ?? v.replace(/_/g, ' ')}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--sf-surface, #0f172a)', border: '1px solid var(--sf-line, #334155)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v: string) => CHAIN_LABELS[v] ?? v}
                />
                <Bar dataKey="count" name="Users" radius={[0, 4, 4, 0]}>
                  {chainDistribution.map((_, i) => (
                    <Cell key={i} fill={['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981'][i % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Signal Coverage (top 10 models) */}
        <SignalCoverageCard signals={modelSignals} />
      </div>

      {/* Top Risky Users */}
      <div className="sf-card overflow-x-auto px-0 py-0">
        <div className="flex items-center justify-between px-5 py-3 border-b border-sf-line">
          <div>
            <h2 className="text-sm font-semibold text-sf-ink">Top Risky Users</h2>
            <p className="text-xs text-sf-muted">Highest risk scores from the latest scan</p>
          </div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-sf-blue-dark hover:underline">
            View all <ChevronRight size={13} />
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sf-line bg-sf-mist/60 text-left text-xs font-medium uppercase tracking-wide text-sf-slate">
              <th className="px-5 py-2.5">User</th>
              <th className="px-5 py-2.5">Risk score</th>
              <th className="px-5 py-2.5">Severity</th>
              <th className="px-5 py-2.5">Attack chain</th>
              <th className="px-5 py-2.5">Signals</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {topUsers.map((u) => (
              <tr key={u.userName} className="group border-b border-sf-line last:border-0 transition-colors hover:bg-sf-blue-tint/40">
                <td className="px-5 py-3 font-medium text-sf-ink">{u.userName}</td>
                <td className="px-5 py-3"><RiskScoreBar score={u.riskScore} /></td>
                <td className="px-5 py-3"><SeverityBadge severity={u.severity as Severity} /></td>
                <td className="px-5 py-3"><AttackChainChip chain={u.attackChain} /></td>
                <td className="px-5 py-3 text-sf-slate">{u.signalCount} models</td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/investigate/${encodeURIComponent(u.userName)}`}
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
    </div>
  );
}

/* ----- KPI Card ----- */

function KpiCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: React.ComponentType<any>;
  color: 'blue' | 'red' | 'orange' | 'green';
}) {
  const colorMap = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'text-blue-400' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', icon: 'text-red-400' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', icon: 'text-orange-400' },
    green: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: 'text-emerald-400' },
  };
  const c = colorMap[color];

  return (
    <div className="sf-card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="sf-eyebrow text-[11px]">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${c.bg}`}>
          <Icon size={14} className={c.icon} />
        </div>
      </div>
      <div className={`mt-1 text-2xl font-bold leading-none ${c.text}`}>
        {value}
      </div>
    </div>
  );
}

/* ----- Signal Coverage Card ----- */

function severityTier(avgDist: number): { label: string; color: string; bg: string } {
  if (avgDist >= 5) return { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
  if (avgDist >= 3) return { label: 'High', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  if (avgDist >= 1.5) return { label: 'Medium', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' };
  return { label: 'Low', color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
}

function SignalCoverageCard({ signals }: { signals: ExecData['modelSignals'] }) {
  const top = signals.slice(0, 8);
  const maxCount = Math.max(...top.map((s) => s.anomalies), 1);

  return (
    <div className="sf-card overflow-hidden">
      <div className="border-b border-sf-line px-5 py-3">
        <h2 className="mb-0.5 text-sm font-semibold text-sf-ink">Signal Coverage</h2>
        <p className="text-xs text-sf-muted">ML model anomaly detections — last 7 days</p>
      </div>
      <div className="divide-y divide-sf-line">
        {top.map((s) => {
          const tier = severityTier(Number(s.avgDistance) || 0);
          const pct = (s.anomalies / maxCount) * 100;
          const lbl = MODEL_LABELS[s.model] ?? s.model.replace(/^ad_/, '');
          return (
            <div key={s.model} className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-28 shrink-0 truncate text-xs font-medium text-sf-ink">{lbl}</span>
              <div className="relative flex-1 h-5 rounded-md overflow-hidden" style={{ background: 'var(--sf-mist)' }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-md transition-all duration-500"
                  style={{ width: `${pct}%`, background: tier.color, opacity: 0.85 }}
                />
                <span
                  className="absolute inset-y-0 flex items-center text-[10px] font-bold tabular-nums"
                  style={{ left: `${Math.min(pct, 92)}%`, paddingLeft: 6, color: pct > 60 ? '#fff' : 'var(--sf-ink)' }}
                >
                  {s.anomalies}
                </span>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: tier.bg, color: tier.color }}
              >
                {Number(s.avgDistance).toFixed(1)}σ
              </span>
            </div>
          );
        })}
      </div>
      {signals.length > 8 && (
        <div className="border-t border-sf-line px-5 py-2 text-center text-[11px] text-sf-muted">
          +{signals.length - 8} more models
        </div>
      )}
    </div>
  );
}
