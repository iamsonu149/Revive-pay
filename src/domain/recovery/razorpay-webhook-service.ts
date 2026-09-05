import {PrismaClient} from '@prisma/client';
import {db} from '../../lib/db';
import {webhookPayloadHash,verifyRazorpayWebhook} from '../../integrations/razorpay/webhook';
import {RecoveryError} from './policy';
import {scoreRecovery} from './recovery-scorer';
import {RecoveryService} from './recovery-service';

type JsonObject=Record<string,unknown>;
export type WebhookResult={status:'processed'|'duplicate'|'ignored';eventType:string;recoveryCaseId?:string};

const failureEvents=new Set(['payment.failed','subscription.pending','subscription.halted']);
const successEvents=new Set(['payment.captured','order.paid','payment_link.paid']);
const object=(value:unknown):JsonObject=>value&&typeof value==='object'&&!Array.isArray(value)?value as JsonObject:{};
const text=(value:unknown)=>typeof value==='string'?value:undefined;
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:undefined;
const entity=(root:JsonObject,key:string)=>object(object(object(root.payload)[key]).entity);
const note=(...sources:JsonObject[])=>{
 for(const source of sources){const value=text(object(source.notes).recovery_case_id);if(value)return value;}
 return undefined;
};
const code=(value:string)=>value.replace(/[^A-Z0-9_]/gi,'_').toUpperCase().slice(0,80)||'UNKNOWN';

function failureReason(payment:JsonObject) {
 const signal=[text(payment.error_code),text(payment.error_reason),text(payment.error_description)].filter(Boolean).join(' ').toLowerCase();
 if(signal.includes('insufficient'))return 'INSUFFICIENT_FUNDS';
 if(signal.includes('expired')&&signal.includes('mandate'))return 'EXPIRED_MANDATE';
 if(signal.includes('expired'))return 'EXPIRED_CARD';
 if(signal.includes('bank')||signal.includes('technical')||signal.includes('server')||signal.includes('gateway'))return 'BANK_TECHNICAL';
 return 'UNKNOWN_FAILURE';
}

export class RazorpayWebhookService {
 constructor(private client:PrismaClient=db,private secret=process.env.RAZORPAY_WEBHOOK_SECRET??'',private clock=()=>new Date()){}

 private audit(eventType:string,payload:object,recoveryCaseId?:string) {
   return this.client.auditEvent.create({data:{eventType,actor:'RAZORPAY',payload:JSON.stringify(payload),recoveryCaseId}});
 }

