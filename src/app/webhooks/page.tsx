import {db} from '@/lib/db';
import {requireMerchant} from '@/lib/require-merchant';

export const dynamic='force-dynamic';
const badge=(value:string)=>value==='PROCESSED'?'badge-success':value==='FAILED'||value==='REJECTED'?'badge-danger':'badge-warning';

export default async function WebhookOperations(){
 await requireMerchant();
 const events=await db.providerWebhookEvent.findMany({orderBy:{receivedAt:'desc'},take:100});
 return <div className="p-8 animate-fade-in"><p className="page-eyebrow">Provider reliability</p><h2 className="page-title">Webhook operations</h2><p className="mt-2 text-sm text-slate-500">Every accepted, rejected and duplicate Razorpay delivery, with no payloads or secrets exposed.</p>
 <div className="card mt-7 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr>{['Event / type','Received','Signature','Duplicates','Latency','Case','Result','Retry / dead letter','Mode'].map(x=><th key={x} className="px-4 py-3 font-semibold">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{events.map(e=><tr key={e.id} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="font-mono text-[11px] text-slate-700">{e.providerEventId??e.id}</p><p className="text-slate-500">{e.eventType}</p></td><td className="px-4 py-3 whitespace-nowrap">{e.receivedAt.toLocaleString('en-IN')}</td><td className="px-4 py-3">{e.signatureValid?'Valid':'Rejected'}</td><td className="px-4 py-3 tabular-nums">{e.duplicateCount}</td><td className="px-4 py-3 tabular-nums">{e.processingLatencyMs===null?'—':`${e.processingLatencyMs} ms`}</td><td className="px-4 py-3 font-mono">{e.recoveryCaseId?.slice(0,10)??'—'}</td><td className="px-4 py-3"><span className={badge(e.status)}>{e.status}</span></td><td className="px-4 py-3">{e.retryStatus}{e.deadLetter?' · dead letter':''}</td><td className="px-4 py-3">{e.provider}</td></tr>)}</tbody></table>{events.length===0&&<p className="p-8 text-center text-sm text-slate-500">No webhook deliveries yet.</p>}</div></div>;
}
