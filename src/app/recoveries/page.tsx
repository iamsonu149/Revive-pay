import {requireMerchant} from '@/lib/require-merchant';
import {db} from '@/lib/db';
import Link from 'next/link';
import {inr} from '@/lib/currency';
import {label} from '@/lib/utils';
import {StatusBadge} from '@/components/ui/status-badge';
import {ProgressBar} from '@/components/ui/progress-bar';
import {Badge} from '@/components/ui/badge';
import {Search, ChevronLeft, ChevronRight, RefreshCw} from 'lucide-react';

const PAGE_SIZE = 25;

export const dynamic = 'force-dynamic';

export default async function Recoveries({
  searchParams,
}: {
  searchParams: {page?: string; q?: string};
}) {
  await requireMerchant();

  const q = searchParams.q?.trim() ?? '';
  const where = q
    ? {
        OR: [
          {status: {contains: q}},
          {recommendedAction: {contains: q}},
          {paymentAttempt: {failureReason: {contains: q}}},
          {paymentAttempt: {customer: {name: {contains: q}}}},
        ],
      }
    : {};

  const total = await db.recoveryCase.count({where});
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const raw = Number(searchParams.page ?? 1);
  const page = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), pages) : 1;

  const rows = await db.recoveryCase.findMany({
    where,
    include: {paymentAttempt: {include: {customer: true}}},
    orderBy: {createdAt: 'desc'},
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-8 animate-fade-in">
      {/* Page header */}
      <div className="mb-8">
        <p className="page-eyebrow">Recovery operations</p>
        <h2 className="page-title">Failed payment queue</h2>
      </div>

      <div className="card card-static overflow-hidden">
        {/* Search / filter bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-3">
          <form className="relative flex-1 min-w-[220px] max-w-sm" method="get">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <Search size={14} />
            </span>
            <input
              name="q"
              defaultValue={q}
              aria-label="Filter recovery cases"
              className="input pl-8 py-1.5 text-xs"
              placeholder="Status, reason, action, customer…"
            />
          </form>
          <Badge variant="muted" className="tabular-nums">{total} cases</Badge>
          {q && (
            <Link href="/recoveries" className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
              Clear filter
            </Link>
          )}
          <span className="ml-auto text-xs text-slate-400 tabular-nums">
            Page {page} of {pages}
          </span>
        </div>

        {/* Table */}
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="min-w-[160px]">Customer</th>
                  <th>Amount</th>
                  <th>Failure reason</th>
                  <th className="min-w-[120px]">Score</th>
                  <th>Recommendation</th>
                  <th>Status</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/recoveries/${c.id}`}
                        className="font-semibold text-slate-900 hover:text-emerald-700 transition-colors"
                      >
                        {c.paymentAttempt.customer.name}
                      </Link>
                      <p className="text-xs text-slate-400 mt-0.5">{c.paymentAttempt.customer.email}</p>
                    </td>
                    <td className="font-semibold tabular-nums">{inr(c.paymentAttempt.amount)}</td>
                    <td className="text-slate-600">{label(c.paymentAttempt.failureReason)}</td>
                    <td>
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <ProgressBar value={c.predictedRecoveryProbability} size="sm" className="flex-1" />
                        <span className="text-xs tabular-nums text-slate-500 w-6 text-right">
                          {c.predictedRecoveryProbability}
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={c.recommendedAction} />
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>
                      {c.requiresHumanApproval ? (
                        <Badge variant="warning">High</Badge>
                      ) : (
                        <Badge variant="muted">Standard</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-400">
              <RefreshCw size={24} />
            </span>
            <p className="mt-4 text-sm font-medium text-slate-700">
              {q ? `No cases match "${q}"` : 'No recovery cases yet.'}
            </p>
            {q && (
              <Link href="/recoveries" className="mt-2 text-xs text-emerald-700 hover:underline">
                Clear search and view all cases
              </Link>
            )}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/40 px-5 py-3">
          <span className="text-xs text-slate-500 tabular-nums">
            Showing {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <Link
                href={`/recoveries?page=${page - 1}&q=${encodeURIComponent(q)}`}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft size={12} /> Previous
              </Link>
            ) : (
              <span className="flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-300 cursor-not-allowed">
                <ChevronLeft size={12} /> Previous
              </span>
            )}
            <span className="px-3 py-1.5 text-xs tabular-nums text-slate-500">{page} / {pages}</span>
            {page < pages ? (
              <Link
                href={`/recoveries?page=${page + 1}&q=${encodeURIComponent(q)}`}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Next <ChevronRight size={12} />
              </Link>
            ) : (
              <span className="flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-300 cursor-not-allowed">
                Next <ChevronRight size={12} />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
