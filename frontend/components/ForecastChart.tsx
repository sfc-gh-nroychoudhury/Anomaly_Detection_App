'use client';

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { AnomalyResultRow } from '@/lib/types';

export default function ForecastChart({ points }: { points: AnomalyResultRow[] }) {
  const data = points.map((p) => ({
    ts: new Date(p.TS).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    actual: p.METRIC_VALUE,
    forecast: p.FORECAST,
    band: [p.LOWER_BOUND, p.UPPER_BOUND],
    anomaly: p.IS_ANOMALY ? p.METRIC_VALUE : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <ComposedChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#E1E7ED" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="ts" tick={{ fontSize: 11, fill: '#5B6675' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#5B6675' }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E1E7ED' }}
          labelStyle={{ fontWeight: 600 }}
        />
        <Area
          type="monotone"
          dataKey="band"
          stroke="none"
          fill="#29B5E8"
          fillOpacity={0.08}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          stroke="#5B6675"
          strokeDasharray="4 3"
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke="#11567F"
          dot={{ r: 2 }}
          strokeWidth={2}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="anomaly"
          stroke="none"
          dot={{ r: 4, fill: '#D6246B' }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
