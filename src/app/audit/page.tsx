import {requireMerchant} from '@/lib/require-merchant';
import {db} from '@/lib/db';
import {label} from '@/lib/utils';
import {auditPageHref, getAuditPage} from '@/domain/audit/audit-query';
import {Search, ScrollText, ChevronLeft, ChevronRight} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Audit({
  searchParams,
}: {
  searchParams: {q?: string; page?: string};
}) {
  await requireMerchant();
  const {q, total, pages, page, events} = await getAuditPage(db, searchParams);

  return (
    <div className="p-8 animate-fade-in">
      <div className="mb-8">
        <p className="page-eyebrow">Traceability</p>
        <h2 className="page-title">Audit log</h2>
      </div>

      <div className="card card-static overflow-hidden">
        {/* Search bar */}
        <form
          action="/audit"
          method="get"
          className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-3"
        >
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <Search size={14} />
            </span>
            <input
              key={q}
              name="q"
              defaultValue={q}
              aria-label="Search audit events"
              className="input pl-8 py-1.5 text-xs"
              placeholder="Case ID, action, actor…"
            />
          </div>
          <button type="submit" className="btn-ghost py-1.5 px-3 text-xs">
            Search
          </button>
          <span className="ml-auto text-xs text-slate-400 tabular-nums">
            {total} events · Page {page} of {pages}
          </span>
        </form>

        {/* Events */}
        {events.length ? (
          <div className="divide-y divide-slate-100">
            {events.map(e => (
              <details key={e.id} className="group">
                <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100">
                      <ScrollText size={13} className="text-slate-500" />
                    </span>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-slate-900">
                        {label(e.eventType)}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">
                        · {e.recoveryCase?.paymentAttempt.customer.name ?? 'Merchant settings / simulation'}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-xs text-slate-400 sm:block">
                      {e.createdAt.toLocaleString('en-IN')}
                    </span>
                    <span className="badge badge-muted">{e.actor}</span>
                    <svg
                      className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </summary>
                <div className="px-5 pb-4">
                  <p className="mb-2 text-xs text-slate-400 sm:hidden">
                    {e.createdAt.toLocaleString('en-IN')}
                  </p>
                  <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-300 leading-relaxed max-h-72 font-mono">
                    {JSON.stringify(JSON.parse(e.payload), null, 2)}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-400">
              <ScrollText size={24} />
            </span>
            <p className="mt-4 text-sm text-slate-500">No audit events match.</p>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/40 px-5 py-3">
          <span className="text-xs text-slate-500 tabular-nums">
            {total} events · Page {page} of {pages}
          </span>
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <a
                href={auditPageHref(q, page - 1)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft size={12} /> Previous
              </a>
            ) : (
              <span className="flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-300 cursor-not-allowed">
                <ChevronLeft size={12} /> Previous
              </span>
            )}
            {page < pages ? (
              <a
                href={auditPageHref(q, page + 1)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Next <ChevronRight size={12} />
              </a>
            ) : (
              <span className="flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-300 cursor-not-allowed">
                Next <ChevronRight size={12} />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

