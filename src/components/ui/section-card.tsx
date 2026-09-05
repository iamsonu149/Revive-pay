import {clsx} from 'clsx';
import type {ReactNode} from 'react';

interface SectionCardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Pass true to prevent the hover-lift effect on static cards */
  static?: boolean;
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  static: isStatic,
}: SectionCardProps) {
  return (
    <section
      className={clsx('card', isStatic && 'card-static', className)}
      {...(title ? {'aria-labelledby': `sc-${title.replace(/\s+/g, '-').toLowerCase()}`} : {})}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div>
            {title && (
              <h3
                id={`sc-${title.replace(/\s+/g, '-').toLowerCase()}`}
                className="section-title"
              >
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}
