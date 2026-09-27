'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Search, ShieldCheck, UserX, Cpu, ClipboardList } from 'lucide-react';
import clsx from 'clsx';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/investigate', label: 'Investigate', icon: Search },
  { href: '/cases', label: 'Cases', icon: ClipboardList },
  { href: '/exclusions', label: 'Exclusions', icon: UserX },
  { href: '/models', label: 'Model Health', icon: Cpu },
  { href: '/setup', label: 'Setup', icon: ShieldCheck },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-shrink-0 flex-col border-r border-sf-line bg-sf-surface">
      <div className="flex items-center gap-2.5 px-5 py-6">
        <SnowflakeMark />
        <div>
          <div className="text-[13px] font-semibold leading-tight text-sf-midnight">
            ML Behavioral
          </div>
          <div className="text-[13px] font-semibold leading-tight text-sf-midnight">
            Anomaly Detection
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sf-blue-tint text-sf-blue-dark'
                  : 'text-sf-slate hover:bg-sf-mist hover:text-sf-ink'
              )}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sf-line px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="sf-pill bg-sf-blue-tint text-sf-blue-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-sf-blue" />
            Trust Center Extension
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function SnowflakeMark() {
  // A simple six-point mark evoking the product's visual language, not the
  // official Snowflake logo asset (which is trademarked and not bundled here).
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="#29B5E8" strokeWidth="1.6" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="3.2" y1="7" x2="20.8" y2="17" />
        <line x1="20.8" y1="7" x2="3.2" y2="17" />
      </g>
      <circle cx="12" cy="12" r="2.4" fill="#29B5E8" />
    </svg>
  );
}
