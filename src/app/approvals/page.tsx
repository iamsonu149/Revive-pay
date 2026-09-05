import {db} from '@/lib/db';
import {requireMerchant} from '@/lib/require-merchant';
import {ApprovalQueue,ApprovalRow} from '@/components/approvals/approval-queue';
import {approvalRequired} from '@/domain/recovery/policy';

export const dynamic='force-dynamic';

export default async function ApprovalsPage(){
 await requireMerchant();const since=new Date(Date.now()-7*86400000);const settings=await db.setting.upsert({where:{id:'merchant'},update:{},create:{id:'merchant'}});
 const cases=await db.recoveryCase.findMany({
   where:{execution:null,status:{in:['PENDING_APPROVAL','NEEDS_REVIEW','APPROVED']}},
   include:{
    paymentAttempt:{include:{customer:{include:{contacts:{where:{createdAt:{gt:since}}}}},subscription:true}},
    analyses:{where:{status:'COMPLETE'},orderBy:{createdAt:'desc'},take:1},
   },
   orderBy:[{predictedRecoveryProbability:'desc'},{createdAt:'desc'}],take:200,
 });
 const rows:ApprovalRow[]=cases.filter(c=>approvalRequired(c.paymentAttempt.amount,settings)||c.requiresHumanApproval||c.status==='NEEDS_REVIEW'||c.recommendedAction==='NEEDS_REVIEW'||(c.status==='APPROVED'&&c.approvedAmount!==c.paymentAttempt.amount)).map(c=>{
   let diagnosis:string|null=null,analysisSource:string|null=null;
   try{const parsed=JSON.parse(c.analyses[0]?.analysisJson??'null') as {diagnosis?:unknown}|null;diagnosis=typeof parsed?.diagnosis==='string'?parsed.diagnosis:null;analysisSource=c.analyses[0]?.source??null;}catch{}
   const reason=c.status==='NEEDS_REVIEW'||c.recommendedAction==='NEEDS_REVIEW'?'Policy requires an explicit merchant decision.':c.approvedAmount!==null&&c.approvedAmount!==c.paymentAttempt.amount?'Payment amount changed after approval.':c.paymentAttempt.amount>10000?'Amount exceeds the mandatory ₹10,000 approval boundary.':'Merchant policy requires approval.';
   return {id:c.id,createdAt:c.createdAt.toISOString(),customer:c.paymentAttempt.customer.name,failureReason:c.paymentAttempt.failureReason,amount:c.paymentAttempt.amount,score:c.predictedRecoveryProbability,risk:c.paymentAttempt.customer.riskBand,contacts:c.paymentAttempt.customer.contacts.length,expectedValue:Math.round(c.paymentAttempt.amount*c.predictedRecoveryProbability/100),action:c.recommendedAction,status:c.status,reason,diagnosis,analysisSource};
 });
 return <div className="p-8 animate-fade-in"><div className="mb-8"><p className="page-eyebrow">Human-in-the-loop controls</p><h2 className="page-title">Approval Center</h2><p className="mt-2 max-w-2xl text-sm text-slate-500">AI analysis is advisory. Every approval is rechecked by the deterministic policy engine immediately before execution.</p></div><ApprovalQueue initialRows={rows}/></div>;
}
