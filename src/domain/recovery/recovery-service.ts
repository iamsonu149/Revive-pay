import {Prisma, PrismaClient} from '@prisma/client';
import {db} from '../../lib/db';
import {MockRazorpayAdapter} from '../../integrations/razorpay/mock-razorpay-adapter';
import {ProviderResult, RazorpayAdapter} from '../../integrations/razorpay/razorpay-adapter';
import {createPaymentProvider} from '../../integrations/razorpay/provider';
import {RazorpayProviderError} from '../../integrations/razorpay/razorpay-test-adapter';
import {allowedActions,approvalRequired, hardStop,isQuietHour, RecoveryError} from './policy';
import {scoreRecovery} from './recovery-scorer';

const actionable=['RETRY_LATER','SEND_PAYMENT_UPDATE_LINK'];
const day=86400000;
const event=(tx:Prisma.TransactionClient,id:string,type:string,actor:string,payload:object={}) =>
 tx.auditEvent.create({data:{recoveryCaseId:id,eventType:type,actor,payload:JSON.stringify(payload)}});

export class RecoveryService {
 constructor(private client:PrismaClient=db, public adapter:RazorpayAdapter=createPaymentProvider(client), private clock=()=>new Date()) {}

 private async context(tx:Prisma.TransactionClient,id:string) {
   // A write first obtains SQLite's writer lock, serializing policy/claim/contact reservations.
   const settings=await tx.setting.upsert({where:{id:'merchant'},update:{},create:{id:'merchant'}});
   await tx.setting.update({where:{id:'merchant'},data:{killSwitch:settings.killSwitch}});
   const c=await tx.recoveryCase.findUnique({where:{id},include:{paymentAttempt:{include:{subscription:true}},execution:true}});
   if(!c) throw new RecoveryError('Case not found',404);
   const now=this.clock();
   const contacts=await tx.contactEvent.count({where:{customerId:c.paymentAttempt.customerId,createdAt:{gt:new Date(now.getTime()-7*day)}}});
   const signals={...c.paymentAttempt,paymentStatus:c.paymentAttempt.status,subscriptionStatus:c.paymentAttempt.subscription.status,contactCountLast7Days:contacts};
   return {c,settings,signals,now};
 }

 private async guarded<T>(id:string,actor:string,operation:()=>Promise<T>):Promise<T> {
   try {return await operation();}
   catch(error) {
     if(error instanceof RecoveryError && error.status!==404) {
       await this.client.auditEvent.create({data:{recoveryCaseId:id,eventType:'ACTION_BLOCKED',actor,payload:JSON.stringify({reason:error.message})}});
     }
     throw error;
   }
 }

 async approve(id:string,actor='MERCHANT',selectedAction?:string) {
   return this.guarded(id,actor,()=>this.client.$transaction(async tx=>{
     const {c,settings,signals,now}=await this.context(tx,id);
     if(c.execution || !['PENDING_APPROVAL','NEEDS_REVIEW','APPROVED'].includes(c.status)) throw new RecoveryError('Case cannot be approved in its current state');
     if(settings.killSwitch) throw new RecoveryError('Merchant kill switch is enabled');
     const stop=hardStop(signals,settings);
     if(stop) throw new RecoveryError(stop);
     const fresh=scoreRecovery(signals,now,settings);
     if(fresh.recommendation==='STOP' || c.recommendedAction==='STOP') throw new RecoveryError('Stopped cases cannot be approved');
     const action=selectedAction ?? c.recommendedAction;
     if(!actionable.includes(action)) throw new RecoveryError('Review requires an explicit retry or payment-link decision',422);
     if(!allowedActions(settings).includes(action))throw new RecoveryError('Selected action is disabled by merchant policy',422);
     if(fresh.recommendation==='SEND_PAYMENT_UPDATE_LINK' && action!=='SEND_PAYMENT_UPDATE_LINK') throw new RecoveryError('Expired credentials require a payment update');
     if(action==='RETRY_LATER'&&signals.retryCount>=settings.maxRetries)throw new RecoveryError(`Merchant automatic retry limit reached (${settings.maxRetries})`);
     const scheduledFor=action==='RETRY_LATER'?new Date(Math.max(c.scheduledFor?.getTime()??0,signals.attemptedAt.getTime()+settings.retryDelayHours*3600000)):null;
     const updated=await tx.recoveryCase.update({where:{id},data:{status:'APPROVED',recommendedAction:action,scheduledFor,approvedAmount:signals.amount,requiresHumanApproval:approvalRequired(signals.amount,settings),reasonSummary:`Merchant approved ${action==='RETRY_LATER'?'one scheduled retry':'one payment-update link'}.`,evidence:JSON.stringify(fresh.evidence),predictedRecoveryProbability:fresh.probability}});
     if(action!==c.recommendedAction)await event(tx,id,'ACTION_MODIFIED',actor,{from:c.recommendedAction,to:action,amount:signals.amount});
     await event(tx,id,'APPROVED',actor,{action,amount:signals.amount,scheduledFor});
     return updated;
   }));
 }

