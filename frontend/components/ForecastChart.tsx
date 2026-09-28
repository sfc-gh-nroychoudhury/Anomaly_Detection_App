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

function fmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  const isAnomaly = row.anomaly != null;
  const band = row.band as [number, number] | undefined;

  return (
    <div
      style={{
        background: 'var(--sf-surface)',
        border: '1px solid var(--sf-line)',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 12,
        color: 'var(--sf-slate)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--sf-ink)', marginBottom: 8, fontSize: 13 }}>{label}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <Row label="Actual" value={fmt(row.actual)} highlight />
          <Row label="Forecast" value={fmt(row.forecast)} />
          {band && <Row label="Expected range" value={`${fmt(band[0])} – ${fmt(band[1])}`} />}
          {row.distance != null && row.distance > 0 && (
            <Row label="Deviation" value={`${row.distance.toFixed(1)}σ`} warn={row.distance > 2} />
          )}
        </tbody>
      </table>
      {isAnomaly && (
        <div
          style={{
            marginTop: 8,
            background: 'rgba(214,36,107,0.12)',
            color: '#E8487F',
            borderRadius: 6,
            padding: '4px 8px',
            textAlign: 'center',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Anomaly detected
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <tr>
      <td style={{ padding: '2px 0', color: 'var(--sf-slate)' }}>{label}</td>
      <td
        style={{
          padding: '2px 0',
          textAlign: 'right',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: warn ? '#E8487F' : highlight ? 'var(--sf-ink)' : 'var(--sf-slate)',
        }}
      >
        {value}
      </td>
    </tr>
  );
}

export default function ForecastChart({ points }: { points: AnomalyResultRow[] }) {
  const data = points.map((p) => ({
    ts: new Date(p.TS).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    actual: p.METRIC_VALUE,
    forecast: p.FORECAST,
    band: [p.LOWER_BOUND, p.UPPER_BOUND],
    anomaly: p.IS_ANOMALY ? p.METRIC_VALUE : null,
    distance: p.DISTANCE,
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <ComposedChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#E1E7ED" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="ts" tick={{ fontSize: 11, fill: '#5B6675' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#5B6675' }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: '#29B5E8', strokeWidth: 1 }}
          wrapperStyle={{ outline: 'none', background: 'transparent', border: 'none', boxShadow: 'none' }}
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
