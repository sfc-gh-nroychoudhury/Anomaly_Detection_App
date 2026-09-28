'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ShieldAlert, ClipboardList, ShieldOff, Cpu, Settings, Search } from 'lucide-react';
import clsx from 'clsx';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { href: '/', label: 'Overview', icon: BarChart3 },
  { href: '/dashboard', label: 'Threats', icon: ShieldAlert },
  { href: '/cases', label: 'Cases', icon: ClipboardList },
  { href: '/exclusions', label: 'Allowlist', icon: ShieldOff },
  { href: '/models', label: 'Models', icon: Cpu },
  { href: '/setup', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const onInvestigate = pathname.startsWith('/investigate');

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
        {NAV.map(({ href, label, icon: Icon }, idx) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const isActive = href === '/' && onInvestigate ? false : active;
          return (
            <div key={href}>
              <Link
                href={href}
                className={clsx(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sf-blue-tint text-sf-blue-dark'
                    : 'text-sf-slate hover:bg-sf-mist hover:text-sf-ink'
                )}
              >
                <Icon size={17} strokeWidth={2} />
                {label}
              </Link>
              {/* Investigate appears after Dashboard when on an investigate page */}
              {idx === 1 && onInvestigate && (
                <Link
                  href={pathname}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium bg-sf-blue-tint text-sf-blue-dark transition-colors"
                >
                  <Search size={17} strokeWidth={2} />
                  Investigate
                </Link>
              )}
            </div>
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
  /* eslint-disable @next/next/no-img-element */
  return (
    <img src="/snowflake-logo.svg" alt="" width={26} height={26} aria-hidden="true" />
  );
}
