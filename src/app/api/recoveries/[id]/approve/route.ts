import {RecoveryService} from '@/domain/recovery/recovery-service';
import {RecoveryError} from '@/domain/recovery/policy';
import {merchantRequest} from '@/lib/api';
export function POST(request:Request,{params}:{params:{id:string}}){return merchantRequest(request,async actor=>{
 const body=await request.json();
 if(!body || typeof body!=='object' || Array.isArray(body) || (body.action!==undefined && typeof body.action!=='string')) throw new RecoveryError('Invalid approval decision',422);
 return new RecoveryService().approve(params.id,actor,body.action);
});}