 async handle(raw:string,signature:string|null,providerEventHeader:string|null):Promise<WebhookResult> {
   const started=this.clock();
   const payloadHash=webhookPayloadHash(raw);
   if(!this.secret) {
     await this.audit('WEBHOOK_REJECTED',{reason:'WEBHOOK_SECRET_NOT_CONFIGURED',payloadHash});
     throw new RecoveryError('Razorpay webhook secret is not configured',503);
   }
   if(!verifyRazorpayWebhook(raw,signature,this.secret)) {
     await this.client.providerWebhookEvent.upsert({
       where:{id:`rejected:${payloadHash}`},update:{receivedAt:this.clock()},
       create:{id:`rejected:${payloadHash}`,provider:'razorpay_test',eventType:'UNKNOWN',signatureValid:false,status:'REJECTED',payloadHash,errorCode:'INVALID_SIGNATURE',retryStatus:'NOT_APPLICABLE',processingLatencyMs:0},
     });
     await this.audit('WEBHOOK_SIGNATURE_REJECTED',{payloadHash});
     throw new RecoveryError('Invalid Razorpay webhook signature',401);
   }

   let body:JsonObject,invalidPayload=false;
   try {body=object(JSON.parse(raw));invalidPayload=Object.keys(body).length===0;}
   catch {body={};invalidPayload=true;}
   const eventType=text(body.event)?.slice(0,100)||'UNKNOWN';
   const externalId=providerEventHeader&&/^[A-Za-z0-9_-]{1,200}$/.test(providerEventHeader)?providerEventHeader:`sha256_${payloadHash}`;
   const id=`razorpay:${externalId}`;
   try {
     await this.client.providerWebhookEvent.create({data:{id,provider:'razorpay_test',providerEventId:externalId,eventType,signatureValid:true,status:'RECEIVED',payloadHash,receivedAt:this.clock()}});
   } catch(error) {
     if((error as {code?:string}).code!=='P2002')throw error;
     const existing=await this.client.providerWebhookEvent.update({where:{id},data:{duplicateCount:{increment:1}}});
     await this.audit('WEBHOOK_DUPLICATE',{providerEventId:externalId,eventType,status:existing?.status},existing?.recoveryCaseId??undefined);
     return {status:'duplicate',eventType,recoveryCaseId:existing?.recoveryCaseId??undefined};
   }
   await this.audit('WEBHOOK_ACCEPTED',{providerEventId:externalId,eventType,payloadHash});

   try {
     let recoveryCaseId:string|undefined;
     if(invalidPayload||eventType==='UNKNOWN')throw new RecoveryError('Invalid Razorpay webhook payload',422);
     if(failureEvents.has(eventType)) recoveryCaseId=await this.ingestFailure(body,externalId,eventType);
     else if(successEvents.has(eventType)) recoveryCaseId=await this.ingestSuccess(body);
     else {
       const finished=this.clock();
       await this.client.providerWebhookEvent.update({where:{id},data:{status:'IGNORED',processedAt:finished,processingLatencyMs:Math.max(0,finished.getTime()-started.getTime()),retryStatus:'NOT_APPLICABLE'}});
       await this.audit('WEBHOOK_IGNORED',{providerEventId:externalId,eventType});
       return {status:'ignored',eventType};
     }
     const finished=this.clock();
     await this.client.providerWebhookEvent.update({where:{id},data:{status:'PROCESSED',processedAt:finished,processingLatencyMs:Math.max(0,finished.getTime()-started.getTime()),recoveryCaseId,retryStatus:'NOT_REQUIRED'}});
     await this.audit('WEBHOOK_PROCESSED',{providerEventId:externalId,eventType},recoveryCaseId);
     return {status:'processed',eventType,recoveryCaseId};
   } catch(error) {
     const errorCode=error instanceof RecoveryError?`RECOVERY_${error.status}`:'PROCESSING_ERROR';
     const finished=this.clock();
     await this.client.providerWebhookEvent.update({where:{id},data:{status:'FAILED',processedAt:finished,processingLatencyMs:Math.max(0,finished.getTime()-started.getTime()),errorCode,retryStatus:'RETRY_PENDING'}});
     await this.audit('WEBHOOK_PROCESSING_FAILED',{providerEventId:externalId,eventType,errorCode});
     if(error instanceof RecoveryError)throw error;
     throw new RecoveryError('Razorpay webhook could not be processed',500);
   }
 }

