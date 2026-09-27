import type { LucideIcon } from 'lucide-react';

export default function SectionHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <div className="sf-section-title">
          {Icon && <Icon size={16} className="text-sf-blue-dark" />}
          {title}
        </div>
        {description && <p className="mt-0.5 text-xs text-sf-slate">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
