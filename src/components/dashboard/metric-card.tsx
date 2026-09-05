import {clsx} from 'clsx';
import type {LucideIcon} from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
  icon?: LucideIcon;
  trend?: string;
}

export function MetricCard({label, value, detail, accent = false, icon: Icon, trend}: MetricCardProps) {
  return (
    <div
      className={clsx(
        'group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 ease-out',
        'border bg-white hover:-translate-y-1',
        accent 
          ? 'border-brand-200 shadow-[0_8px_30px_rgba(139,92,246,0.12)] hover:shadow-[0_20px_40px_-10px_rgba(139,92,246,0.2)]' 
          : 'border-slate-200 shadow-card hover:shadow-card-hover hover:border-slate-300'
      )}
    >
      {/* Soft background glow for accent */}
      {accent && (
        <div 
          className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl transition-opacity duration-500 group-hover:opacity-100 group-hover:bg-brand-500/20" 
          aria-hidden="true" 
        />
      )}
      
      <div className="relative z-10 flex items-start justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {label}
        </p>
        {Icon && (
          <span
            className={clsx(
              'grid h-10 w-10 place-items-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-110',
              accent ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_4px_15px_-3px_rgba(139,92,246,0.4)]' : 'bg-slate-50 text-brand-600 border border-slate-200',
            )}
          >
            <Icon size={18} strokeWidth={2.5} />
          </span>
        )}
      </div>
      <p
        className={clsx(
          'relative z-10 mt-4 text-3xl font-extrabold tracking-tight tabular-nums text-slate-900',
        )}
      >
        {value}
      </p>
      <div className="relative z-10 mt-4 flex items-center gap-2">
        {trend && (
          <span className={clsx("text-[11px] font-bold px-1.5 py-0.5 rounded-md border", accent ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200")}>
            {trend}
          </span>
        )}
        <p className="text-xs font-medium text-slate-500">{detail}</p>
      </div>
    </div>
  );
}
