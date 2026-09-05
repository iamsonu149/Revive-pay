import {PrismaClient} from '@prisma/client';
import {db} from '../../lib/db';
import {ProviderResult, RazorpayAdapter} from './razorpay-adapter';

export type RazorpayTestConfig={keyId:string;keySecret:string};

export class RazorpayProviderError extends Error {
 constructor(public code:string, public outcomeUnknown=false) {super('Razorpay Test Mode operation failed');}
}

type PaymentLinkResponse={id?:unknown;status?:unknown;short_url?:unknown};

/** Server-only Razorpay Test Mode adapter. It never enables live keys or provider notifications. */
export class RazorpayTestAdapter implements RazorpayAdapter {
 readonly mode='razorpay_test' as const;
 readonly displayName='Razorpay Test Mode';
 readonly capabilities={retry:false,paymentLinks:true};
 constructor(
   private client:PrismaClient=db,
   private config:RazorpayTestConfig,
   private request:typeof fetch=fetch,
   private baseUrl='https://api.razorpay.com/v1',
 ) {
   if(!config.keyId.startsWith('rzp_test_') || !config.keySecret) throw new RazorpayProviderError('INVALID_TEST_CONFIGURATION');
 }

 private async call(path:string, init:RequestInit):Promise<PaymentLinkResponse> {
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),12000);
   let response:Response;
   try {
     response=await this.request(`${this.baseUrl}${path}`,{
       ...init,
       signal:controller.signal,
       headers:{
         Authorization:`Basic ${Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64')}`,
         'Content-Type':'application/json',
         ...(init.headers??{}),
       },
       cache:'no-store',
     });
   } catch(error) {
     throw new RazorpayProviderError(error instanceof DOMException&&error.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR',true);
   } finally {clearTimeout(timeout);}
   if(!response.ok) throw new RazorpayProviderError(`HTTP_${response.status}`,response.status>=500);
   try {return await response.json() as PaymentLinkResponse;}
   catch {throw new RazorpayProviderError('INVALID_RESPONSE',true);}
 }

 async retry():Promise<ProviderResult> {
   throw new RazorpayProviderError('DIRECT_RETRY_UNSUPPORTED');
 }

 async sendUpdateLink(paymentId:string,idempotencyKey:string):Promise<ProviderResult> {
   const payment=await this.client.paymentAttempt.findUnique({
     where:{id:paymentId},include:{customer:true,subscription:true,recoveryCase:true},
   });
   if(!payment?.recoveryCase) throw new RazorpayProviderError('PAYMENT_NOT_FOUND');
   const customer:Record<string,string>={name:payment.customer.name};
   if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payment.customer.email))customer.email=payment.customer.email;
   if(/^\+?[1-9]\d{7,14}$/.test(payment.customer.phone))customer.contact=payment.customer.phone;
   const result=await this.call('/payment_links',{
     method:'POST',
     body:JSON.stringify({
       amount:payment.amount*100,
       currency:'INR',
       accept_partial:false,
       description:`Payment update for ${payment.subscription.planName}`.slice(0,255),
       customer,
       notify:{sms:false,email:false},
       reminder_enable:false,
       notes:{recovery_case_id:payment.recoveryCase.id,idempotency_key:idempotencyKey},
     }),
   });
   if(typeof result.id!=='string'||!result.id.startsWith('plink_')) throw new RazorpayProviderError('INVALID_RESPONSE',true);
   return {
     reference:result.id,
     outcome:result.status==='paid'?'RECOVERED':'LINK_SENT',
     providerStatus:typeof result.status==='string'?result.status:'created',
     recoveryUrl:typeof result.short_url==='string'?result.short_url:undefined,
   };
 }

 async lookup(_idempotencyKey:string,providerReference?:string|null):Promise<ProviderResult|null> {
   if(!providerReference?.startsWith('plink_'))return null;
   const result=await this.call(`/payment_links/${encodeURIComponent(providerReference)}`,{method:'GET'});
   const status=typeof result.status==='string'?result.status:'unknown';
   const outcome=status==='paid'?'RECOVERED':['cancelled','expired'].includes(status)?'FAILED':'LINK_SENT';
   return {reference:providerReference,outcome,providerStatus:status,recoveryUrl:typeof result.short_url==='string'?result.short_url:undefined};
 }
}
