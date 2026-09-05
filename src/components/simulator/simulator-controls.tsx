'use client';

import {useState} from 'react';
import {AlertCircle,Play,RotateCcw,ShieldCheck,ShieldX} from 'lucide-react';
import {clsx} from 'clsx';
import {inr} from '@/lib/currency';
import type {Metrics} from '@/domain/simulation/baseline-strategies';
import {defaultAssumptions,deploymentSafetyConstraints,type SimulationAssumptions} from '@/domain/simulation/simulator';

const fields:[keyof SimulationAssumptions,string][]=[['retryCost','Retry cost ₹'],['contactCost','Contact cost ₹'],['riskLoss','Unsafe retry loss ₹'],['churnCost','High-pressure churn ₹'],['seed','Replay seed']];

export function SimulatorControls({initial}:{initial:Metrics[]}){
 const [data,setData]=useState(initial),[assumptions,setAssumptions]=useState(defaultAssumptions),[running,setRunning]=useState(false),[error,setError]=useState('');
 const bestNet=Math.max(1,...data.map(row=>row.netRecoveredValue));
 const naive=data.find(row=>row.strategyName==='Naive Retry All');
 const revive=data.find(row=>row.strategyName==='Revive Pay Decision Engine');

 async function run(){setRunning(true);setError('');try{const response=await fetch('/api/simulator/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(assumptions)});const body=await response.json();if(!response.ok)throw Error(body.error);setData(body);}catch(cause){setError(cause instanceof Error?cause.message:'Replay failed');}finally{setRunning(false);}}

 return <>
  {error&&<div className="callout callout-danger mb-4" role="alert"><AlertCircle size={15}/>{error}</div>}
  <div className="card card-static p-5">
   <div className="flex flex-wrap items-end gap-3">{fields.map(([key,label])=><label key={key} className="text-xs text-slate-500">{label}<input className="input mt-1 w-36" type="number" min="0" value={assumptions[key]} onChange={event=>setAssumptions(current=>({...current,[key]:Number(event.target.value)}))}/></label>)}<button disabled={running} onClick={()=>void run()} className="btn-primary">{running?<RotateCcw size={14} className="animate-spin"/>:<Play size={14}/>}Run deterministic replay</button></div>
   <p className="mt-3 text-xs text-slate-500">Reproducible synthetic evidence · same persisted cases · replay ID {data[0]?.replayId??'seed-42'}</p>
   <p className="mt-1 text-xs font-medium text-slate-700">Deployment gate: zero unsafe retries and customer pressure ≤ {deploymentSafetyConstraints.maximumCustomerPressure}/10.</p>
  </div>

  <div className="mt-5 grid gap-4 lg:grid-cols-3">{data.map(row=><article key={row.strategyName} className={clsx('card p-6',row.bestDeployable&&'border-emerald-300 shadow-glow-emerald',row.deployable===false&&'border-red-200')}>
   <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{row.strategyName}</p><div className="flex flex-wrap justify-end gap-1">{row.paretoEfficient&&<span className="badge-success">Pareto frontier</span>}{row.bestDeployable?<span className="badge-success">Best deployable strategy</span>:row.deployable?<span className="badge-info">Deployable</span>:<span className="badge-danger">Not deployable</span>}</div></div>
   <p className={clsx('mt-4 text-3xl font-bold',row.bestDeployable?'text-emerald-600':'text-slate-900')}>{inr(row.netRecoveredValue)}</p><p className="text-xs text-slate-500">Risk-adjusted net recovered value</p>
   {row.deployable===false&&<div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"><p className="flex items-center gap-1 font-semibold"><ShieldX size={13}/>Safety policy violation</p><ul className="mt-1 list-disc space-y-1 pl-4">{row.safetyViolationReasons?.map(reason=><li key={reason}>{reason}</li>)}</ul>{row.paretoEfficient&&<p className="mt-2">Pareto-efficient economics do not override mandatory operating constraints.</p>}</div>}
   <div className="mt-5 space-y-2 border-t pt-4 text-xs">{[['Gross recovered',inr(row.recoveredAmount)],['Retry + contact cost',inr(row.estimatedRetryCost+row.estimatedContactCost)],['Expected risk loss',inr(row.expectedRiskLoss)],['Estimated churn impact',inr(row.estimatedChurnImpact)],['Recovery / retry',inr(row.recoveryPerRetry)],['Recovery / contact',inr(row.recoveryPerContact)],['Approval workload',row.approvalWorkload],['Unsafe retries',row.unsafeRetriesAttempted],['Customers protected',row.customersProtected]].map(([key,value])=><div key={key} className="flex justify-between"><span className="text-slate-500">{key}</span><strong>{value}</strong></div>)}</div>
   <div className="mt-5"><div className="flex justify-between text-xs"><span>Customer pressure</span><span>{row.customerAnnoyanceScore}/10</span></div><div className="mt-1 h-2 rounded bg-slate-100"><div className={clsx('h-full rounded',row.customerAnnoyanceScore<=3?'bg-emerald-500':'bg-red-500')} style={{width:`${row.customerAnnoyanceScore*10}%`}}/></div></div>
   {row.customersProtected>0&&<p className="mt-4 flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck size={13}/>{row.customersProtected} customers protected from unsafe retry</p>}
  </article>)}</div>

  {naive&&revive&&<aside className="callout callout-warning mt-5 items-start" aria-labelledby="why-not-retry"><AlertCircle size={16} className="mt-0.5 shrink-0"/><div><h3 id="why-not-retry" className="font-semibold">Why not retry everything?</h3><p className="mt-1 text-xs leading-relaxed">Retry-all shows {inr(naive.recoveredAmount)} gross recovered value, but attempts {naive.unsafeRetriesAttempted} unsafe retries and reaches {naive.customerAnnoyanceScore}/10 customer pressure. Revive Pay shows {inr(revive.recoveredAmount)} gross recovered value, protects {revive.customersProtected} customers, attempts {revive.unsafeRetriesAttempted} unsafe retries and keeps pressure at {revive.customerAnnoyanceScore}/10. Higher gross or net value is not operationally acceptable when it breaches the deployment gate.</p></div></aside>}

  <div className="card card-static mt-5 p-6"><h3 className="font-semibold">Net value vs customer pressure</h3><div className="mt-5 grid h-44 grid-cols-10 items-end gap-3 border-b border-l p-3">{data.map(row=><div key={row.strategyName} className="col-span-3 flex h-full flex-col justify-end"><div title={`${inr(row.netRecoveredValue)} net · ${row.customerAnnoyanceScore}/10 pressure`} className={clsx('rounded-t-lg',row.paretoEfficient?'bg-emerald-500':'bg-slate-400')} style={{height:`${Math.max(8,Math.min(100,(row.netRecoveredValue/bestNet)*100))}%`}}/><p className="mt-2 truncate text-[10px]">{row.strategyName}</p></div>)}</div><p className="mt-3 text-xs text-slate-500">Green marks the economic Pareto frontier: no alternative has both equal-or-better net value and equal-or-lower pressure. Deployability is stricter and separately requires zero unsafe retries and pressure no greater than 3/10.</p></div>
 </>;
}
