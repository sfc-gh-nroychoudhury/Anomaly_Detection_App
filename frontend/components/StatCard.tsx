import type { LucideIcon } from 'lucide-react';

export default function StatCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  accent?: 'blue' | 'critical' | 'default';
  icon?: LucideIcon;
}) {
  const accentClass =
    accent === 'blue'
      ? 'text-sf-blue-dark'
      : accent === 'critical'
      ? 'text-severity-critical'
      : 'text-sf-midnight';

  return (
    <div className="sf-card px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="sf-eyebrow">{label}</div>
        {Icon && (
          <div className={`flex h-7 w-7 items-center justify-center rounded-md bg-sf-blue-tint ${accentClass}`}>
            <Icon size={14} />
          </div>
        )}
      </div>
      <div className={`mt-1.5 text-[26px] font-semibold leading-none ${accentClass}`}>{value}</div>
    </div>
  );
}
