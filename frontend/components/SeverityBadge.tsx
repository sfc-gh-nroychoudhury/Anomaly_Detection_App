import clsx from 'clsx';
import type { Severity } from '@/lib/types';

const STYLES: Record<Severity, string> = {
  CRITICAL: 'bg-severity-critical/10 text-severity-critical',
  HIGH: 'bg-severity-high/10 text-severity-high',
  MEDIUM: 'bg-severity-medium/10 text-severity-medium',
  LOW: 'bg-severity-low/10 text-severity-low',
};

const DOT: Record<Severity, string> = {
  CRITICAL: 'bg-severity-critical',
  HIGH: 'bg-severity-high',
  MEDIUM: 'bg-severity-medium',
  LOW: 'bg-severity-low',
};

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={clsx('sf-pill', STYLES[severity])}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', DOT[severity])} />
      {severity}
    </span>
  );
}
