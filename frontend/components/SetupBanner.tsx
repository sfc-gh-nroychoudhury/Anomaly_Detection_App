'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';
import type { SetupCheck } from '@/lib/types';

// Polled on every page load (not just the /setup page) so an incomplete
// setup is visible no matter where the user lands -- satisfies "every time
// it runs, check everything is in place" for the UI path. The scan
// procedure itself has an equivalent defensive check for the non-UI
// (Trust Center scheduler) path -- see sql/03_scan_procedure.sql.
export default function SetupBanner() {
  const [checks, setChecks] = useState<SetupCheck[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/setup-status')
      .then((res) => res.json())
      .then((json) => setChecks(json.checks ?? []))
      .catch(() => setChecks(null));
  }, []);

  if (dismissed || !checks) return null;
  const pending = checks.filter((c) => c.status !== 'ok');
  if (pending.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-severity-medium/30 bg-severity-medium/10 px-6 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-sf-ink">
        <AlertTriangle size={16} className="text-severity-medium" />
        Setup incomplete &mdash; {pending.length} step{pending.length > 1 ? 's' : ''} remaining.{' '}
        <Link href="/setup" className="font-medium text-sf-blue-dark underline">
          Finish setup
        </Link>
      </div>
      <button onClick={() => setDismissed(true)} className="text-sf-slate hover:text-sf-ink" title="Dismiss for this session">
        <X size={16} />
      </button>
    </div>
  );
}
