import {clsx} from 'clsx';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  variant?: 'success' | 'warning' | 'danger' | 'default';
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const trackClass = 'bg-slate-100 rounded-full overflow-hidden shadow-inner';

const fillClass: Record<NonNullable<ProgressBarProps['variant']>, string> = {
  success: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
  warning: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
  danger:  'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
  default: 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.2)]',
};

function autoVariant(value: number): NonNullable<ProgressBarProps['variant']> {
  if (value >= 70) return 'success';
  if (value >= 40) return 'warning';
  return 'danger';
}

export function ProgressBar({
  value,
  variant,
  size = 'sm',
  showLabel = false,
  className,
}: ProgressBarProps) {
  const resolvedVariant = variant ?? autoVariant(value);
  const h = size === 'md' ? 'h-2.5' : 'h-1.5';
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className={clsx(trackClass, h, 'flex-1')}>
        <div
          className={clsx(fillClass[resolvedVariant], h, 'rounded-full transition-all duration-500')}
          style={{width: `${pct}%`, animation: 'progressFill 0.6s ease-out both'}}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium tabular-nums text-slate-500 w-8 text-right">
          {pct}
        </span>
      )}
    </div>
  );
}
