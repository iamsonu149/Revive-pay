import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readdirSync,unlinkSync,rmdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {RecoveryService} from '../domain/recovery/recovery-service';
import {SettingsService} from '../domain/settings/settings-service';
import {MockRazorpayAdapter} from '../integrations/razorpay/mock-razorpay-adapter';

const directory=mkdtempSync(join(tmpdir(),'revive-pay-tests-'));
const url=`file:${join(directory,'test.db').replaceAll('\\','/')}`;
const client=new PrismaClient({datasources:{db:{url}}});
const now=new Date('2026-09-05T12:00:00Z');
let adapter:MockRazorpayAdapter;
let service:RecoveryService;
let sequence=0;
async function fixture(options:{reason?:string;amount?:number;retryCount?:number;action?:string;status?:string;customerId?:string;paymentId?:string;scheduledFor?:Date}={}) {
 const id=++sequence;
 const customer=options.customerId?await client.customer.findUniqueOrThrow({where:{id:options.customerId}}):await client.customer.create({data:{name:'Test',email:`test${id}@example.com`,phone:'000',riskBand:'LOW'}});
 const subscription=await client.subscription.create({data:{customerId:customer.id,planName:'Test',amount:options.amount??5000,status:'PAST_DUE',nextBillingDate:now}});
 const payment=await client.paymentAttempt.create({data:{id:options.paymentId,customerId:customer.id,subscriptionId:subscription.id,amount:options.amount??5000,status:'FAILED',failureReason:options.reason??'BANK_TECHNICAL',attemptedAt:new Date(now.getTime()-48*3600000),retryCount:options.retryCount??0,paymentMethodAgeDays:90,recentSuccessfulPayments:6,bankHealthScore:90,customerEngagementScore:80,contactCountLast7Days:0}});
 const c=await client.recoveryCase.create({data:{paymentAttemptId:payment.id,predictedRecoveryProbability:80,recommendedAction:options.action??'RETRY_LATER',reasonSummary:'Test',evidence:'[]',requiresHumanApproval:false,status:options.status??'PENDING_APPROVAL',scheduledFor:options.scheduledFor??new Date(now.getTime()-3600000)}});
 return {c,payment,subscription,customer};
}
beforeAll(()=>{
 writeFileSync(join(directory,'test.db'),'');
 execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema',resolve('prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
},30000);
beforeEach(async()=>{
 vi.restoreAllMocks();
 await client.auditEvent.deleteMany();await client.recoveryExecution.deleteMany();await client.mockProviderOperation.deleteMany();await client.contactEvent.deleteMany();await client.recoveryCase.deleteMany();await client.paymentAttempt.deleteMany();await client.subscription.deleteMany();await client.customer.deleteMany();
 await client.setting.upsert({where:{id:'merchant'},create:{id:'merchant'},update:{killSwitch:false,maxContacts:2,autoRecoveryLimit:10000}});
 adapter=new MockRazorpayAdapter(client);service=new RecoveryService(client,adapter,()=>now);
});
afterAll(async()=>{
 await client.$disconnect();
 // Remove only the known temporary database files; no recursive deletion.
 for(const name of readdirSync(directory))if(/^test\.db(?:-journal|-wal|-shm)?$/.test(name))unlinkSync(join(directory,name));
 rmdirSync(directory);
});

