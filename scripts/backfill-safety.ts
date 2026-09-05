import {db} from '../src/lib/db';
import {scoreRecovery} from '../src/domain/recovery/recovery-scorer';
async function main() {
 const marker='SAFETY_DATA_UPGRADED';
 if(await db.auditEvent.findFirst({where:{eventType:marker}}))return;
 await db.$transaction(async tx=>{
   const now=new Date();
   const settings=await tx.setting.upsert({where:{id:'merchant'},update:{},create:{id:'merchant'}});
   await tx.setting.update({where:{id:'merchant'},data:{autoRecoveryLimit:Math.min(10000,Math.max(0,settings.autoRecoveryLimit)),maxContacts:Math.min(2,Math.max(0,settings.maxContacts))}});
   const attempts=await tx.paymentAttempt.findMany();
   for(const p of attempts) {
     // Legacy counters lack timestamps: reserve them for seven days from upgrade conservatively.
     for(let i=0;i<Math.min(2,p.contactCountLast7Days);i++)await tx.contactEvent.upsert({where:{reservationKey:`legacy_${p.id}_${i}`},update:{},create:{customerId:p.customerId,reservationKey:`legacy_${p.id}_${i}`,createdAt:now}});
   }
   const cases=await tx.recoveryCase.findMany({include:{paymentAttempt:{include:{subscription:true}},execution:true}});
   for(const c of cases) {
     if(c.execution)continue;
     if(['EXECUTED','RECOVERED','PROCESSING'].includes(c.status) || await tx.auditEvent.findFirst({where:{recoveryCaseId:c.id,eventType:{in:['EXECUTED','PROVIDER_UNAVAILABLE']}}})) {
       await tx.recoveryExecution.create({data:{id:`recovery_${c.id}`,recoveryCaseId:c.id,action:c.recommendedAction,status:'UNKNOWN'}});
       if(c.status!=='RECOVERED')await tx.recoveryCase.update({where:{id:c.id},data:{status:'NEEDS_REVIEW'}});
       continue;
     }
     const p=c.paymentAttempt;
     const contacts=await tx.contactEvent.count({where:{customerId:p.customerId,createdAt:{gt:new Date(now.getTime()-7*86400000)}}});
     const d=scoreRecovery({...p,paymentStatus:p.status,subscriptionStatus:p.subscription.status,contactCountLast7Days:contacts},now,settings);
     await tx.recoveryCase.update({where:{id:c.id},data:{predictedRecoveryProbability:d.probability,recommendedAction:d.recommendation,evidence:JSON.stringify(d.evidence),reasonSummary:d.reasonSummary,requiresHumanApproval:d.requiresHumanApproval,status:d.recommendation==='STOP'?'STOPPED':d.recommendation==='NEEDS_REVIEW'?'NEEDS_REVIEW':'PENDING_APPROVAL'}});
     await tx.auditEvent.create({data:{recoveryCaseId:c.id,eventType:'POLICY_REEVALUATED',actor:'SYSTEM',payload:JSON.stringify(d)}});
   }
   await tx.auditEvent.create({data:{eventType:marker,actor:'SYSTEM',payload:JSON.stringify({at:now,legacyContacts:'Reserved conservatively for seven days',legacyExecutions:'Locked pending reconciliation'})}});
 },{timeout:60000});
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
