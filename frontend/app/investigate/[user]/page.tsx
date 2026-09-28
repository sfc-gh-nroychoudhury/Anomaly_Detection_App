'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, ShieldAlert, Loader2, LayoutGrid, Clock, TrendingUp, Users2, FolderOpen, ShieldCheck, Terminal, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '@/components/PageHeader';
import SectionHeader from '@/components/SectionHeader';
import EmptyState from '@/components/EmptyState';
import SeverityBadge from '@/components/SeverityBadge';
import AttackChainChip from '@/components/AttackChainChip';
import RiskScoreBar from '@/components/RiskScoreBar';
import ForecastChart from '@/components/ForecastChart';
import AttackTimeline from '@/components/AttackTimeline';
import DriftExplorer from '@/components/DriftExplorer';
import PeerRadarChart from '@/components/PeerRadarChart';
import StreamingNarrative from '@/components/StreamingNarrative';
import CasePanel from '@/components/CasePanel';
import ExportPdfButton from '@/components/ExportPdfButton';
import Skeleton from '@/components/Skeleton';
import type { AnomalyResultRow, AttackChainRow, DriftSeriesRow, PeerComparisonRow } from '@/lib/types';

interface RemediationStep {
  title: string;
  description: string;
  sql: string | null;
  priority: 'immediate' | 'short_term' | 'long_term';
}

