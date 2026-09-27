import clsx from 'clsx';

// Horizontal 0-100 risk score bar with a color ramp matching the severity palette.
export default function RiskScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-risk-extreme'
      : score >= 60
      ? 'bg-risk-high'
      : score >= 40
      ? 'bg-risk-mid'
      : 'bg-risk-low';

  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-24 overflow-hidden rounded-pill bg-sf-mist">
        <div
          className={clsx('h-full rounded-pill transition-all', color)}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-sf-ink">{Math.round(score)}</span>
    </div>
  );
}