 private async ingestFailure(root:JsonObject,eventId:string,eventType:string) {
   const payment=entity(root,'payment'),subscriptionEntity=entity(root,'subscription'),invoice=entity(root,'invoice');
   const externalPaymentId=text(payment.id)??`event_${eventId}`;
   const externalSubscriptionId=text(payment.subscription_id)??text(subscriptionEntity.id)??text(invoice.subscription_id)??`payment_${externalPaymentId}`;
   const paise=number(payment.amount)??number(invoice.amount)??number(object(subscriptionEntity.notes).amount)??0;
   const amount=Math.max(0,Math.round(paise/100));
   const email=text(payment.email)??`razorpay-${webhookPayloadHash(externalPaymentId).slice(0,16)}@example.invalid`;
   const phone=text(payment.contact)??'';
   const name=text(object(payment.notes).customer_name)??(email.endsWith('@example.invalid')?'Razorpay customer':email.split('@')[0]);
   const now=this.clock();
   return this.client.$transaction(async tx=>{
     const customer=await tx.customer.upsert({where:{email},update:{phone:phone||undefined},create:{name,email,phone,riskBand:'STANDARD'}});
     const subscription=await tx.subscription.upsert({
       where:{provider_providerSubscriptionId:{provider:'razorpay_test',providerSubscriptionId:externalSubscriptionId}},
       update:{status:'PAST_DUE',amount:amount||undefined},
       create:{customerId:customer.id,planName:text(object(subscriptionEntity.notes).plan_name)??'Razorpay subscription',amount,status:'PAST_DUE',nextBillingDate:new Date(now.getTime()+7*86400000),provider:'razorpay_test',providerSubscriptionId:externalSubscriptionId},
     });
     const attempt=await tx.paymentAttempt.upsert({
       where:{provider_providerPaymentId:{provider:'razorpay_test',providerPaymentId:externalPaymentId}},
       update:{status:'FAILED',failureReason:failureReason(payment),providerOrderId:text(payment.order_id),amount:amount||undefined},
       create:{subscriptionId:subscription.id,customerId:customer.id,amount,status:'FAILED',failureReason:failureReason(payment),attemptedAt:new Date((number(payment.created_at)??Math.floor(now.getTime()/1000))*1000),retryCount:0,paymentMethodAgeDays:0,recentSuccessfulPayments:0,bankHealthScore:50,customerEngagementScore:50,contactCountLast7Days:0,provider:'razorpay_test',providerPaymentId:externalPaymentId,providerOrderId:text(payment.order_id)},
     });
     const existing=await tx.recoveryCase.findUnique({where:{paymentAttemptId:attempt.id}});
     if(existing)return existing.id;
     const settings=await tx.setting.upsert({where:{id:'merchant'},update:{},create:{id:'merchant'}});
     const decision=amount>0?scoreRecovery({...attempt,paymentStatus:attempt.status,subscriptionStatus:subscription.status},now,settings):{probability:0,recommendation:'STOP' as const,confidence:'HIGH' as const,evidence:['Provider event did not include a payable amount'],requiresHumanApproval:false,reasonSummary:'Stop until the payment amount can be verified.'};
     const created=await tx.recoveryCase.create({data:{paymentAttemptId:attempt.id,predictedRecoveryProbability:decision.probability,recommendedAction:decision.recommendation,reasonSummary:decision.reasonSummary,evidence:JSON.stringify(decision.evidence),status:decision.recommendation==='STOP'?'STOPPED':decision.recommendation==='NEEDS_REVIEW'?'NEEDS_REVIEW':'PENDING_APPROVAL',requiresHumanApproval:decision.requiresHumanApproval,scheduledFor:decision.recommendation==='RETRY_LATER'?new Date(attempt.attemptedAt.getTime()+86400000):null}});
     await tx.auditEvent.create({data:{recoveryCaseId:created.id,eventType:'PAYMENT_FAILURE_INGESTED',actor:'RAZORPAY',payload:JSON.stringify({eventType,providerPaymentId:externalPaymentId,providerSubscriptionId:externalSubscriptionId})}});
     await tx.auditEvent.create({data:{recoveryCaseId:created.id,eventType:'RECOMMENDATION_CREATED',actor:'SYSTEM',payload:JSON.stringify({asOf:now,decision})}});
     return created.id;
   });
 }

 private async ingestSuccess(root:JsonObject) {
   const paymentLink=entity(root,'payment_link'),payment=entity(root,'payment'),order=entity(root,'order');
   const reference=text(paymentLink.id);
   const notedCase=note(paymentLink,payment,order);
   let execution=reference?await this.client.recoveryExecution.findFirst({where:{provider:'razorpay_test',providerReference:reference}}):null;
   if(!execution&&notedCase)execution=await this.client.recoveryExecution.findUnique({where:{recoveryCaseId:notedCase}});
   if(!execution)return undefined;
   if(reference&&!execution.providerReference)execution=await this.client.recoveryExecution.update({where:{id:execution.id},data:{providerReference:reference}});
   const providerReference=execution.providerReference??reference;
   if(!providerReference)throw new RecoveryError('Successful provider event is missing a recovery reference',422);
   await new RecoveryService(this.client).confirmProviderReference(providerReference,text(paymentLink.status)??text(payment.status)??text(order.status)??'paid');
   return execution.recoveryCaseId;
 }
}