function formatTimeline(raw: string): string {
  try {
    const parts = raw.split(/\s*->\s*/);
    const fmt = (s: string) => new Date(s.trim()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return parts.length === 2 ? `${fmt(parts[0])} \u2192 ${fmt(parts[1])}` : raw;
  } catch {
    return raw;
  }
}

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

const TABS = [
  { id: 'Overview', icon: LayoutGrid },
  { id: 'Timeline', icon: Clock },
  { id: 'Drift', icon: TrendingUp },
  { id: 'Peers', icon: Users2 },
  { id: 'Case', icon: FolderOpen },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function InvestigateUserPage({ params }: { params: { user: string } }) {
  const userName = decodeURIComponent(params.user);
  const [tab, setTab] = useState<Tab>('Overview');

  const [signals, setSignals] = useState<AnomalyResultRow[]>([]);
  const [chain, setChain] = useState<AttackChainRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [remediationSteps, setRemediationSteps] = useState<RemediationStep[] | null>(null);
  const [remediationLoading, setRemediationLoading] = useState(false);

  const [drift, setDrift] = useState<DriftSeriesRow[]>([]);
  const [driftLoaded, setDriftLoaded] = useState(false);
  const [peers, setPeers] = useState<PeerComparisonRow[]>([]);
  const [peersLoaded, setPeersLoaded] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  const driftRef = useRef<HTMLDivElement>(null);
  const peersRef = useRef<HTMLDivElement>(null);
  const caseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/investigate/${encodeURIComponent(userName)}`);
      const json = await res.json();
      setSignals(json.signals ?? []);
      setChain(json.chain ?? null);
      setLoading(false);
    })();
  }, [userName]);

  useEffect(() => {
    if (tab === 'Drift' && !driftLoaded) {
      (async () => {
        const res = await fetch(`/api/investigate/${encodeURIComponent(userName)}/drift`);
        const json = await res.json();
        setDrift(json.rows ?? []);
        setDriftLoaded(true);
      })();
    }
    if (tab === 'Peers' && !peersLoaded) {
      (async () => {
        const res = await fetch(`/api/investigate/${encodeURIComponent(userName)}/peers`);
        const json = await res.json();
        setPeers(json.rows ?? []);
        setPeersLoaded(true);
      })();
    }
  }, [tab, driftLoaded, peersLoaded, userName]);

  const byModel = new Map<string, AnomalyResultRow[]>();
  signals.forEach((s) => {
    byModel.set(s.MODEL_NAME, [...(byModel.get(s.MODEL_NAME) ?? []), s]);
  });
  const flaggedModels = [...byModel.keys()].filter((m) => (chain?.SIGNALS ?? []).includes(m));
  const modelsToShow = flaggedModels.length > 0 ? flaggedModels : [...byModel.keys()];

  // Auto-fetch remediation and summary when chain data loads
  useEffect(() => {
    if (!chain) return;
    if (remediationSteps !== null) return; // already fetched
    setRemediationLoading(true);
    fetch(`/api/investigate/${encodeURIComponent(userName)}/remediation`, {
      method: 'POST',
      body: JSON.stringify({ attackChain: chain.ATTACK_CHAIN, signals: chain.SIGNALS }),
      headers: { 'Content-Type': 'application/json' },
    })
      .then((r) => r.json())
      .then((json) => setRemediationSteps(json.steps ?? []))
      .catch(() => setRemediationSteps([]))
      .finally(() => setRemediationLoading(false));
  }, [chain, userName, remediationSteps]);

  return (
    <div>
      <PageHeader
        title={userName}
        description={loading ? 'Loading…' : chain ? 'Flagged in the most recent scan' : 'No recent anomalies for this user'}
        actions={
          chain && (
            <>
              <SeverityBadge severity={chain.SEVERITY} />
              <RiskScoreBar score={chain.RISK_SCORE} />
            </>
          )
        }
      />

      {chain && (
        <div className="sf-card mb-6 grid grid-cols-1 divide-y divide-sf-line px-0 py-0 md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="px-5 py-4">
            <div className="sf-eyebrow mb-1.5">Attack chain</div>
            <AttackChainChip chain={chain.ATTACK_CHAIN} />
          </div>
          <div className="px-5 py-4">
            <div className="sf-eyebrow mb-1.5">Signals flagged</div>
            <div className="text-sm font-medium text-sf-ink">{chain.SIGNAL_COUNT} of 20 models</div>
          </div>
          <div className="px-5 py-4">
            <div className="sf-eyebrow mb-1.5">Activity window</div>
            <div className="text-sm font-medium text-sf-ink">{formatTimeline(chain.TIMELINE)}</div>
          </div>
        </div>
      )}

      <div className="mb-6 flex gap-1 border-b border-sf-line">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx('sf-tab', tab === id && 'sf-tab-active')}
          >
            <Icon size={15} />
            {id}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div>
          <StreamingNarrative userName={userName} signals={signals} chain={chain} />

          {/* Remediation Steps — auto-loaded */}
          <div className="mb-2 sf-section-title">
            <ShieldAlert size={16} className="text-sf-blue-dark" />
            Remediation steps
          </div>
          {remediationLoading ? (
            <div className="sf-card mb-6 px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-sf-muted">
                <Loader2 size={14} className="animate-spin" /> Generating remediation steps...
              </div>
            </div>
          ) : remediationSteps && remediationSteps.length > 0 ? (
            <div className="mb-6 space-y-2">
              {remediationSteps.map((step, i) => (
                <RemediationCard key={i} step={step} index={i + 1} />
              ))}
            </div>
          ) : remediationSteps ? (
            <div className="sf-card mb-6 px-5 py-3 text-sm text-sf-muted">No remediation steps available.</div>
          ) : null}

          <div className="mb-3 sf-section-title">
            <LayoutGrid size={16} className="text-sf-blue-dark" />
            Per-signal forecasts
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4">
              <Skeleton height={140} />
              <Skeleton height={140} />
            </div>
          ) : modelsToShow.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No signal history for this user in the last 7 days"
              description="Once new anomaly detection runs land data, per-model forecasts will show up here."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {modelsToShow.map((model) => (
                <div key={model} className="sf-card px-5 py-4">
                  <div className="mb-1 text-sm font-medium text-sf-ink">{MODEL_LABELS[model] ?? model}</div>
                  <ForecastChart points={byModel.get(model) ?? []} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'Timeline' && (
        <div>
          <SectionHeader
            icon={Clock}
            title="Attack timeline"
            description="Every above-baseline anomaly event in the last 7 days, grouped by model."
            actions={<ExportPdfButton targetRef={timelineRef} filename={`${userName}-timeline`} />}
          />
          <div ref={timelineRef}>
            <AttackTimeline signals={signals} />
          </div>
        </div>
      )}

      {tab === 'Drift' && (
        <div>
          <SectionHeader
            icon={TrendingUp}
            title="30-day drift"
            description="How far actual behavior has strayed from the forecasted baseline over time."
            actions={<ExportPdfButton targetRef={driftRef} filename={`${userName}-drift`} />}
          />
          <div ref={driftRef}>{!driftLoaded ? <Skeleton height={280} /> : <DriftExplorer rows={drift} />}</div>
        </div>
      )}

      {tab === 'Peers' && (
        <div>
          <SectionHeader
            icon={Users2}
            title="Peer comparison"
            description="How this user's behavior compares to everyone else active in the same 7-day window."
            actions={<ExportPdfButton targetRef={peersRef} filename={`${userName}-peers`} />}
          />
          <div ref={peersRef}>{!peersLoaded ? <Skeleton height={340} /> : <PeerRadarChart rows={peers} />}</div>
        </div>
      )}

      {tab === 'Case' && (
        <div>
          <SectionHeader
            icon={FolderOpen}
            title="Case"
            description="Track investigation status, notes, and response actions for this user."
            actions={<ExportPdfButton targetRef={caseRef} filename={`${userName}-case`} />}
          />
          <div ref={caseRef}>
            <CasePanel userName={userName} chain={chain} />
          </div>
        </div>
      )}
    </div>
  );
}

function RemediationCard({ step, index }: { step: RemediationStep; index: number }) {
  const priorityColors = {
    immediate: 'bg-red-500/10 text-red-400 border-red-500/30',
    short_term: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    long_term: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  };
  const priorityLabels = { immediate: 'Immediate', short_term: 'Short-term', long_term: 'Long-term' };
  const colors = priorityColors[step.priority] || priorityColors.short_term;
  const label = priorityLabels[step.priority] || 'Action';
  return (
    <div className="sf-card px-5 py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sf-blue-tint text-xs font-bold text-sf-blue-dark">
          {index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-sf-ink">{step.title}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${colors}`}>
              {label}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-sf-muted">{step.description}</p>
          {step.sql && (
            <pre className="mt-2 overflow-x-auto rounded bg-sf-bg-inset px-3 py-2 text-xs text-sf-ink">
              <code>{step.sql}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function AiCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="sf-card mb-4 border-l-4 border-l-sf-blue px-5 py-4">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sf-blue-dark">
        <Sparkles size={13} /> {title}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-sf-ink">{text}</p>
    </div>
  );
}