describe('execution safety against the real SQLite database',()=>{
 it('blocks the second automated retry',async()=>{
   const {c}=await fixture({retryCount:1});const call=vi.spyOn(adapter,'retry');
   await expect(service.execute(c.id)).rejects.toThrow('retry limit');expect(call).not.toHaveBeenCalled();
 });
 it.each(['CANCELLED','REFUNDED','CHARGEBACK'])('rechecks current subscription state %s',async status=>{
   const {c,subscription}=await fixture();await client.subscription.update({where:{id:subscription.id},data:{status}});
   await expect(service.execute(c.id)).rejects.toThrow('cancelled');
   expect(await client.recoveryExecution.count()).toBe(0);
 });
 it.each(['REFUNDED','CHARGEBACK','SUCCEEDED'])('rechecks current payment state %s',async status=>{
   const {c,payment}=await fixture();await client.paymentAttempt.update({where:{id:payment.id},data:{status}});
   await expect(service.execute(c.id)).rejects.toThrow('cancelled');
 });
 it('checks the actual amount even when the saved approval flag is false',async()=>{
   const {c}=await fixture({amount:10001});await expect(service.execute(c.id)).rejects.toThrow('approval');
   await service.approve(c.id,'merchant');expect((await service.execute(c.id)).status).toBe('RECOVERED');
 });
 it('honors tighter merchant approval limits',async()=>{
   const {c}=await fixture();await new SettingsService(client).update({autoRecoveryLimit:2000},'merchant');
   await expect(service.execute(c.id)).rejects.toThrow('approval');
 });
 it('invalidates approval when the amount changes',async()=>{
   const {c,payment}=await fixture({amount:12000});await service.approve(c.id);
   await client.paymentAttempt.update({where:{id:payment.id},data:{amount:15000}});
   await expect(service.execute(c.id)).rejects.toThrow('amount changed');
   await service.approve(c.id);expect((await service.execute(c.id)).recoveredAmount).toBe(15000);
 });
 it('blocks execution and approval under the kill switch and audits the block',async()=>{
   const {c}=await fixture();await new SettingsService(client).update({killSwitch:true},'merchant');
   await expect(service.execute(c.id)).rejects.toThrow('kill switch');await expect(service.approve(c.id)).rejects.toThrow('kill switch');
   expect(await client.recoveryExecution.count()).toBe(0);expect(await client.auditEvent.count({where:{eventType:'ACTION_BLOCKED'}})).toBe(2);
 });
 it('requires an explicit review decision',async()=>{
   const {c}=await fixture({reason:'UNKNOWN_FAILURE',action:'NEEDS_REVIEW',status:'NEEDS_REVIEW'});
   await expect(service.execute(c.id)).rejects.toThrow('approved action');await expect(service.approve(c.id)).rejects.toThrow('explicit');
   await service.approve(c.id,'merchant','SEND_PAYMENT_UPDATE_LINK');expect((await service.execute(c.id)).status).toBe('EXECUTED');
 });
 it('does not retry expired credentials even with a stale retry recommendation',async()=>{
   const {c}=await fixture({reason:'EXPIRED_CARD'});await expect(service.execute(c.id)).rejects.toThrow('Expired');
   await expect(service.approve(c.id,'merchant','RETRY_LATER')).rejects.toThrow('Expired');
 });
 it('enforces the retry schedule, including a minimum 24-hour delay',async()=>{
   const {c,payment}=await fixture({scheduledFor:new Date(now.getTime()+3600000)});
   await expect(service.execute(c.id)).rejects.toThrow('not due');
   await client.recoveryCase.update({where:{id:c.id},data:{scheduledFor:null}});
   await client.paymentAttempt.update({where:{id:payment.id},data:{attemptedAt:now}});
   await expect(service.execute(c.id)).rejects.toThrow('not due');
 });
 it('claims only one action for concurrent requests',async()=>{
   const {c,payment}=await fixture();const call=vi.spyOn(adapter,'retry');
   await Promise.allSettled([service.execute(c.id),service.execute(c.id)]);
   expect(call).toHaveBeenCalledTimes(1);expect(await client.recoveryExecution.count()).toBe(1);
   expect((await client.paymentAttempt.findUniqueOrThrow({where:{id:payment.id}})).retryCount).toBe(1);
   expect((await service.execute(c.id)).status).toBe('RECOVERED');expect(call).toHaveBeenCalledTimes(1);
 });
 it('shares the contact cap across cases and ignores expired contacts',async()=>{
   const first=await fixture({reason:'EXPIRED_CARD',action:'SEND_PAYMENT_UPDATE_LINK'});
   await client.contactEvent.createMany({data:[{customerId:first.customer.id,reservationKey:'recent',createdAt:new Date(now.getTime()-1000)},{customerId:first.customer.id,reservationKey:'old',createdAt:new Date(now.getTime()-8*86400000)}]});
   await service.execute(first.c.id);
   const second=await fixture({customerId:first.customer.id,reason:'EXPIRED_CARD',action:'SEND_PAYMENT_UPDATE_LINK'});
   await expect(service.execute(second.c.id)).rejects.toThrow('contact limit');
   expect(await client.mockProviderOperation.count()).toBe(1);
 });
 it('serializes concurrent contact reservations across different cases',async()=>{
   const first=await fixture({reason:'EXPIRED_CARD',action:'SEND_PAYMENT_UPDATE_LINK'});
   const second=await fixture({customerId:first.customer.id,reason:'EXPIRED_CARD',action:'SEND_PAYMENT_UPDATE_LINK'});
   await client.contactEvent.create({data:{customerId:first.customer.id,reservationKey:'recent',createdAt:now}});
   await Promise.allSettled([service.execute(first.c.id),service.execute(second.c.id)]);
   expect(await client.contactEvent.count()).toBe(2);expect(await client.mockProviderOperation.count()).toBe(1);
 });
 it('escalates an outage and never submits a second action',async()=>{
   const {c}=await fixture({paymentId:'outage-test'});const call=vi.spyOn(adapter,'retry');
   await expect(service.execute(c.id)).rejects.toMatchObject({status:503});
   await expect(service.execute(c.id)).rejects.toThrow('already exists');await expect(service.approve(c.id)).rejects.toThrow('current state');
   await expect(service.reconcile(c.id)).rejects.toMatchObject({status:503});expect(call).toHaveBeenCalledTimes(1);
   expect((await client.recoveryCase.findUniqueOrThrow({where:{id:c.id}})).status).toBe('NEEDS_REVIEW');
 });
 it('reconciles a lost provider response using the original operation',async()=>{
   const {c}=await fixture();const original=adapter.retry.bind(adapter);
   vi.spyOn(adapter,'retry').mockImplementationOnce(async(...args)=>{await original(...args);throw Error('Lost response');});
   await expect(service.execute(c.id)).rejects.toThrow('unknown');
   expect((await service.reconcile(c.id)).status).toBe('RECOVERED');expect(await client.mockProviderOperation.count()).toBe(1);
 });
 it('keeps the claim when local persistence fails after provider success',async()=>{
   const {c}=await fixture();const original=adapter.retry.bind(adapter);
   vi.spyOn(adapter,'retry').mockImplementationOnce(async(...args)=>{const result=await original(...args);vi.spyOn(client,'$transaction').mockRejectedValueOnce(Error('Storage unavailable'));return result;});
   await expect(service.execute(c.id)).rejects.toThrow('Storage unavailable');
   expect((await client.recoveryCase.findUniqueOrThrow({where:{id:c.id}})).status).toBe('PROCESSING');
   expect(await client.auditEvent.count({where:{eventType:'PROVIDER_UNAVAILABLE'}})).toBe(0);
   expect((await service.reconcile(c.id)).status).toBe('RECOVERED');expect(await client.mockProviderOperation.count()).toBe(1);
 });
 it('confirms a mock link payment without recording sent links as recovered revenue',async()=>{
   const {c}=await fixture({reason:'EXPIRED_CARD',action:'SEND_PAYMENT_UPDATE_LINK'});
   expect((await service.execute(c.id)).recoveredAmount).toBe(0);
   expect((await service.confirmMockPayment(c.id)).recoveredAmount).toBe(5000);
   await service.confirmMockPayment(c.id);expect(await client.auditEvent.count({where:{eventType:'RECOVERED'}})).toBe(1);
 });
 it('records a declined retry as final and does not retry again',async()=>{
   const {c}=await fixture({paymentId:'declined-test'});expect((await service.execute(c.id)).status).toBe('FAILED');
   await service.execute(c.id);expect(await client.mockProviderOperation.count()).toBe(1);
 });
 it('runs due work while leaving future and unapproved high-value cases untouched',async()=>{
   const due=await fixture();const future=await fixture({scheduledFor:new Date(now.getTime()+86400000)});const high=await fixture({amount:15000});
   await service.runDue();
   expect((await client.recoveryCase.findUniqueOrThrow({where:{id:due.c.id}})).status).toBe('RECOVERED');
   for(const c of [future.c,high.c])expect((await client.recoveryCase.findUniqueOrThrow({where:{id:c.id}})).status).toBe('PENDING_APPROVAL');
 });
 it('preserves the kill switch on partial settings changes and audits them',async()=>{
   const settings=new SettingsService(client);await settings.update({killSwitch:true},'merchant');await settings.update({maxContacts:1},'merchant');
   expect((await settings.get()).killSwitch).toBe(true);expect(await client.auditEvent.count({where:{eventType:'SETTINGS_UPDATED'}})).toBe(2);
 });
});
