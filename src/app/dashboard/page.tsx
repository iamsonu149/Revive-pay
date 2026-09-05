import {requireMerchant} from '@/lib/require-merchant';
import {dashboardData} from '@/domain/recovery/dashboard-service';
import {inr} from '@/lib/currency';
import {MetricCard} from '@/components/dashboard/metric-card';
import {StatusBadge} from '@/components/ui/status-badge';
import {ProgressBar} from '@/components/ui/progress-bar';
import Link from 'next/link';
import {label} from '@/lib/utils';
import {clsx} from 'clsx';
import {
  TrendingUp,
  Percent,
  DollarSign,
  Clock,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {paymentProviderInfo} from '@/integrations/razorpay/provider';

export const dynamic = 'force-dynamic';

function getCategoryData(reason: string) {
  if (['CANCELLED_SUBSCRIPTION', 'REFUND', 'SUSPECTED_CHARGEBACK', 'CHARGEBACK'].includes(reason)) {
    return {color: 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]', label: 'Hard-stop risk'};
  }
  if (['EXPIRED_CARD', 'EXPIRED_MANDATE', 'INSUFFICIENT_FUNDS'].includes(reason)) {
    return {color: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]', label: 'Credential issue'};
  }
  if (['BANK_TECHNICAL'].includes(reason)) {
    return {color: 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]', label: 'Technical failure'};
  }
  return {color: 'bg-slate-400 shadow-none', label: 'Other'};
}

export default async function Dashboard() {
  await requireMerchant();
  const d = await dashboardData();
  const provider=paymentProviderInfo();

  const sortedBreakdown = [...d.breakdown].sort((a, b) => b[1] - a[1]);
  const breakdownMax = Math.max(1, ...sortedBreakdown.map(([, v]) => v));

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in relative">
      {/* Background radial for light theme depth */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/5 blur-[120px] rounded-full pointer-events-none -z-10" aria-hidden="true" />
      
      {/* Page header */}
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600 mb-1" style={{animation: 'slideUp 0.3s ease-out both'}}>
            Current recovery outlook · {provider.displayName}
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900" style={{animation: 'slideUp 0.3s ease-out 0.05s both'}}>
            Act on the recoverable, protect the rest.
          </h2>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 relative z-10">
        <div style={{animation: 'slideUp 0.3s ease-out 0.1s both'}}>
          <MetricCard
            label="Revenue recovered"
            value={inr(d.recovered)}
            detail={`Confirmed ${provider.activeMode==='mock'?'mock':'test-mode'} payment outcomes`}
            icon={TrendingUp}
            accent
          />
        </div>
        <div style={{animation: 'slideUp 0.3s ease-out 0.15s both'}}>
          <MetricCard
            label="Recovery rate"
            value={`${d.rate}%`}
            detail="Confirmed recoveries / all cases"
            icon={Percent}
          />
        </div>
        <div style={{animation: 'slideUp 0.3s ease-out 0.2s both'}}>
          <MetricCard
            label="Revenue in open recovery"
            value={inr(d.atRisk)}
            detail={`${d.total} total recovery cases`}
            icon={DollarSign}
          />
        </div>
        <div style={{animation: 'slideUp 0.3s ease-out 0.25s both'}}>
          <MetricCard
            label="Approval queue"
            value={String(d.pending)}
            detail="High-value and review decisions"
            icon={Clock}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3 relative z-10" style={{animation: 'slideUp 0.4s ease-out 0.3s both'}}>
        {/* Recent recoveries */}
        <section className="card card-static col-span-1 xl:col-span-2 flex flex-col shadow-sm" aria-labelledby="recent-heading">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-slate-50/50">
            <div>
              <h3 id="recent-heading" className="section-title">Recent confirmed recoveries</h3>
              <p className="mt-0.5 text-xs text-slate-500">Latest verified payment confirmations</p>
            </div>
            <CheckCircle size={16} className="text-emerald-500" />
          </div>
          <div className="p-6 flex-1 flex flex-col justify-center">
            {d.confirmed.length ? (
              <ul className="divide-y divide-slate-100">
                {d.confirmed.map(c => (
                  <li key={c.id} className="flex items-center justify-between py-3 group">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-600 border border-emerald-100 transition-transform group-hover:scale-105 shadow-sm">
                        {c.paymentAttempt.customer.name.charAt(0).toUpperCase()}
                      </span>
                      <Link
                        href={`/recoveries/${c.id}`}
                        className="text-sm font-medium text-slate-800 hover:text-brand-600 transition-colors focus-visible:outline-brand-500 rounded-sm"
                      >
                        {c.paymentAttempt.customer.name}
                      </Link>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-600 tabular-nums">{inr(c.recoveredAmount)}</p>
                      <p className="text-xs text-slate-500">{c.recoveredAt?.toLocaleString('en-IN')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center shadow-inner">
                <div className="h-12 w-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-500 mb-4 shadow-sm">
                  <TrendingUp size={24} />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">No confirmed provider recovery yet</h4>
                <p className="mt-1 text-xs text-slate-500 max-w-sm px-4">
                  Confirmed recovery remains ₹0 until a mock confirmation or verified provider webhook succeeds. Synthetic evaluation is kept separate.
                </p>
                <Link
                  href="/simulator"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors focus-visible:outline-brand-500"
                >
                  View reproducible synthetic batch evidence <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Failure distribution — CSS bar chart */}
        <section className="card card-static flex flex-col shadow-sm" aria-labelledby="failure-heading">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-slate-50/50">
            <div>
              <h3 id="failure-heading" className="section-title">Failure distribution</h3>
              <p className="mt-0.5 text-xs text-slate-500">Breakdown by failure reason</p>
            </div>
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <div className="p-6 space-y-5 flex-1 flex flex-col justify-center">
            {sortedBreakdown.length ? sortedBreakdown.map(([k, v], i) => {
              const cat = getCategoryData(k);
              const percent = d.total > 0 ? Math.round((v / d.total) * 100) : 0;
              return (
                <div key={k} className="group">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <div>
                      <p className="font-medium text-slate-800">{label(k)}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">{cat.label}</p>
                    </div>
                    <div className="text-right">
                      <span className="tabular-nums text-slate-800 font-semibold">{v}</span>
                      <span className="ml-1.5 tabular-nums text-slate-400 text-[10px]">({percent}%)</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200/50">
                    <div
                      className={clsx('h-full rounded-full transition-all duration-1000 ease-out', cat.color)}
                      style={{
                        width: `${Math.round((v / breakdownMax) * 100)}%`,
                        animation: `progressFill 1s cubic-bezier(0.16, 1, 0.3, 1) ${0.1 * i}s both`
                      }}
                    />
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm text-slate-500 text-center">No failure data yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* High-priority queue */}
      <section className="card card-static mt-5 shadow-sm relative z-10" aria-labelledby="queue-heading" style={{animation: 'slideUp 0.4s ease-out 0.4s both'}}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h3 id="queue-heading" className="section-title">High-priority recovery queue</h3>
            <p className="mt-0.5 text-xs text-slate-500">Cases ranked by heuristic recovery score</p>
          </div>
          <Link
            href="/recoveries"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-brand-600 transition-all focus-visible:outline-brand-500 shrink-0"
          >
            View all cases <ArrowRight size={14} className="text-slate-400 group-hover:text-brand-600" />
          </Link>
        </div>
        {d.queue.length ? (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th scope="col" className="w-1/4 min-w-[180px]">Customer</th>
                  <th scope="col" className="w-1/5 min-w-[140px]">Failure reason</th>
                  <th scope="col" className="w-1/6 min-w-[100px]">Amount</th>
                  <th scope="col" className="w-1/6 min-w-[120px]">Score</th>
                  <th scope="col" className="min-w-[160px]">Recommended action</th>
                </tr>
              </thead>
              <tbody>
                {d.queue.map(c => (
                  <tr key={c.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-bold text-slate-500 transition-all group-hover:bg-brand-50 group-hover:text-brand-600 group-hover:border-brand-200 border border-transparent">
                          {c.paymentAttempt.customer.name.charAt(0).toUpperCase()}
                        </span>
                        <Link
                          href={`/recoveries/${c.id}`}
                          className="font-medium text-slate-800 hover:text-brand-600 transition-colors focus-visible:outline-brand-500 rounded-sm truncate"
                          title={c.paymentAttempt.customer.name}
                        >
                          {c.paymentAttempt.customer.name}
                        </Link>
                      </div>
                    </td>
                    <td className="text-slate-600 text-xs sm:text-sm truncate" title={label(c.paymentAttempt.failureReason)}>
                      {label(c.paymentAttempt.failureReason)}
                    </td>
                    <td className="font-semibold tabular-nums text-slate-900">{inr(c.paymentAttempt.amount)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={c.predictedRecoveryProbability} size="sm" className="flex-1" />
                        <span className="text-xs font-medium tabular-nums text-slate-500 w-6 shrink-0">{c.predictedRecoveryProbability}</span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={c.recommendedAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-50/30">
            <CheckCircle size={24} className="text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600">No actionable cases in the queue.</p>
            <p className="text-xs text-slate-400 mt-1">All high-priority cases have been processed.</p>
          </div>
        )}
      </section>
    </div>
  );
}
