'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, ShieldAlert, FileText, Loader2, LayoutGrid, Clock, TrendingUp, Users2, FolderOpen, ShieldCheck } from 'lucide-react';
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

  const [remediation, setRemediation] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  async function runAction(action: 'remediation' | 'summary') {
    setBusy(action);
    const url = `/api/investigate/${encodeURIComponent(userName)}/${action}`;
    const body =
      action === 'remediation'
        ? JSON.stringify({ attackChain: chain?.ATTACK_CHAIN, signals: chain?.SIGNALS })
        : undefined;
    const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    const json = await res.json();
    if (action === 'remediation') setRemediation(json.remediation || json.error || 'No remediation available.');
    if (action === 'summary') setSummary(json.summary || json.error || 'No summary available.');
    setBusy(null);
  }

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

          <div className="mb-6 grid grid-cols-2 gap-3">
            <AiActionButton
              icon={ShieldAlert}
              label="Remediation steps"
              busy={busy === 'remediation'}
              onClick={() => runAction('remediation')}
              disabled={!chain}
            />
            <AiActionButton icon={FileText} label="Summarize activity" busy={busy === 'summary'} onClick={() => runAction('summary')} />
          </div>

          {remediation && <AiCard title="Remediation steps" text={remediation} />}
          {summary && <AiCard title="Recent activity summary" text={summary} />}

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

function AiActionButton({
  icon: Icon,
  label,
  busy,
  disabled,
  onClick,
}: {
  icon: typeof Sparkles;
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="sf-card flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium text-sf-blue-dark hover:bg-sf-blue-tint disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </button>
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
