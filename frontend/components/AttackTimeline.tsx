'use client';

import { useEffect, useRef } from 'react';
import { DataSet } from 'vis-data';
import { Timeline } from 'vis-timeline/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';
import { ShieldCheck } from 'lucide-react';
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
  ad_db_breadth: 'Distinct databases accessed',
  ad_table_breadth: 'Distinct tables accessed',
  ad_failed_queries: 'Failed queries',
  ad_role_usage: 'Distinct roles used',
  ad_ddl_operations: 'DDL operations',
  ad_grant_operations: 'Grant/revoke operations',
  ad_data_staging: 'Data staging (CTAS)',
  ad_outbound_transfer: 'Outbound data transfer',
  ad_ext_function_calls: 'External function calls',
  ad_warehouse_credits: 'Warehouse credits',
  ad_warehouse_queries: 'Warehouse query count',
};

export default function AttackTimeline({ signals }: { signals: AnomalyResultRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);

  const anomalies = signals.filter((s) => s.IS_ANOMALY && s.DISTANCE > 0);
  const models = [...new Set(anomalies.map((a) => a.MODEL_NAME))];

  useEffect(() => {
    if (!containerRef.current) return;

    const groups = new DataSet(
      models.map((m, i) => ({ id: m, content: MODEL_LABELS[m] ?? m, order: i }))
    );
    const items = new DataSet(
      anomalies.map((a, i) => ({
        id: i,
        group: a.MODEL_NAME,
        start: a.TS,
        content: `${a.METRIC_VALUE.toFixed(1)} (forecast ${a.FORECAST.toFixed(1)})`,
        title: `${MODEL_LABELS[a.MODEL_NAME] ?? a.MODEL_NAME}\nActual: ${a.METRIC_VALUE.toFixed(1)}\nForecast: ${a.FORECAST.toFixed(1)}\nDistance: ${a.DISTANCE.toFixed(2)}`,
        className: a.DISTANCE > 3 ? 'sf-timeline-critical' : 'sf-timeline-high',
      }))
    );

    timelineRef.current = new Timeline(containerRef.current, items, groups, {
      height: `${Math.max(160, models.length * 46 + 40)}px`,
      margin: { item: 10, axis: 20 },
      orientation: 'top',
      stack: false,
    });

    return () => {
      timelineRef.current?.destroy();
      timelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals]);

  if (anomalies.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No anomaly events in the last 7 days"
        description="This user's activity has stayed within its forecasted baseline for every model."
      />
    );
  }

  return (
    <div className="sf-card px-3 py-3">
      <div ref={containerRef} />
    </div>
  );
}
