'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import EmptyState from './EmptyState';
import type { DriftSeriesRow } from '@/lib/types';

export default function DriftExplorer({ rows }: { rows: DriftSeriesRow[] }) {
  const models = useMemo(() => [...new Set(rows.map((r) => r.MODEL_NAME))], [rows]);
  const [model, setModel] = useState(models[0] ?? '');
  const activeModel = models.includes(model) ? model : models[0] ?? '';

  const data = useMemo(
    () =>
      rows
        .filter((r) => r.MODEL_NAME === activeModel)
        .map((r) => ({
          ts: new Date(r.TS).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          actual: r.METRIC_VALUE,
          forecast: r.FORECAST,
          band: [r.LOWER_BOUND, r.UPPER_BOUND],
          gap: Math.abs(r.METRIC_VALUE - r.FORECAST),
          anomaly: r.IS_ANOMALY ? r.METRIC_VALUE : null,
        })),
    [rows, activeModel]
  );

  if (models.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No 30-day history for this user yet"
        description="Drift charts need at least a few days of anomaly detection runs to compare against."
      />
    );
  }

  return (
    <div className="sf-card px-5 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="sf-eyebrow">Model</div>
        <select
          value={activeModel}
          onChange={(e) => setModel(e.target.value)}
          className="sf-input w-auto text-xs"
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--sf-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="ts" tick={{ fontSize: 11, fill: 'var(--sf-slate)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--sf-slate)' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="band" name="Expected range" stroke="none" fill="#29B5E8" fillOpacity={0.08} isAnimationActive={false} />
          <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#5B6675" strokeDasharray="4 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke="#11567F" dot={{ r: 2 }} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="anomaly" name="Anomaly" stroke="none" dot={{ r: 4, fill: '#D6246B' }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
