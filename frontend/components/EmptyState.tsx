import type { LucideIcon } from 'lucide-react';

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="sf-card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-sf-blue-tint text-sf-blue-dark">
        <Icon size={20} />
      </div>
      <div className="text-sm font-medium text-sf-ink">{title}</div>
      {description && <p className="max-w-sm text-sm text-sf-slate">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
