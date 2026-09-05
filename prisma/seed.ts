import {PrismaClient} from '@prisma/client';
import {scoreRecovery} from '../src/domain/recovery/recovery-scorer';
const db=new PrismaClient();
const reasons=['INSUFFICIENT_FUNDS','BANK_TECHNICAL','EXPIRED_CARD','EXPIRED_MANDATE','CUSTOMER_ABANDONMENT','CANCELLED_SUBSCRIPTION','SUSPECTED_CHARGEBACK','UNKNOWN_FAILURE','REFUND'];
async function main() {
 await db.auditEvent.deleteMany();await db.recoveryExecution.deleteMany();await db.mockProviderOperation.deleteMany();await db.contactEvent.deleteMany();await db.recoveryCase.deleteMany();await db.paymentAttempt.deleteMany();await db.subscription.deleteMany();await db.customer.deleteMany();await db.simulationRun.deleteMany();
 const settings=await db.setting.upsert({where:{id:'merchant'},update:{killSwitch:false,autoRecoveryLimit:10000,maxContacts:2},create:{id:'merchant'}});
 const now=new Date();
 for(let i=0;i<300;i++) {
   const reason=i===299?'BANK_TECHNICAL':reasons[i%reasons.length];
   const amount=i<22?12000+i*300:499+(i%8)*500;
   const contacts=i>=30&&i<45?2:i%19===0?1:0;
   const customer=await db.customer.create({data:{name:`${['Aarav','Diya','Kabir','Meera'][i%4]} ${String(i+1).padStart(3,'0')}`,email:`customer${i+1}@example.com`,phone:`+91 98${String(10000000+i).slice(-8)}`,riskBand:i%5===0?'HIGH':'LOW'}});
   const subscriptionStatus=reason==='CANCELLED_SUBSCRIPTION'?'CANCELLED':'PAST_DUE';
   const paymentStatus=reason==='REFUND'?'REFUNDED':reason==='SUSPECTED_CHARGEBACK'?'CHARGEBACK':'FAILED';
   const sub=await db.subscription.create({data:{customerId:customer.id,planName:i%2?'Growth Monthly':'Pro Annual',amount,status:subscriptionStatus,nextBillingDate:new Date(now.getTime()+86400000*7)}});
   const attempt=await db.paymentAttempt.create({data:{id:i===299?'outage-attempt':undefined,subscriptionId:sub.id,customerId:customer.id,amount,status:paymentStatus,failureReason:reason,attemptedAt:new Date(now.getTime()-(i%120)*3600000),retryCount:i===299?0:i%13===0?1:0,paymentMethodAgeDays:90+(i%900),recentSuccessfulPayments:i===299?6:i%9,bankHealthScore:i===299?90:35+(i*11)%61,customerEngagementScore:25+(i*17)%71,contactCountLast7Days:contacts}});
   for(let n=0;n<contacts;n++)await db.contactEvent.create({data:{customerId:customer.id,reservationKey:`seed_${attempt.id}_${n}`,createdAt:new Date(now.getTime()-(n+1)*86400000)}});
   const d=scoreRecovery({...attempt,paymentStatus,subscriptionStatus},now,settings);
   const status=d.recommendation==='STOP'?'STOPPED':d.recommendation==='NEEDS_REVIEW'?'NEEDS_REVIEW':'PENDING_APPROVAL';
   const c=await db.recoveryCase.create({data:{paymentAttemptId:attempt.id,predictedRecoveryProbability:d.probability,recommendedAction:d.recommendation,reasonSummary:d.reasonSummary,evidence:JSON.stringify(d.evidence),status,requiresHumanApproval:d.requiresHumanApproval,scheduledFor:d.recommendation==='RETRY_LATER'?new Date(attempt.attemptedAt.getTime()+86400000):null}});
   await db.auditEvent.create({data:{recoveryCaseId:c.id,eventType:'RECOMMENDATION_CREATED',actor:'SYSTEM',payload:JSON.stringify({asOf:now,decision:d})}});
 }
 await db.auditEvent.create({data:{eventType:'SAFETY_DATA_UPGRADED',actor:'SYSTEM',payload:JSON.stringify({source:'Fresh seed with timestamped contact history'})}});
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
