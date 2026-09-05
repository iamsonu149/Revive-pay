import {db} from '../../lib/db';
import {scoreRecovery} from '../recovery/recovery-scorer';
import {approvalRequired,hardStop} from '../recovery/policy';
import {simulate,strategies,SimulationRow} from './simulator';
export async function simulationMetrics(save=false,actor='SYSTEM') {
 const now=new Date();
 const settings=await db.setting.upsert({where:{id:'merchant'},update:{},create:{id:'merchant'}});
 const cases=await db.recoveryCase.findMany({where:{paymentAttempt:{status:'FAILED'},execution:null},include:{paymentAttempt:{include:{subscription:true,customer:{include:{contacts:{where:{createdAt:{gt:new Date(now.getTime()-7*86400000)}}}}}}}},orderBy:{id:'asc'}});
 const rows:SimulationRow[]=cases.map(c=>{
   const signals={...c.paymentAttempt,paymentStatus:c.paymentAttempt.status,subscriptionStatus:c.paymentAttempt.subscription.status,contactCountLast7Days:c.paymentAttempt.customer.contacts.length};
   const decision=scoreRecovery(signals,now,settings);
   const stopped=!!hardStop(signals,settings)||c.status==='STOPPED';
   const needsApproval=(approvalRequired(signals.amount,settings)||c.requiresHumanApproval||c.status==='NEEDS_REVIEW'||c.recommendedAction==='NEEDS_REVIEW'||decision.recommendation==='NEEDS_REVIEW')&&(c.status!=='APPROVED'||c.approvedAmount!==signals.amount);
   const action=stopped||settings.killSwitch?'STOP':needsApproval?'NEEDS_REVIEW':decision.recommendation==='NEEDS_REVIEW'&&c.status==='APPROVED'?c.recommendedAction:decision.recommendation;
   return {id:c.id,amount:signals.amount,status:c.status,recommendedAction:action,predictedRecoveryProbability:decision.probability,unsafeRetry:stopped||['EXPIRED_CARD','EXPIRED_MANDATE'].includes(signals.failureReason)};
 });
 const result=strategies.map(s=>simulate(rows,s));
 if(save)await db.$transaction(async tx=>{
   await tx.simulationRun.createMany({data:result});
   await tx.auditEvent.create({data:{eventType:'SIMULATION_RUN',actor,payload:JSON.stringify({asOf:now,results:result})}});
 });
 return result;
}
