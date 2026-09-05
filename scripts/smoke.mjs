import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';

const directory=mkdtempSync(join(tmpdir(),'revive-smoke-'));
const url=`file:${join(directory,'test.db').replaceAll('\\','/')}`;
writeFileSync(join(directory,'test.db'),'');
const client=new PrismaClient({datasources:{db:{url}}});
const env={...process.env,DATABASE_URL:url,MERCHANT_USER:'smoke',MERCHANT_PASSWORD:'isolated-smoke-password-12345',GEMINI_API_KEY:'',GEMINI_MODEL:'gemini-3.8-flash'};
const authorization=`Basic ${Buffer.from(`${env.MERCHANT_USER}:${env.MERCHANT_PASSWORD}`).toString('base64')}`;
let server;
let output='';
let counter=0;
async function fixture({amount=2500,reason='EXPIRED_CARD',action='SEND_PAYMENT_UPDATE_LINK',status='PENDING_APPROVAL',paymentId}={}) {
 const customer=await client.customer.create({data:{name:'Smoke Customer',email:`smoke${counter++}@example.com`,phone:'000',riskBand:'LOW'}});
 const subscription=await client.subscription.create({data:{customerId:customer.id,planName:'Smoke',amount,status:'PAST_DUE',nextBillingDate:new Date()}});
 const payment=await client.paymentAttempt.create({data:{id:paymentId,customerId:customer.id,subscriptionId:subscription.id,amount,status:'FAILED',failureReason:reason,attemptedAt:new Date(Date.now()-48*3600000),retryCount:0,paymentMethodAgeDays:90,recentSuccessfulPayments:6,bankHealthScore:90,customerEngagementScore:80,contactCountLast7Days:0}});
 return client.recoveryCase.create({data:{paymentAttemptId:payment.id,predictedRecoveryProbability:80,recommendedAction:action,reasonSummary:'Smoke fixture',evidence:'[]',requiresHumanApproval:amount>10000,status,scheduledFor:new Date(Date.now()-3600000)}});
}
try {
 execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'migrate','deploy'],{env,stdio:'pipe'});
 await client.setting.create({data:{id:'merchant'}});
 const link=await fixture();
 const high=await fixture({amount:12000,reason:'BANK_TECHNICAL',action:'RETRY_LATER'});
 const review=await fixture({reason:'UNKNOWN_FAILURE',action:'NEEDS_REVIEW',status:'NEEDS_REVIEW'});
 const outage=await fixture({reason:'BANK_TECHNICAL',action:'RETRY_LATER',paymentId:'outage-smoke'});
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
 const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',chunk=>{output+=chunk;});server.stderr.on('data',chunk=>{output+=chunk;});
 let ready=false;
 for(let i=0;i<60;i++) {try{await fetch(base);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
 assert(ready,'Production server did not start');
 const request=(path,method='GET',body,extra={})=>fetch(base+path,{method,headers:{authorization,...(method==='GET'?{}:{origin:base,'Content-Type':'application/json'}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal((await fetch(base+'/dashboard')).status,401);
 for(const path of ['/dashboard','/audit','/recoveries','/simulator',`/recoveries/${link.id}`]) {
   const denied=await fetch(base+path,{headers:{'x-middleware-subrequest':Array(5).fill('middleware:src/middleware').join(':')}});
   const body=await denied.text();assert(!body.includes('Smoke Customer'),`Unauthenticated page exposed case data: ${path}`);
 }
 assert.equal((await fetch(base+'/api/settings',{method:'PATCH',headers:{'x-middleware-subrequest':'middleware:middleware:middleware:middleware:middleware'},body:'{}'})).status,401);
 for(const path of ['/dashboard','/recoveries','/recoveries?q=no-matches','/audit','/settings','/simulator',`/recoveries/${link.id}`,'/api/payments']) {
   const r=await request(path);assert.equal(r.status,200,`${path}: ${await r.text()}`);
 }
 const analystPath=`/api/recoveries/${high.id}/analysis`;
 assert.equal((await fetch(base+analystPath)).status,401);
 assert.equal((await request(analystPath,'POST',{requestId:randomUUID()},{origin:'https://attacker.example'})).status,403);
 const initialAnalyst=await (await request(analystPath)).json();
 assert.equal(initialAnalyst.analysis,null);assert.equal(initialAnalyst.configured,false);
 assert.equal(await client.recoveryAnalysis.count(),0,'Reading a page or metadata generated an analysis');
 const beforeAnalysis=await client.recoveryCase.findUniqueOrThrow({where:{id:high.id}});
 const requestId=randomUUID();
 const analysisResponse=await request(analystPath,'POST',{requestId});assert.equal(analysisResponse.status,200);
 const analysis=await analysisResponse.json();
 assert.equal(analysis.sourceLabel,'Deterministic fallback');assert.equal(analysis.fallbackReason,'MISSING_CREDENTIALS');
 assert.equal(analysis.model,null);assert.equal(analysis.stale,false);
 assert.deepEqual(await client.recoveryCase.findUniqueOrThrow({where:{id:high.id}}),beforeAnalysis);
 assert.equal(await client.recoveryExecution.count(),0);
 assert.equal((await request(analystPath,'POST',{requestId})).status,200);
 assert.equal(await client.recoveryAnalysis.count(),1,'Duplicate request generated another analysis');
 assert.equal((await request(analystPath,'POST',{requestId:randomUUID()})).status,429);
 assert((await (await request(`/recoveries/${high.id}`)).text()).includes('AI Recovery Analyst'));
 assert.equal((await request('/api/settings','PATCH',{killSwitch:true},{origin:'https://attacker.example'})).status,403);
 assert.equal((await request('/api/settings','PATCH',{maxContacts:3})).status,422);
 assert.equal((await request('/api/settings','PATCH',{killSwitch:true})).status,200);
 assert.equal((await request('/api/settings','PATCH',{autoRecoveryLimit:9000})).status,200);
 assert.equal((await (await request('/api/settings')).json()).killSwitch,true);
 assert.equal((await request(`/api/recoveries/${link.id}/execute`,'POST',{})).status,409);
 await request('/api/settings','PATCH',{killSwitch:false});
 assert.equal((await request(`/api/recoveries/${review.id}/execute`,'POST',{})).status,409);
 assert.equal((await request(`/api/recoveries/${review.id}/approve`,'POST',{})).status,422);
 assert.equal((await request(`/api/recoveries/${link.id}/execute`,'POST',{})).status,200);
 assert.equal((await client.recoveryCase.findUniqueOrThrow({where:{id:link.id}})).recoveredAmount,0);
 assert.equal((await request(`/api/recoveries/${link.id}/confirm-mock`,'POST',{})).status,200);
 const dashboard=await (await request('/dashboard')).text();assert(dashboard.includes('2,500'),'Dashboard did not refresh confirmed revenue');
 const audit=await (await request('/audit')).text();assert(audit.includes('RECOVERED'),'Audit page did not refresh');
 assert.equal((await request(`/api/recoveries/${high.id}/execute`,'POST',{})).status,409);
 assert.equal((await request(`/api/recoveries/${high.id}/approve`,'POST',{})).status,200);
 assert.equal((await request(`/api/recoveries/${high.id}/execute`,'POST',{})).status,200);
 assert.equal((await (await request(analystPath)).json()).analysis.stale,true);
 assert.equal((await request(`/api/recoveries/${outage.id}/execute`,'POST',{})).status,503);
 assert.equal((await request(`/api/recoveries/${outage.id}/execute`,'POST',{})).status,409);
 assert.equal((await request(`/api/recoveries/${outage.id}/reconcile`,'POST',{})).status,503);
 const simulation=await request('/api/simulator/run','POST',{});assert.equal(simulation.status,200);
 const metrics=await simulation.json();assert.equal(metrics[2].strategyName,'Revive Pay Decision Engine');
 assert.equal(metrics[2].recoveredAmount,0,'Review-only simulation recovered money');
 assert.equal((await request('/api/recoveries/run-due','POST',{})).status,200);
 // Verify the destructive demo seed only in this isolated temporary database.
 execFileSync(process.execPath,['--import','tsx',resolve('prisma/seed.ts')],{env,stdio:'pipe'});
 assert.equal(await client.recoveryCase.count(),300);
 assert(await client.contactEvent.count()>0);
 assert(await client.subscription.count({where:{status:'CANCELLED'}})>0);
 assert(await client.paymentAttempt.count({where:{status:'REFUNDED'}})>0);
 const seededOutage=await client.recoveryCase.findUniqueOrThrow({where:{paymentAttemptId:'outage-attempt'}});
 assert.equal(seededOutage.recommendedAction,'RETRY_LATER');
 assert(seededOutage.scheduledFor.getTime()<Date.now());
 console.log('Production smoke passed: protected pages/APIs, AI analyst fallback/limits/staleness, settings, review, approval, link confirmation, fresh dashboard/audit, outage, simulator, scheduler.');
} catch(error) {
 console.error(output.slice(-6000));throw error;
} finally {
 if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
 await client.$disconnect();
 for(const name of readdirSync(directory))if(/^test\.db(?:-journal|-wal|-shm)?$/.test(name))unlinkSync(join(directory,name));
 rmdirSync(directory);
}
