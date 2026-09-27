'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cpu, Wifi, WifiOff } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

interface ModelInfo {
  name: string;
  lastRun: string | null;
}

const CATEGORY_OF: Record<string, string> = {
  ad_login_count: 'Authentication', ad_failed_auth: 'Authentication', ad_distinct_ips: 'Authentication', ad_client_diversity: 'Authentication',
  ad_query_volume: 'Exfiltration', ad_bytes_scanned: 'Exfiltration', ad_bytes_to_result: 'Exfiltration', ad_rows_unloaded: 'Exfiltration', ad_network_egress: 'Exfiltration',
  ad_db_breadth: 'Reconnaissance', ad_table_breadth: 'Reconnaissance', ad_failed_queries: 'Reconnaissance',
  ad_role_usage: 'Privilege Escalation', ad_ddl_operations: 'Privilege Escalation', ad_grant_operations: 'Privilege Escalation',
  ad_data_staging: 'Insider Threat', ad_outbound_transfer: 'Insider Threat', ad_ext_function_calls: 'Insider Threat',
  ad_warehouse_credits: 'Resource Abuse', ad_warehouse_queries: 'Resource Abuse',
};

export default function ModelsPage() {
  const [connected, setConnected] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/models');
      const json = await res.json();
      setConnected(!!json.connected);
      setModels(json.models ?? []);
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="Model Health"
        description="20 SNOWFLAKE.ML.ANOMALY_DETECTION models, retrained weekly. These live outside the app and are retrained by a task in that external schema -- see the Setup page for why."
      />

      <div className="sf-card mb-6 flex items-center gap-3 px-5 py-4">
        {connected ? (
          <>
            <Wifi size={18} className="text-risk-low" />
            <span className="text-sm font-medium text-sf-ink">Connected to external ML models</span>
          </>
        ) : (
          <>
            <WifiOff size={18} className="text-severity-medium" />
            <span className="text-sm font-medium text-sf-ink">Not connected yet &mdash;</span>
            <Link href="/setup" className="text-sm font-medium text-sf-blue-dark underline">
              finish setup
            </Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {models.map((m) => (
          <div key={m.name} className="sf-card flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <Cpu size={16} className="text-sf-blue" />
              <div>
                <div className="text-sm font-medium text-sf-ink">{m.name}</div>
                <div className="text-xs text-sf-slate">{CATEGORY_OF[m.name] ?? 'Uncategorized'}</div>
              </div>
            </div>
            <div className="text-xs text-sf-slate">
              {m.lastRun ? `last scored ${new Date(m.lastRun).toLocaleString()}` : 'no results yet'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
