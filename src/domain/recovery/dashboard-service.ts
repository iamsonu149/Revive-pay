import {db} from '../../lib/db';
import {approvalRequired} from './policy';
export async function dashboardData() {
 const settings=await db.setting.upsert({where:{id:'merchant'},update:{},create:{id:'merchant'}});
 const cases=await db.recoveryCase.findMany({include:{execution:true,paymentAttempt:{include:{customer:true}}},orderBy:{predictedRecoveryProbability:'desc'}});
 const recoveredCases=cases.filter(c=>c.status==='RECOVERED');
 const active=cases.filter(c=>!['STOPPED','RECOVERED','FAILED'].includes(c.status));
 const recovered=recoveredCases.reduce((sum,c)=>sum+c.recoveredAmount,0);
 const atRisk=active.reduce((sum,c)=>sum+c.paymentAttempt.amount,0);
 const pending=active.filter(c=>!c.execution&&(approvalRequired(c.paymentAttempt.amount,settings)||c.requiresHumanApproval||c.recommendedAction==='NEEDS_REVIEW'||c.status==='NEEDS_REVIEW')&&(c.status!=='APPROVED'||c.approvedAmount!==c.paymentAttempt.amount)).length;
 const queue=active.filter(c=>!c.execution&&['RETRY_LATER','SEND_PAYMENT_UPDATE_LINK'].includes(c.recommendedAction)).slice(0,6);
 const confirmed=recoveredCases.sort((a,b)=>(b.recoveredAt?.getTime()??0)-(a.recoveredAt?.getTime()??0)).slice(0,6);
 const breakdown=Object.entries(cases.reduce<Record<string,number>>((a,c)=>{a[c.paymentAttempt.failureReason]=(a[c.paymentAttempt.failureReason]||0)+1;return a;},{}));
 return {total:cases.length,recovered,atRisk,pending,queue,confirmed,breakdown,rate:cases.length?(100*recoveredCases.length/cases.length).toFixed(1):'0.0'};
}
