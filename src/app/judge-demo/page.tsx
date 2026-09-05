import Link from 'next/link';
import {ArrowRight,CheckCircle2} from 'lucide-react';
import {requireMerchant} from '@/lib/require-merchant';
import {inr} from '@/lib/currency';
import {paymentProviderInfo} from '@/integrations/razorpay/provider';
import {simulationMetrics} from '@/domain/simulation/simulation-service';
import {SafeDemoBatchService} from '@/domain/recovery/safe-demo-batch-service';
import {SafeDemoBatchPanel} from '@/components/judge-demo/safe-demo-batch-panel';

export const dynamic='force-dynamic';
const steps=[['1 · See the signal','Dashboard','Show persisted failed revenue, recovery health and provider mode.','/dashboard'],['2 · Exercise merchant control','Approval Center','Compare AI diagnosis with deterministic policy, adjust and approve.','/approvals'],['3 · Prove safe execution','Recovery queue','Execute one approved action and inspect its recovery timeline.','/recoveries'],['4 · Break it safely','Safety Lab','Inject duplicate, timeout, signature and policy faults; verify invariants.','/safety-lab'],['5 · Compare economics','Strategy simulator','Explain deployability, net-value and Pareto tradeoffs on the same cases.','/simulator'],['6 · Verify evidence','Webhook operations','Show signature, deduplication, latency, result and retry state.','/webhooks']];

export default async function Page(){
 await requireMerchant();
 const provider=paymentProviderInfo();
 const simulation=await simulationMetrics();
 const demoBatches=provider.activeMode==='mock'?await new SafeDemoBatchService().list():[];
 const revive=simulation.find(row=>row.strategyName==='Revive Pay Decision Engine');
 const evidence=revive?[['Cases evaluated',revive.totalPayments],['Gross recovered',inr(revive.recoveredAmount)],['Risk-adjusted net',inr(revive.netRecoveredValue)],['Unsafe retries',revive.unsafeRetriesAttempted],['Customers protected',revive.customersProtected],['Customer pressure',`${revive.customerAnnoyanceScore}/10`]]:[];
 return <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
  <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-brand-950 to-slate-900 p-6 text-white shadow-xl sm:p-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-brand-300">Five-minute buildathon walkthrough</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">From failed payment to safely recovered revenue.</h2><p className="mt-3 max-w-2xl text-sm text-slate-300">One guided flow ties together diagnosis, merchant authority, exactly-once execution, resilience evidence and risk-adjusted economics.</p><span className="mt-5 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs">Current provider: {provider.displayName}</span></div>
  {revive&&<section className="card card-static mt-7 p-6" aria-labelledby="batch-evidence"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="page-eyebrow">Reproducible synthetic evidence</p><h3 id="batch-evidence" className="text-xl font-semibold text-slate-900">Batch evidence</h3><p className="mt-1 text-xs text-slate-500">Revive Pay Decision Engine · replay seed {revive.seed} · {revive.replayId}</p></div><span className={revive.bestDeployable?'badge-success':'badge-warning'}>{revive.bestDeployable?'Best deployable strategy':revive.deployable?'Deployable':'Not deployable'}</span></div><dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{evidence.map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</dd></div>)}</dl><p className="mt-4 text-xs leading-relaxed text-slate-500">These are deterministic simulator results from the current eligible case batch, not confirmed provider revenue or a production-lift claim.</p></section>}
  {provider.activeMode==='mock'?<SafeDemoBatchPanel initial={demoBatches}/>:<div className="callout callout-warning mt-7">Safe Demo Batch is available only in mock mode and cannot run against Razorpay Test Mode.</div>}
  <div className="mt-7 grid gap-4 md:grid-cols-2">{steps.filter(step=>step[3]!=='/safety-lab'||provider.activeMode==='mock').map(([number,title,copy,href])=><Link href={href} key={href} className="card group p-6 hover:border-brand-300"><div className="flex justify-between"><CheckCircle2 className="text-emerald-500" size={20}/><ArrowRight className="text-slate-400 transition-transform group-hover:translate-x-1" size={18}/></div><p className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-600">{number}</p><h3 className="mt-1 text-xl font-semibold">{title}</h3><p className="mt-2 text-sm text-slate-500">{copy}</p></Link>)}</div>
  <div className="callout mt-6"><strong>Track 3 conclusion:</strong>&nbsp; Revive Pay detects revenue at risk, selects a bounded intervention, executes safely and records verified outcomes.</div>
 </div>;
}
