import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readdirSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {MockRazorpayAdapter} from '../integrations/razorpay/mock-razorpay-adapter';
import {RecoveryService} from '../domain/recovery/recovery-service';
import {SafeDemoBatchService} from '../domain/recovery/safe-demo-batch-service';

const directory=mkdtempSync(join(tmpdir(),'revive-safe-batch-'));
const url=`file:${join(directory,'test.db').replaceAll('\\','/')}`;
const client=new PrismaClient({datasources:{db:{url}}});
const now=new Date('2026-09-05T12:00:00Z');
let sequence=0;

async function fixture(options:{amount?:number;failureReason?:string;action?:string;status?:string;requiresApproval?:boolean;subscriptionStatus?:string}={}){
 const id=++sequence,amount=options.amount??1000;
 const customer=await client.customer.create({data:{name:'Batch customer',email:`batch-${id}@example.com`,phone:'000',riskBand:'LOW'}});
 const subscription=await client.subscription.create({data:{customerId:customer.id,planName:'Batch',amount,status:options.subscriptionStatus??'PAST_DUE',nextBillingDate:now}});
 const payment=await client.paymentAttempt.create({data:{customerId:customer.id,subscriptionId:subscription.id,amount,status:'FAILED',failureReason:options.failureReason??'BANK_TECHNICAL',attemptedAt:new Date(now.getTime()-48*3600000),retryCount:0,paymentMethodAgeDays:90,recentSuccessfulPayments:5,bankHealthScore:90,customerEngagementScore:80,contactCountLast7Days:0}});
 return client.recoveryCase.create({data:{paymentAttemptId:payment.id,predictedRecoveryProbability:80,recommendedAction:options.action??'RETRY_LATER',reasonSummary:'Batch fixture',evidence:'[]',status:options.status??'PENDING_APPROVAL',requiresHumanApproval:options.requiresApproval??false,scheduledFor:new Date(now.getTime()-3600000)}});
}

const service=()=>new SafeDemoBatchService(client,new RecoveryService(client,new MockRazorpayAdapter(client),()=>now),()=>now);

beforeAll(()=>{writeFileSync(join(directory,'test.db'),'');execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema',resolve('prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});},30000);
beforeEach(async()=>{await client.safeDemoBatchCase.deleteMany();await client.safeDemoBatch.deleteMany();await client.recoveryAnalysis.deleteMany();await client.analysisBudget.deleteMany();await client.auditEvent.deleteMany();await client.recoveryExecution.deleteMany();await client.mockProviderOperation.deleteMany();await client.contactEvent.deleteMany();await client.recoveryCase.deleteMany();await client.paymentAttempt.deleteMany();await client.subscription.deleteMany();await client.customer.deleteMany();await client.setting.upsert({where:{id:'merchant'},create:{id:'merchant'},update:{killSwitch:false,maxContacts:2,maxRetries:1}});});
afterAll(async()=>{await client.$disconnect();for(const name of readdirSync(directory))if(/^test\.db(?:-journal|-wal|-shm)?$/.test(name))unlinkSync(join(directory,name));rmdirSync(directory);});

describe('Safe Demo Batch',()=>{
 it('is idempotent for the same request ID',async()=>{await fixture();const requestId=randomUUID();const first=await service().run(requestId);const repeated=await service().run(requestId);expect(repeated.id).toBe(first.id);expect(await client.safeDemoBatch.count()).toBe(1);expect(await client.mockProviderOperation.count()).toBe(1);expect(repeated.actionsExecuted).toBe(1);});

 it('counts only persisted confirmed mock outcomes as recovered revenue',async()=>{await fixture({amount:1500});const link=await fixture({amount:2200,failureReason:'EXPIRED_CARD',action:'SEND_PAYMENT_UPDATE_LINK'});const batch=await service().run(randomUUID());expect(batch).toMatchObject({actionsExecuted:2,confirmedRecoveryCount:1,confirmedRecoveryAmount:1500,declinedOrUnresolved:1});expect(await client.recoveryCase.findUniqueOrThrow({where:{id:link.id}})).toMatchObject({status:'EXECUTED',recoveredAmount:0});});

 it('does not bypass required merchant approval',async()=>{const pending=await fixture({amount:12000,requiresApproval:true});const batch=await service().run(randomUUID());expect(batch).toMatchObject({actionsExecuted:0,requiresApproval:1,confirmedRecoveryAmount:0});expect(await client.recoveryExecution.findUnique({where:{recoveryCaseId:pending.id}})).toBeNull();});

 it('records hard stops as blocked policy actions and prevents execution',async()=>{const stopped=await fixture({failureReason:'CANCELLED_SUBSCRIPTION'});const batch=await service().run(randomUUID());expect(batch).toMatchObject({actionsExecuted:0,blockedByPolicy:1,unsafeActionsPrevented:1,confirmedRecoveryAmount:0});expect(await client.recoveryExecution.findUnique({where:{recoveryCaseId:stopped.id}})).toBeNull();});

 it('does not execute a recovered case again in a later batch request',async()=>{await fixture();const first=await service().run(randomUUID());const second=await service().run(randomUUID());expect(first.actionsExecuted).toBe(1);expect(second).toMatchObject({casesEvaluated:0,actionsExecuted:0,confirmedRecoveryAmount:0});expect(await client.mockProviderOperation.count()).toBe(1);});
});
