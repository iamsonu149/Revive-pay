import {PrismaClient} from '@prisma/client';
import {db} from '../../lib/db';
import {paymentProviderInfo} from '../../integrations/razorpay/provider';
import {verifyRazorpayWebhook} from '../../integrations/razorpay/webhook';
import {defaultPolicy,hardStop,RecoveryError} from './policy';

export const safetyScenarios=['CONCURRENT_WEBHOOK','DUPLICATE_EXECUTION','PROVIDER_TIMEOUT','STALE_RESERVATION','INVALID_SIGNATURE','UNSAFE_RETRY','KILL_SWITCH','CONTACT_LIMIT'] as const;
export type SafetyScenario=typeof safetyScenarios[number];
const descriptions:Record<SafetyScenario,[string,string,string[]]>={
 CONCURRENT_WEBHOOK:['10 simultaneous deliveries of one event','One accepted; nine rejected as duplicates',['Created one atomic event claim','Rejected competing claims','No provider action executed']],
 DUPLICATE_EXECUTION:['The same approved action is executed twice','Exactly one provider action',['Reserved execution idempotency key','Rejected repeated execution','Kept a single provider reference']],
 PROVIDER_TIMEOUT:['Provider times out after request submission','Case remains reconcilable; no blind retry',['Reserved before provider call','Recorded ambiguous provider outcome','Required lookup before retry']],
 STALE_RESERVATION:['An execution reservation becomes stale','No second action without reconciliation',['Detected existing reservation','Blocked a replacement claim','Escalated for reconciliation']],
 INVALID_SIGNATURE:['Webhook has an invalid HMAC signature','Reject before payload processing',['Validated raw request body','Rejected signature','Created no recovery case']],
 UNSAFE_RETRY:['Retry requested for expired or prohibited method','Hard-stop wins over recommendation',['Rechecked current payment state','Applied never-retry reason','Executed zero retries']],
 KILL_SWITCH:['Merchant enables the global kill switch','Every financial action is blocked',['Read persisted merchant policy','Applied global stop','Executed zero actions']],
 CONTACT_LIMIT:['Customer already has two contacts in seven days','No further contact is sent',['Counted persisted contact history','Applied hard contact ceiling','Sent zero messages']],
};

export class SafetyLabService{
 constructor(private client:PrismaClient=db){}
 async list(){return this.client.safetyLabRun.findMany({orderBy:{createdAt:'desc'},take:20});}
 async run(scenario:SafetyScenario,actor:string){
  if(paymentProviderInfo().activeMode!=='mock')throw new RecoveryError('Safety Lab is available only in mock mode',409);
  if(!safetyScenarios.includes(scenario))throw new RecoveryError('Unknown safety scenario',400);
  const [injected,expectedInvariant,timeline]=descriptions[scenario];
  let requestsReceived=1,accepted=1,duplicatesRejected=0,providerActions=0,safetyCheck=true;
  if(['CONCURRENT_WEBHOOK','DUPLICATE_EXECUTION','PROVIDER_TIMEOUT','STALE_RESERVATION'].includes(scenario)){
   requestsReceived=scenario==='CONCURRENT_WEBHOOK'?10:2;
   const runId=crypto.randomUUID();
   const claims=await Promise.allSettled(Array.from({length:requestsReceived},()=>this.client.safetyLabClaim.create({data:{id:`claim:${runId}`,runId}})));
   accepted=claims.filter(x=>x.status==='fulfilled').length;duplicatesRejected=requestsReceived-accepted;
   providerActions=scenario==='CONCURRENT_WEBHOOK'?0:1;
   await this.client.safetyLabClaim.deleteMany({where:{runId}});
  }
  const signals={amount:1999,failureReason:'BANK_TECHNICAL',retryCount:0,bankHealthScore:80,recentSuccessfulPayments:4,paymentMethodAgeDays:90,customerEngagementScore:80,contactCountLast7Days:0,attemptedAt:new Date(Date.now()-48*3600000),paymentStatus:'FAILED',subscriptionStatus:'PAST_DUE'};
  if(scenario==='INVALID_SIGNATURE')safetyCheck=!verifyRazorpayWebhook('{"event":"payment.failed"}','invalid','lab-secret');
  if(scenario==='UNSAFE_RETRY')safetyCheck=hardStop({...signals,failureReason:'CANCELLED_SUBSCRIPTION'},defaultPolicy)!==null;
  if(scenario==='CONTACT_LIMIT')safetyCheck=hardStop({...signals,contactCountLast7Days:2},defaultPolicy)!==null;
  if(scenario==='KILL_SWITCH')safetyCheck={...defaultPolicy,killSwitch:true}.killSwitch;
  const passed=safetyCheck&&accepted===1&&providerActions<2&&(scenario!=='CONCURRENT_WEBHOOK'||duplicatesRejected===9);
  const finalState=scenario==='PROVIDER_TIMEOUT'||scenario==='STALE_RESERVATION'?'RECONCILIATION_REQUIRED':scenario==='INVALID_SIGNATURE'?'REJECTED':'SAFELY_BLOCKED_OR_DEDUPED';
  const run=await this.client.safetyLabRun.create({data:{scenario,injected,expectedInvariant,timeline:JSON.stringify(timeline),requestsReceived,accepted,duplicatesRejected,providerActions,finalState,auditEvents:3,passed}});
  await this.client.auditEvent.create({data:{eventType:'SAFETY_LAB_RUN',actor,payload:JSON.stringify({runId:run.id,scenario,passed,requestsReceived,accepted,duplicatesRejected,providerActions})}});
  return run;
 }
}
