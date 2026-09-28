'use client';

import { useState } from 'react';
import { ShieldCheck, AlertTriangle, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import EmptyState from './EmptyState';
import type { AnomalyResultRow } from '@/lib/types';

const MODEL_LABELS: Record<string, string> = {
  ad_login_count: 'Login count',
  ad_failed_auth: 'Failed authentications',
  ad_distinct_ips: 'Distinct IP addresses',
  ad_client_diversity: 'Client type diversity',
  ad_query_volume: 'Query volume',
  ad_bytes_scanned: 'Bytes scanned',
  ad_bytes_to_result: 'Bytes written to result',
  ad_rows_unloaded: 'Rows unloaded',
  ad_network_egress: 'Network egress',
  ad_db_breadth: 'Databases accessed',
  ad_table_breadth: 'Tables accessed',
  ad_failed_queries: 'Failed queries',
  ad_role_usage: 'Roles used',
  ad_ddl_operations: 'DDL operations',
  ad_grant_operations: 'Grant/revoke ops',
  ad_data_staging: 'Data staging (CTAS)',
  ad_outbound_transfer: 'Outbound transfer',
  ad_ext_function_calls: 'Ext. function calls',
  ad_warehouse_credits: 'Warehouse credits',
  ad_warehouse_queries: 'Warehouse queries',
};

const MODEL_ICONS: Record<string, string> = {
  ad_login_count: '🔑', ad_failed_auth: '🚫', ad_distinct_ips: '🌐',
  ad_client_diversity: '📱', ad_query_volume: '📊', ad_bytes_scanned: '💾',
  ad_bytes_to_result: '📤', ad_rows_unloaded: '📦', ad_network_egress: '🔀',
  ad_db_breadth: '🗄️', ad_table_breadth: '📋', ad_failed_queries: '❌',
  ad_role_usage: '👤', ad_ddl_operations: '🔧', ad_grant_operations: '🔐',
  ad_data_staging: '📥', ad_outbound_transfer: '🚀', ad_ext_function_calls: '⚡',
  ad_warehouse_credits: '💰', ad_warehouse_queries: '⚙️',
};

function fmt(n: number): string {
  const v = Number(n);
  if (Number.isNaN(v)) return String(n);
  const abs = Math.abs(v);
  if (abs >= 1e12) return (v / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

function multiplier(actual: number, forecast: number): string {
  if (forecast === 0) return '∞×';
  const ratio = actual / forecast;
  if (ratio >= 1000) return fmt(ratio) + '×';
  if (ratio >= 10) return ratio.toFixed(0) + '×';
  return ratio.toFixed(1) + '×';
}

function severityColor(distance: number): { bg: string; border: string; dot: string; text: string } {
  if (distance > 5) return { bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500', text: 'text-red-400' };
  if (distance > 3) return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', dot: 'bg-orange-500', text: 'text-orange-400' };
  return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', dot: 'bg-yellow-500', text: 'text-yellow-400' };
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
}

interface DayGroup {
  date: string;
  label: string;
  events: AnomalyResultRow[];
}

export default function AttackTimeline({ signals }: { signals: AnomalyResultRow[] }) {
  const anomalies = signals
    .filter((s) => s.IS_ANOMALY && Number(s.DISTANCE) > 0)
    .sort((a, b) => new Date(b.TS).getTime() - new Date(a.TS).getTime());

  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => {
    const dates = [...new Set(anomalies.map((a) => a.TS.slice(0, 10)))];
    return new Set(dates);
  });

  if (anomalies.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No anomaly events in the last 7 days"
        description="This user's activity has stayed within its forecasted baseline for every model."
      />
    );
  }

  // Group by date
  const dayMap = new Map<string, AnomalyResultRow[]>();
  for (const a of anomalies) {
    const key = a.TS.slice(0, 10);
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key)!.push(a);
  }
  const days: DayGroup[] = [...dayMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, events]) => ({
      date,
      label: formatDate(events[0].TS),
      events: events.sort((a, b) => Number(b.DISTANCE) - Number(a.DISTANCE)),
    }));

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const maxDistance = Math.max(...anomalies.map((a) => Number(a.DISTANCE)));

  return (
    <div className="space-y-1">
      {/* Summary bar */}
      <div className="sf-card mb-4 flex items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-sf-muted">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span className="font-medium text-sf-ink">{anomalies.length}</span> anomaly events
        </div>
        <div className="h-4 w-px bg-sf-line" />
        <div className="flex items-center gap-2 text-sm text-sf-muted">
          <TrendingUp className="h-4 w-4 text-orange-400" />
          <span className="font-medium text-sf-ink">{dayMap.size}</span> days
        </div>
        <div className="h-4 w-px bg-sf-line" />
        <div className="flex items-center gap-2 text-sm text-sf-muted">
          Across <span className="font-medium text-sf-ink">{new Set(anomalies.map((a) => a.MODEL_NAME)).size}</span> models
        </div>
      </div>

      {/* Timeline */}
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-sf-line" />

        {days.map((day, di) => {
          const isExpanded = expandedDays.has(day.date);
          const critCount = day.events.filter((e) => Number(e.DISTANCE) > 5).length;
          const highCount = day.events.filter((e) => Number(e.DISTANCE) > 3 && Number(e.DISTANCE) <= 5).length;

          return (
            <div key={day.date} className="relative mb-4">
              {/* Date node */}
              <div className="absolute -left-6 top-0 flex h-6 w-6 items-center justify-center">
                <div className={`h-3 w-3 rounded-full border-2 border-sf-surface ${
                  critCount > 0 ? 'bg-red-500' : highCount > 0 ? 'bg-orange-500' : 'bg-yellow-500'
                }`} />
              </div>

              {/* Date header */}
              <button
                onClick={() => toggleDay(day.date)}
                className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-white/5"
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-sf-muted" />
                  : <ChevronRight className="h-4 w-4 text-sf-muted" />
                }
                <span className="text-sm font-semibold text-sf-ink">{day.label}</span>
                <span className="rounded-full bg-sf-line/50 px-2 py-0.5 text-xs text-sf-muted">
                  {day.events.length} signal{day.events.length !== 1 ? 's' : ''}
                </span>
                {critCount > 0 && (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
                    {critCount} critical
                  </span>
                )}
              </button>

              {/* Event cards */}
              {isExpanded && (
                <div className="ml-2 space-y-2">
                  {day.events.map((evt, ei) => {
                    const sev = severityColor(Number(evt.DISTANCE));
                    const label = MODEL_LABELS[evt.MODEL_NAME] ?? evt.MODEL_NAME;
                    const icon = MODEL_ICONS[evt.MODEL_NAME] ?? '📊';
                    const actual = Number(evt.METRIC_VALUE);
                    const forecast = Number(evt.FORECAST);
                    const distance = Number(evt.DISTANCE);
                    const barWidth = Math.min(100, (distance / maxDistance) * 100);

                    return (
                      <div
                        key={`${day.date}-${ei}`}
                        className={`group relative rounded-lg border ${sev.border} ${sev.bg} px-4 py-3 transition-all hover:brightness-110`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Left: model info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{icon}</span>
                              <span className="text-sm font-medium text-sf-ink">{label}</span>
                              <span className="text-[10px] tabular-nums text-sf-muted">{formatTime(evt.TS)}</span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-sf-muted">
                              <span>
                                Actual: <span className={`font-semibold ${sev.text}`}>{fmt(actual)}</span>
                              </span>
                              <span>
                                Forecast: <span className="font-medium text-sf-ink">{forecast === 0 ? '~0' : fmt(forecast)}</span>
                              </span>
                              {actual > forecast && (
                                <span className={`font-bold ${sev.text}`}>
                                  {forecast === 0 ? '∞×' : multiplier(actual, forecast)} above baseline
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: distance badge */}
                          <div className="flex flex-col items-end gap-1">
                            <div className={`rounded-md px-2 py-0.5 text-xs font-bold ${sev.bg} ${sev.text} border ${sev.border}`}>
                              {distance.toFixed(1)}σ
                            </div>
                          </div>
                        </div>

                        {/* Distance bar */}
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                          <div
                            className={`h-full rounded-full ${sev.dot} transition-all`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
