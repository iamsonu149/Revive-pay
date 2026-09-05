import {clsx} from 'clsx';

export function Skeleton({className}: {className?: string}) {
  return <div className={clsx('skeleton', className)} aria-hidden="true" />;
}

export function SkeletonText({lines = 3, className}: {lines?: number; className?: string}) {
  return (
    <div className={clsx('space-y-2', className)} aria-hidden="true">
      {Array.from({length: lines}, (_, i) => (
        <Skeleton key={i} className={clsx('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')} />
      ))}
    </div>
  );
}
