'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {
  LayoutDashboard,
  RefreshCw,
  FlaskConical,
  ScrollText,
  Settings,
  Zap,
} from 'lucide-react';
import {clsx} from 'clsx';

const links = [
  ['Dashboard',           '/dashboard',  LayoutDashboard],
  ['Recovery queue',      '/recoveries', RefreshCw],
  ['Strategy simulator',  '/simulator',  FlaskConical],
  ['Audit log',           '/audit',      ScrollText],
  ['Settings',            '/settings',   Settings],
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-slate-950 flex flex-col z-30 border-r border-slate-800">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4 border-b border-slate-800/60">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 group"
          aria-label="Revive Pay — go to dashboard"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white font-bold text-sm shadow-glow-brand group-hover:shadow-none transition-shadow duration-200">
            <Zap size={16} />
          </span>
          <span className="font-bold text-white tracking-tight text-sm">
            Revive<span className="text-brand-400">Pay</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-0.5" aria-label="Main navigation">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Recovery operations
        </p>
        {links.map(([name, href, Icon]) => {
          const active =
            href === '/dashboard'
              ? pathname === '/dashboard' || pathname === '/'
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx('nav', active && 'active')}
            >
              <Icon size={16} className={active ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'} />
              {name}
            </Link>
          );
        })}
      </nav>

      {/* Footer badge */}
      <div className="px-5 pb-5 border-t border-slate-800/60 pt-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <span className="text-xs text-slate-500">Mock Razorpay · Test mode</span>
        </div>
      </div>
    </aside>
  );
}
