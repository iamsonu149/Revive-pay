import {PrismaClient} from '@prisma/client';
import {db} from '../../lib/db';
import {RecoveryError} from './policy';
import {RecoveryService} from './recovery-service';

export class ApprovalService {
 constructor(private client:PrismaClient=db,private recovery=new RecoveryService(client)){}
 async bulkApprove(ids:unknown,actor:string) {
   if(!Array.isArray(ids)||ids.length<1||ids.length>50||ids.some(id=>typeof id!=='string'||id.length>100))throw new RecoveryError('Select between 1 and 50 valid cases',422);
   const unique=[...new Set(ids as string[])];const results:{id:string;status:'APPROVED'|'BLOCKED';reason?:string}[]=[];
   for(const id of unique){
     try{await this.recovery.approve(id,actor);results.push({id,status:'APPROVED'});}
     catch(error){results.push({id,status:'BLOCKED',reason:error instanceof RecoveryError?error.message:'Safety validation failed'});}
   }
   await this.client.auditEvent.create({data:{eventType:'BULK_APPROVAL_COMPLETED',actor,payload:JSON.stringify({requested:unique.length,approved:results.filter(x=>x.status==='APPROVED').length,blocked:results.filter(x=>x.status==='BLOCKED').length,caseIds:unique})}});
   return {approved:results.filter(x=>x.status==='APPROVED').length,blocked:results.filter(x=>x.status==='BLOCKED').length,results};
 }
}
