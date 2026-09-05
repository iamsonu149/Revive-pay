import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {execFileSync} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {mkdtempSync,readdirSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {RazorpayWebhookService} from '../domain/recovery/razorpay-webhook-service';
import {RazorpayTestAdapter} from '../integrations/razorpay/razorpay-test-adapter';
import {RecoveryService} from '../domain/recovery/recovery-service';
import {SafetyLabService,safetyScenarios} from '../domain/recovery/safety-lab-service';

const directory=mkdtempSync(join(tmpdir(),'revive-razorpay-tests-'));
const url=`file:${join(directory,'test.db').replaceAll('\\','/')}`;
const client=new PrismaClient({datasources:{db:{url}}});
const now=new Date('2026-09-05T12:00:00Z');
const webhookSecret='test-webhook-secret';
const signature=(raw:string)=>createHmac('sha256',webhookSecret).update(raw).digest('hex');
let sequence=0;

async function linkFixture() {
 const id=++sequence;
 const customer=await client.customer.create({data:{name:'Test customer',email:`link${id}@example.com`,phone:'+919876543210',riskBand:'LOW'}});
 const subscription=await client.subscription.create({data:{customerId:customer.id,planName:'Growth Monthly',amount:1999,status:'PAST_DUE',nextBillingDate:now,provider:'razorpay_test',providerSubscriptionId:`sub_test_${id}`}});
 const payment=await client.paymentAttempt.create({data:{customerId:customer.id,subscriptionId:subscription.id,amount:1999,status:'FAILED',failureReason:'EXPIRED_CARD',attemptedAt:new Date(now.getTime()-48*3600000),retryCount:0,paymentMethodAgeDays:900,recentSuccessfulPayments:5,bankHealthScore:80,customerEngagementScore:80,contactCountLast7Days:0,provider:'razorpay_test',providerPaymentId:`pay_test_${id}`}});
 const recoveryCase=await client.recoveryCase.create({data:{paymentAttemptId:payment.id,predictedRecoveryProbability:80,recommendedAction:'SEND_PAYMENT_UPDATE_LINK',reasonSummary:'Update payment method',evidence:'[]',requiresHumanApproval:false,status:'PENDING_APPROVAL'}});
 return {customer,subscription,payment,recoveryCase};
}

beforeAll(()=>{
 writeFileSync(join(directory,'test.db'),'');
 execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema',resolve('prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
},30000);
beforeEach(async()=>{
 await client.safetyLabClaim.deleteMany();await client.safetyLabRun.deleteMany();
 await client.providerWebhookEvent.deleteMany();await client.recoveryAnalysis.deleteMany();await client.analysisBudget.deleteMany();await client.auditEvent.deleteMany();await client.recoveryExecution.deleteMany();await client.mockProviderOperation.deleteMany();await client.contactEvent.deleteMany();await client.recoveryCase.deleteMany();await client.paymentAttempt.deleteMany();await client.subscription.deleteMany();await client.customer.deleteMany();
 await client.setting.upsert({where:{id:'merchant'},create:{id:'merchant'},update:{killSwitch:false,maxContacts:2,autoRecoveryLimit:10000}});
});
afterAll(async()=>{
 await client.$disconnect();
 for(const name of readdirSync(directory))if(/^test\.db(?:-journal|-wal|-shm)?$/.test(name))unlinkSync(join(directory,name));
 rmdirSync(directory);
});

describe('signed Razorpay webhook ingestion',()=>{
 it('rejects an invalid signature without storing the raw body',async()=>{
   const raw=JSON.stringify({event:'payment.failed',payload:{payment:{entity:{id:'pay_bad'}}}});
   await expect(new RazorpayWebhookService(client,webhookSecret,()=>now).handle(raw,'bad','evt_bad')).rejects.toMatchObject({status:401});
   const row=await client.providerWebhookEvent.findFirstOrThrow();
   expect(row).toMatchObject({signatureValid:false,status:'REJECTED',errorCode:'INVALID_SIGNATURE'});
   expect(JSON.stringify(row)).not.toContain(raw);
 });

 it('rejects a signed invalid payload and records a bounded failure',async()=>{
   const raw='not-json';
   await expect(new RazorpayWebhookService(client,webhookSecret,()=>now).handle(raw,signature(raw),'evt_invalid')).rejects.toMatchObject({status:422});
   expect(await client.providerWebhookEvent.findUniqueOrThrow({where:{id:'razorpay:evt_invalid'}})).toMatchObject({status:'FAILED',errorCode:'RECOVERY_422'});
 });

 it('creates one linked case and rejects duplicate event delivery atomically',async()=>{
   const raw=JSON.stringify({event:'payment.failed',payload:{payment:{entity:{id:'pay_failed_1',amount:250000,email:'payer@example.com',contact:'+919812345678',created_at:1788595200,error_reason:'insufficient_funds',notes:{customer_name:'Payer'}}}}});
   const service=new RazorpayWebhookService(client,webhookSecret,()=>now);
   expect(await service.handle(raw,signature(raw),'evt_failed_1')).toMatchObject({status:'processed',eventType:'payment.failed'});
   expect(await service.handle(raw,signature(raw),'evt_failed_1')).toMatchObject({status:'duplicate'});
   expect(await client.recoveryCase.count()).toBe(1);expect(await client.providerWebhookEvent.count({where:{signatureValid:true}})).toBe(1);
   const attempt=await client.paymentAttempt.findFirstOrThrow({where:{providerPaymentId:'pay_failed_1'}});
   expect(attempt).toMatchObject({provider:'razorpay_test',amount:2500,failureReason:'INSUFFICIENT_FUNDS'});
   expect(await client.auditEvent.count({where:{eventType:'WEBHOOK_DUPLICATE'}})).toBe(1);
   expect(await client.providerWebhookEvent.findUniqueOrThrow({where:{id:'razorpay:evt_failed_1'}})).toMatchObject({duplicateCount:1,retryStatus:'NOT_REQUIRED'});
 });
});

describe('Razorpay Test Mode recovery lifecycle',()=>{
 it('creates one payment link and closes the case only after a verified paid webhook',async()=>{
   const {payment,recoveryCase}=await linkFixture();
   const request=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({id:'plink_test_1',status:'created',short_url:'https://rzp.io/i/test'}),{status:200,headers:{'Content-Type':'application/json'}}));
   const adapter=new RazorpayTestAdapter(client,{keyId:'rzp_test_example',keySecret:'provider-secret'},request,'https://api.example.test/v1');
   const service=new RecoveryService(client,adapter,()=>now);
   expect((await service.execute(recoveryCase.id)).status).toBe('EXECUTED');
   expect(request).toHaveBeenCalledTimes(1);
   const init=request.mock.calls[0][1]!;
   expect(String(new Headers(init.headers).get('Authorization'))).toBe(`Basic ${Buffer.from('rzp_test_example:provider-secret').toString('base64')}`);
   expect(JSON.parse(String(init.body))).toMatchObject({amount:199900,currency:'INR',notify:{sms:false,email:false},notes:{recovery_case_id:recoveryCase.id}});
   expect((await client.recoveryCase.findUniqueOrThrow({where:{id:recoveryCase.id}})).recoveredAmount).toBe(0);
   const raw=JSON.stringify({event:'payment_link.paid',payload:{payment_link:{entity:{id:'plink_test_1',status:'paid',notes:{recovery_case_id:recoveryCase.id}}},payment:{entity:{id:'pay_recovered',status:'captured'}}}});
   await new RazorpayWebhookService(client,webhookSecret,()=>new Date(now.getTime()+1000)).handle(raw,signature(raw),'evt_paid_1');
   expect(await client.recoveryCase.findUniqueOrThrow({where:{id:recoveryCase.id}})).toMatchObject({status:'RECOVERED',recoveredAmount:1999});
   expect((await client.paymentAttempt.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('SUCCEEDED');
   await expect(service.execute(recoveryCase.id)).resolves.toMatchObject({status:'RECOVERED'});
   expect(request).toHaveBeenCalledTimes(1);
 });

 it('keeps a durable claim when the provider fails and never sends a second link',async()=>{
   const {recoveryCase}=await linkFixture();
   const request=vi.fn<typeof fetch>().mockRejectedValue(new Error('secret provider detail'));
   const adapter=new RazorpayTestAdapter(client,{keyId:'rzp_test_example',keySecret:'provider-secret'},request,'https://api.example.test/v1');
   const service=new RecoveryService(client,adapter,()=>now);
   await expect(service.execute(recoveryCase.id)).rejects.toMatchObject({status:503});
   expect(await client.recoveryExecution.findUniqueOrThrow({where:{recoveryCaseId:recoveryCase.id}})).toMatchObject({status:'UNKNOWN',lastErrorCode:'NETWORK_ERROR'});
   await expect(service.execute(recoveryCase.id)).rejects.toThrow('already exists');
   expect(request).toHaveBeenCalledTimes(1);
 });
});

describe('mock Safety Lab',()=>{
 it('passes every controlled scenario and proves the concurrent unique claim',async()=>{
   vi.stubEnv('PAYMENT_PROVIDER','mock');const service=new SafetyLabService(client);
   for(const scenario of safetyScenarios)expect((await service.run(scenario,'merchant')).passed).toBe(true);
   expect(await client.safetyLabRun.findFirstOrThrow({where:{scenario:'CONCURRENT_WEBHOOK'}})).toMatchObject({requestsReceived:10,accepted:1,duplicatesRejected:9,providerActions:0});
   expect(await client.auditEvent.count({where:{eventType:'SAFETY_LAB_RUN'}})).toBe(8);
 });
});