 async execute(id:string,actor='MERCHANT') {
   const claim=await this.guarded(id,actor,()=>this.client.$transaction(async tx=>{
     const {c,settings,signals,now}=await this.context(tx,id);
     if(c.execution) {
       if(['RECOVERED','EXECUTED','FAILED'].includes(c.status)) return {c,execution:null};
       throw new RecoveryError('An execution already exists. Reconcile its outcome; do not retry.');
     }
     if(settings.killSwitch) throw new RecoveryError('Merchant kill switch is enabled');
     if(!['PENDING_APPROVAL','APPROVED'].includes(c.status) || !actionable.includes(c.recommendedAction)) throw new RecoveryError('Case requires an explicit approved action before execution');
     if(c.paymentAttempt.provider!==this.adapter.mode) throw new RecoveryError(`This ${c.paymentAttempt.provider==='razorpay_test'?'Razorpay Test Mode':'mock'} case cannot execute while ${this.adapter.displayName} is active.`,503);
     if(c.recommendedAction==='RETRY_LATER'&&!this.adapter.capabilities.retry) throw new RecoveryError(`${this.adapter.displayName} does not support replaying an arbitrary failed payment. Review the case and use a payment update link.`,422);
     if(c.recommendedAction==='SEND_PAYMENT_UPDATE_LINK'&&!this.adapter.capabilities.paymentLinks) throw new RecoveryError(`${this.adapter.displayName} does not support payment links.`,422);
     const stop=hardStop(signals,settings);
     if(stop) throw new RecoveryError(stop);
     const fresh=scoreRecovery(signals,now,settings);
     if(fresh.recommendation==='STOP') throw new RecoveryError(fresh.reasonSummary);
     if(!allowedActions(settings).includes(c.recommendedAction))throw new RecoveryError('Selected action is disabled by merchant policy');
     if(c.recommendedAction==='RETRY_LATER'&&signals.retryCount>=settings.maxRetries)throw new RecoveryError(`Merchant automatic retry limit reached (${settings.maxRetries})`);
     if(c.recommendedAction==='SEND_PAYMENT_UPDATE_LINK'&&isQuietHour(now,settings))throw new RecoveryError('Customer outreach is blocked during merchant quiet hours');
     if(fresh.recommendation==='SEND_PAYMENT_UPDATE_LINK' && c.recommendedAction==='RETRY_LATER') throw new RecoveryError('Expired credentials require a payment update');
     if((approvalRequired(signals.amount,settings)||c.requiresHumanApproval||fresh.recommendation==='NEEDS_REVIEW') && c.status!=='APPROVED') throw new RecoveryError('Human approval is required');
     if(c.status==='APPROVED' && c.approvedAmount!==signals.amount) throw new RecoveryError('Payment amount changed after approval. A new approval is required.');
     if(c.recommendedAction==='RETRY_LATER' && Math.max(c.scheduledFor?.getTime()??0,signals.attemptedAt.getTime()+settings.retryDelayHours*3600000)>now.getTime()) throw new RecoveryError('Retry is not due yet');
     const execution=await tx.recoveryExecution.create({data:{id:`recovery_${id}`,recoveryCaseId:id,action:c.recommendedAction,provider:this.adapter.mode}});
     if(c.recommendedAction==='RETRY_LATER') await tx.paymentAttempt.update({where:{id:c.paymentAttemptId},data:{retryCount:{increment:1}}});
     else {
       await tx.contactEvent.create({data:{customerId:signals.customerId,reservationKey:execution.id,createdAt:now}});
       await tx.paymentAttempt.update({where:{id:c.paymentAttemptId},data:{contactCountLast7Days:signals.contactCountLast7Days+1}});
     }
     await tx.recoveryCase.update({where:{id},data:{status:'PROCESSING'}});
     await event(tx,id,'EXECUTION_CLAIMED',actor,{action:execution.action,idempotencyKey:execution.id,provider:this.adapter.mode});
     return {c,execution};
   }));
   if(!claim.execution) return claim.c;
   let result:ProviderResult;
   try {
     result=claim.execution.action==='RETRY_LATER'
       ? await this.adapter.retry(claim.c.paymentAttemptId,claim.execution.id)
       : await this.adapter.sendUpdateLink(claim.c.paymentAttemptId,claim.execution.id);
   } catch(error) {
     const errorCode=error instanceof RazorpayProviderError?error.code:'PROVIDER_ERROR';
     await this.client.$transaction(async tx=>{
       await tx.recoveryExecution.update({where:{id:claim.execution!.id},data:{status:'UNKNOWN',lastErrorCode:errorCode}});
       await tx.recoveryCase.update({where:{id},data:{status:'NEEDS_REVIEW'}});
       await event(tx,id,'PROVIDER_UNAVAILABLE','SYSTEM',{idempotencyKey:claim.execution!.id,provider:this.adapter.mode,errorCode});
     });
     throw new RecoveryError('Provider outcome is unknown. Case escalated for reconciliation; no further retry is allowed.',503);
   }
   // Persistence failures leave the durable claim in place. They are not provider failures.
   return this.finalize(id,result,actor);
 }

