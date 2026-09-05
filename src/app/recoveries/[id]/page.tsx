import {AIAnalystPanel} from '@/components/recoveries/ai-analyst-panel';
import {requireMerchant} from '@/lib/require-merchant';
import {db} from '@/lib/db';
import {notFound} from 'next/navigation';
import {inr} from '@/lib/currency';
import {label} from '@/lib/utils';
import {approvalRequired, hardStop} from '@/domain/recovery/policy';
import {ApprovalPanel} from '@/components/recoveries/approval-panel';
import {StatusBadge} from '@/components/ui/status-badge';
import {ProgressBar} from '@/components/ui/progress-bar';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldAlert,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Users,
  Zap,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Detail({params}: {params: {id: string}}) {
  await requireMerchant();

  const c = await db.recoveryCase.findUnique({
    where: {id: params.id},
    include: {
      execution: true,
      paymentAttempt: {
        include: {
          customer: {
            include: {
              contacts: {where: {createdAt: {gt: new Date(Date.now() - 7 * 86400000)}}},
            },
          },
          subscription: true,
        },
      },
      events: {orderBy: {createdAt: 'desc'}},
    },
  });

  if (!c) return notFound();

  const settings = await db.setting.upsert({where: {id: 'merchant'}, update: {}, create: {id: 'merchant'}});
  const p = c.paymentAttempt;
  const required = approvalRequired(p.amount, settings) || c.requiresHumanApproval;
  const stop = hardStop(
    {
      ...p,
      paymentStatus: p.status,
      subscriptionStatus: p.subscription.status,
      contactCountLast7Days: p.customer.contacts.length,
    },
    settings,
  );
  const evidence = JSON.parse(c.evidence) as string[];
  const score = c.predictedRecoveryProbability;

  const eventTypeIcon: Record<string, typeof ShieldAlert> = {};
  void eventTypeIcon;

  return (
    <div className="p-8 animate-fade-in">
      {/* Breadcrumb + header */}
      <div className="mb-6">
        <Link
          href="/recoveries"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-4"
        >
          <ArrowLeft size={13} /> Recovery queue
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="page-eyebrow">Recovery case · {c.id.slice(-7)}</p>
            <h2 className="page-title">{p.customer.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{p.customer.email} · {p.subscription.planName}</p>
          </div>
          <StatusBadge status={c.status} className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Main panel */}
        <div className="col-span-1 xl:col-span-2 space-y-5">

          {/* Score + decision */}
          <section className="card card-static" aria-labelledby="decision-heading">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 id="decision-heading" className="section-title">Deterministic decision</h3>
              <p className="mt-0.5 text-xs text-slate-500">Saved decision score; safeguards re-checked at execution.</p>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-6">
                {/* Score ring */}
                <div className="flex items-center gap-4">
                  <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-slate-100">
                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                      <circle
                        cx="40" cy="40" r="34" fill="none"
                        stroke={score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8"
                        strokeDasharray={`${(score / 100) * 213.6} 213.6`}
                        strokeLinecap="round"
                        style={{transition: 'stroke-dasharray 0.8s ease-out'}}
                      />
                    </svg>
                    <span className="text-lg font-bold tabular-nums text-slate-900">{score}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Heuristic score</p>
                    <ProgressBar value={score} size="md" className="mt-2 w-32" showLabel />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Payment amount</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{inr(p.amount)}</p>
                </div>
              </div>

              {/* Recommended action callout */}
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Recommended action</p>
                <p className="mt-1 text-base font-bold text-emerald-900">{label(c.recommendedAction)}</p>
                <p className="mt-1 text-sm text-emerald-800">{c.reasonSummary}</p>
              </div>

              {/* Evidence chips */}
              <div className="mt-6">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Decision evidence</h4>
                <ul className="flex flex-wrap gap-2">
                  {evidence.map(x => (
                    <li
                      key={x}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" aria-hidden="true" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Action controls */}
          <section className="card card-static" aria-labelledby="controls-heading">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 id="controls-heading" className="section-title">Action controls</h3>
              <p className="mt-0.5 text-xs text-slate-500">One persistent action per case. Mock payments only.</p>
            </div>
            <div className="p-6">
              <ApprovalPanel
                id={c.id}
                status={
                  c.status === 'APPROVED' && c.approvedAmount !== p.amount
                    ? 'PENDING_APPROVAL'
                    : c.status
                }
                required={required || (c.status === 'APPROVED' && c.approvedAmount !== p.amount)}
                action={c.recommendedAction}
                hasExecution={!!c.execution}
                scheduledFor={
                  c.recommendedAction === 'RETRY_LATER'
                    ? new Date(
                        Math.max(
                          c.scheduledFor?.getTime() ?? 0,
                          p.attemptedAt.getTime() + 86400000,
                        ),
                      ).toISOString()
                    : null
                }
              />
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">

          {/* Safeguards */}
          <section className="card card-static" aria-labelledby="safeguards-heading">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 id="safeguards-heading" className="section-title flex items-center gap-2">
                <Shield size={15} className="text-slate-500" />
                Current safeguards
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {/* Kill switch */}
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  {settings.killSwitch
                    ? <XCircle size={15} className="text-red-500 shrink-0" />
                    : <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
                  Kill switch
                </div>
                <span className={`text-xs font-semibold ${settings.killSwitch ? 'text-red-600' : 'text-emerald-600'}`}>
                  {settings.killSwitch ? 'Enabled — blocked' : 'Off'}
                </span>
              </div>

              {/* Retries */}
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Zap size={15} className={`shrink-0 ${p.retryCount >= 1 ? 'text-red-500' : 'text-slate-400'}`} />
                  Automated retries
                </div>
                <span className={`text-xs font-semibold tabular-nums ${p.retryCount >= 1 ? 'text-red-600' : 'text-slate-600'}`}>
                  {p.retryCount}/1
                </span>
              </div>

              {/* Contacts */}
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Users size={15} className={`shrink-0 ${p.customer.contacts.length >= settings.maxContacts ? 'text-amber-500' : 'text-slate-400'}`} />
                  Contacts (7 days)
                </div>
                <span className={`text-xs font-semibold tabular-nums ${p.customer.contacts.length >= settings.maxContacts ? 'text-amber-700' : 'text-slate-600'}`}>
                  {p.customer.contacts.length}/{settings.maxContacts}
                </span>
              </div>

              {/* Approval */}
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <ShieldAlert size={15} className={`shrink-0 ${required ? 'text-amber-500' : 'text-slate-400'}`} />
                  Approval
                </div>
                <span className={`text-xs font-semibold ${c.status === 'APPROVED' ? 'text-emerald-600' : required || c.recommendedAction === 'NEEDS_REVIEW' ? 'text-amber-700' : 'text-slate-500'}`}>
                  {c.status === 'APPROVED'
                    ? 'Approved'
                    : required || c.recommendedAction === 'NEEDS_REVIEW'
                    ? 'Required'
                    : 'Not required'}
                </span>
              </div>
            </div>

            {(stop || c.execution) && (
              <div className="border-t border-slate-100 px-6 py-4 space-y-2">
                {stop && (
                  <div className="callout callout-danger">
                    <XCircle size={15} className="shrink-0 mt-0.5" />
                    <p className="text-xs">New actions blocked: {stop}</p>
                  </div>
                )}
                {c.execution && (
                  <div className="callout callout-muted">
                    <Clock size={15} className="shrink-0 mt-0.5" />
                    <p className="text-xs">Provider operation: {c.execution.status}. Outcome can be reconciled without sending another action.</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Audit timeline */}
          <section className="card card-static" aria-labelledby="timeline-heading">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 id="timeline-heading" className="section-title">Audit timeline</h3>
            </div>
            <div className="px-6 py-4">
              {c.events.length ? (
                <ol className="relative border-l border-slate-200 ml-2">
                  {c.events.map(e => (
                    <li key={e.id} className="mb-5 ml-5">
                      <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                      </span>
                      <p className="text-xs font-semibold text-slate-900">{label(e.eventType)}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {e.actor} · {e.createdAt.toLocaleString('en-IN')}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-400">No events recorded.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* AI Analyst Panel */}
      <AIAnalystPanel id={c.id} caseVersion={c.updatedAt.toISOString()} />
    </div>
  );
}

