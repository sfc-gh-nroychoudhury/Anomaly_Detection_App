'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Users2 } from 'lucide-react';
import EmptyState from './EmptyState';
import type { PeerComparisonRow } from '@/lib/types';

export default function PeerRadarChart({ rows }: { rows: PeerComparisonRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Users2}
        title="Not enough peer data yet"
        description="Peer comparison needs other users active in the same 7-day window to compare against."
      />
    );
  }

  // Normalize each model's axis to 0-100 using the peer max as the scale, so
  // models with very different units (bytes vs. counts) plot on one radar.
  const data = rows.map((r) => {
    const uv = Number(r.USER_VALUE) || 0;
    const pa = Number(r.PEER_AVG) || 0;
    const p95 = Number(r.PEER_P95) || 0;
    const pm = Number(r.PEER_MAX) || 0;
    const scale = pm > 0 ? pm : Math.max(uv, pa, 1);
    return {
      model: r.MODEL_NAME.replace(/^ad_/, '').replace(/_/g, ' '),
      you: Math.round((uv / scale) * 100),
      peerAvg: Math.round((pa / scale) * 100),
      peerP95: Math.round((p95 / scale) * 100),
    };
  });

  return (
    <div className="sf-card px-5 py-5">
      <div className="sf-eyebrow mb-3">Normalized to peer max = 100</div>
      <ResponsiveContainer width="100%" height={380}>
        <RadarChart data={data}>
          <PolarGrid stroke="var(--sf-line)" />
          <PolarAngleAxis dataKey="model" tick={{ fontSize: 10, fill: 'var(--sf-slate)' }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: 'var(--sf-slate)' }} />
          <Radar name="Peer avg" dataKey="peerAvg" stroke="#5B6675" fill="#5B6675" fillOpacity={0.12} />
          <Radar name="Peer P95" dataKey="peerP95" stroke="#29B5E8" fill="#29B5E8" fillOpacity={0.08} strokeDasharray="4 3" />
          <Radar name="This user" dataKey="you" stroke="#D6246B" fill="#D6246B" fillOpacity={0.2} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
