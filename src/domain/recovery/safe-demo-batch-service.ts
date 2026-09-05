import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {db} from '../../lib/db';
import {RecoveryError} from './policy';
import {RecoveryService} from './recovery-service';

const MAX_BATCH_CASES=20;
const approvalMessage=(message:string)=>/approval|required approved action|explicit approved action/i.test(message);
const executedResults=new Set(['CONFIRMED_RECOVERY','DECLINED','PENDING_PROVIDER','UNRESOLVED']);

export class SafeDemoBatchService{
 constructor(private client:PrismaClient=db,private recovery=new RecoveryService(client),private clock=()=>new Date()){}

 async list(){return this.client.safeDemoBatch.findMany({include:{items:{orderBy:{createdAt:'asc'}}},orderBy:{createdAt:'desc'},take:5});}

 async run(requestId:string,actor='MERCHANT'){
  if(this.recovery.adapter.mode!=='mock')throw new RecoveryError('Safe Demo Batch is available only with the mock provider',409);
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestId))throw new RecoveryError('A valid request ID is required',422);
  let batch=await this.client.safeDemoBatch.findUnique({where:{requestId},include:{items:true}});
  if(!batch){
   const id=`demo_${randomUUID()}`;
   try{
    batch=await this.client.$transaction(async tx=>{
     const candidates=await tx.recoveryCase.findMany({where:{execution:null,status:{in:['PENDING_APPROVAL','APPROVED','NEEDS_REVIEW']},paymentAttempt:{provider:'mock'}},select:{id:true,recommendedAction:true},orderBy:[{predictedRecoveryProbability:'desc'},{createdAt:'asc'}],take:MAX_BATCH_CASES});
     const created=await tx.safeDemoBatch.create({data:{id,requestId,items:{create:candidates.map(candidate=>({recoveryCaseId:candidate.id,action:candidate.recommendedAction}))}},include:{items:true}});
     await tx.auditEvent.create({data:{eventType:'SAFE_DEMO_BATCH_STARTED',actor,payload:JSON.stringify({batchId:id,requestId,casesSelected:candidates.length,maximumCases:MAX_BATCH_CASES,mode:'mock'})}});
     return created;
    });
   }catch(error){
    if((error as {code?:string}).code!=='P2002')throw error;
    batch=await this.client.safeDemoBatch.findUniqueOrThrow({where:{requestId},include:{items:true}});
   }
  }
  if(batch.status==='COMPLETED')return batch;

  for(const item of batch.items.filter(candidate=>candidate.result==='PENDING')){
   let result='UNRESOLVED',detail='Execution outcome could not be confirmed',recoveredAmount=0;
   try{
    const recoveryCase=await this.recovery.execute(item.recoveryCaseId,`SAFE_DEMO_BATCH:${batch.id}`);
    if(recoveryCase.status==='RECOVERED'&&recoveryCase.recoveredAmount>0){result='CONFIRMED_RECOVERY';detail='Persisted confirmed mock-provider recovery';recoveredAmount=recoveryCase.recoveredAmount;}
    else if(recoveryCase.status==='FAILED'){result='DECLINED';detail='Mock provider returned a declined outcome';}
    else if(recoveryCase.status==='EXECUTED'){result='PENDING_PROVIDER';detail='Payment link created; customer payment is not confirmed';}
   }catch(error){
    const message=error instanceof RecoveryError?error.message:'Execution interrupted; existing claims require reconciliation';
    const execution=await this.client.recoveryExecution.findUnique({where:{recoveryCaseId:item.recoveryCaseId}});
    if(execution){result='UNRESOLVED';detail='Provider action exists but its outcome is unresolved';}
    else if(approvalMessage(message)){result='REQUIRES_APPROVAL';detail='Merchant approval is required before execution';}
    else {result='BLOCKED_POLICY';detail=message.slice(0,240);}
   }
   await this.client.$transaction(async tx=>{
    await tx.safeDemoBatchCase.update({where:{id:item.id},data:{result,recoveredAmount,detail}});
    await tx.auditEvent.create({data:{recoveryCaseId:item.recoveryCaseId,eventType:'SAFE_DEMO_BATCH_CASE_EVALUATED',actor,payload:JSON.stringify({batchId:batch!.id,result,recoveredAmount})}});
   });
  }

  const items=await this.client.safeDemoBatchCase.findMany({where:{batchId:batch.id},orderBy:{createdAt:'asc'}});
  const count=(...results:string[])=>items.filter(item=>results.includes(item.result)).length;
  const summary={casesEvaluated:items.length,actionsExecuted:items.filter(item=>executedResults.has(item.result)).length,confirmedRecoveryCount:count('CONFIRMED_RECOVERY'),confirmedRecoveryAmount:items.reduce((sum,item)=>sum+item.recoveredAmount,0),declinedOrUnresolved:count('DECLINED','PENDING_PROVIDER','UNRESOLVED'),blockedByPolicy:count('BLOCKED_POLICY'),unsafeActionsPrevented:count('BLOCKED_POLICY'),requiresApproval:count('REQUIRES_APPROVAL')};
  return this.client.$transaction(async tx=>{
   const completed=await tx.safeDemoBatch.update({where:{id:batch!.id},data:{...summary,status:'COMPLETED',completedAt:this.clock()},include:{items:{orderBy:{createdAt:'asc'}}}});
   await tx.auditEvent.create({data:{eventType:'SAFE_DEMO_BATCH_COMPLETED',actor,payload:JSON.stringify({batchId:batch!.id,mode:'mock',...summary})}});
   return completed;
  });
 }
}