 private async finalize(id:string,result:ProviderResult,actor:string) {
   return this.client.$transaction(async tx=>{
     const c=await tx.recoveryCase.findUniqueOrThrow({where:{id},include:{paymentAttempt:{include:{subscription:true}},execution:true}});
     if(c.status==='RECOVERED') return c;
     if(!c.execution) throw new RecoveryError('No execution to reconcile');
     const outcomeStatus=result.outcome==='RECOVERED'?'RECOVERED':result.outcome==='FAILED'?'FAILED':'EXECUTED';
     if(c.execution.status===result.outcome && c.status===outcomeStatus) return c;
     // A late provider confirmation must never restart a cancelled subscription.
     const updated=await tx.recoveryCase.update({where:{id},data:{status:outcomeStatus,recoveredAmount:result.outcome==='RECOVERED'?c.paymentAttempt.amount:0,recoveredAt:result.outcome==='RECOVERED'?this.clock():null}});
     await tx.recoveryExecution.update({where:{id:c.execution.id},data:{status:result.outcome,providerReference:result.reference,providerStatus:result.providerStatus,recoveryUrl:result.recoveryUrl,lastErrorCode:null}});
     if(result.outcome==='RECOVERED') await tx.paymentAttempt.updateMany({where:{id:c.paymentAttemptId,status:'FAILED'},data:{status:'SUCCEEDED'}});
     await event(tx,id,result.outcome,actor,{reference:result.reference,action:c.execution.action,provider:c.execution.provider,providerStatus:result.providerStatus});
     return updated;
   });
 }

 async reconcile(id:string,actor='MERCHANT') {
   const execution=await this.client.recoveryExecution.findUnique({where:{recoveryCaseId:id}});
   if(!execution) throw new RecoveryError('No provider operation exists',404);
   const result=await this.adapter.lookup(execution.id,execution.providerReference);
   if(!result) throw new RecoveryError('Provider has no confirmed outcome. Keep this case in review; no new action was sent.',503);
   return this.finalize(id,result,actor);
 }

 async reject(id:string,reason:string,actor='MERCHANT') {
   const cleaned=reason.trim().slice(0,300);
   if(cleaned.length<3)throw new RecoveryError('Provide a rejection reason',422);
   return this.guarded(id,actor,()=>this.client.$transaction(async tx=>{
     const c=await tx.recoveryCase.findUnique({where:{id},include:{execution:true}});
     if(!c)throw new RecoveryError('Case not found',404);
     if(c.execution||!['PENDING_APPROVAL','NEEDS_REVIEW','APPROVED'].includes(c.status))throw new RecoveryError('Case cannot be rejected in its current state');
     const updated=await tx.recoveryCase.update({where:{id},data:{status:'REJECTED',rejectedAt:this.clock(),rejectionReason:cleaned}});
     await event(tx,id,'REJECTED',actor,{reason:cleaned,previousAction:c.recommendedAction});
     return updated;
   }));
 }

 async confirmProviderReference(reference:string,providerStatus='paid',actor='RAZORPAY_WEBHOOK') {
   const execution=await this.client.recoveryExecution.findFirst({where:{provider:'razorpay_test',providerReference:reference}});
   if(!execution) throw new RecoveryError('No recovery execution matches this provider reference',404);
   return this.finalize(execution.recoveryCaseId,{reference,outcome:'RECOVERED',providerStatus},actor);
 }

 async confirmMockPayment(id:string,actor='MERCHANT') {
   if(!(this.adapter instanceof MockRazorpayAdapter)) throw new RecoveryError('Mock confirmation is unavailable',404);
   const execution=await this.client.recoveryExecution.findUnique({where:{recoveryCaseId:id}});
   if(!execution)throw new RecoveryError('No provider operation exists',404);
   if(execution.action!=='SEND_PAYMENT_UPDATE_LINK')throw new RecoveryError('Only a sent mock payment link can be confirmed');
   await this.adapter.confirmMockPayment(execution.id);
   return this.reconcile(id,actor);
 }

 async runDue(actor='SYSTEM') {
   const settings=await this.client.setting.upsert({where:{id:'merchant'},update:{},create:{id:'merchant'}});
   if(settings.killSwitch)return [];
   const due=await this.client.recoveryCase.findMany({where:{OR:[{status:'APPROVED'},{status:'PENDING_APPROVAL',requiresHumanApproval:false,paymentAttempt:{amount:{lte:Math.min(10000,settings.autoRecoveryLimit)}}}],recommendedAction:'RETRY_LATER',scheduledFor:{lte:this.clock()},execution:null},select:{id:true},take:100,orderBy:{scheduledFor:'asc'}});
   const results=[];
   for(const c of due) {
     try {const updated=await this.execute(c.id,actor);results.push({id:c.id,status:updated.status});}
     catch(error) {results.push({id:c.id,error:error instanceof RecoveryError?error.message:'Execution interrupted; reconcile before continuing'});}
   }
   return results;
 }
}
