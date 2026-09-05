import {PrismaClient} from '@prisma/client';
import {db} from '../../lib/db';
import {ProviderResult, RazorpayAdapter} from './razorpay-adapter';

/** Durable mock provider ledger: identical keys return the original outcome. */
export class MockRazorpayAdapter implements RazorpayAdapter {
 readonly mode='mock' as const;
 readonly displayName='Mock Razorpay';
 readonly capabilities={retry:true,paymentLinks:true};
 constructor(private client:PrismaClient=db) {}
 private async perform(paymentId:string, key:string, action:string):Promise<ProviderResult> {
   const previous=await this.client.mockProviderOperation.findUnique({where:{id:key}});
   if (previous && (previous.paymentId!==paymentId || previous.action!==action)) throw Error('Idempotency key conflict');
   if (!previous && paymentId.includes('outage')) throw Error('Mock provider unavailable');
   const outcome=action==='SEND_PAYMENT_UPDATE_LINK'?'LINK_SENT':paymentId.includes('declined')?'FAILED':'RECOVERED';
   const row=previous ?? await this.client.mockProviderOperation.upsert({where:{id:key},update:{},create:{id:key,paymentId,action,outcome,reference:`mock_${key}`}});
   return {reference:row.reference,outcome:row.outcome as ProviderResult['outcome']};
 }
 retry(paymentId:string,key:string) {return this.perform(paymentId,key,'RETRY_LATER');}
 sendUpdateLink(paymentId:string,key:string) {return this.perform(paymentId,key,'SEND_PAYMENT_UPDATE_LINK');}
 async lookup(key:string):Promise<ProviderResult|null> {
   const row=await this.client.mockProviderOperation.findUnique({where:{id:key}});
   return row ? {reference:row.reference,outcome:row.outcome as ProviderResult['outcome']} : null;
 }
 async confirmMockPayment(key:string) {
   const row=await this.client.mockProviderOperation.findUniqueOrThrow({where:{id:key}});
   if(row.action!=='SEND_PAYMENT_UPDATE_LINK') throw Error('Only a sent mock payment link can be completed');
   await this.client.mockProviderOperation.update({where:{id:key},data:{outcome:'RECOVERED'}});
 }
}
