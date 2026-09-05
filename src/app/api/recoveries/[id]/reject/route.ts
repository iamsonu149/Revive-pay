import {RecoveryService} from '@/domain/recovery/recovery-service';
import {RecoveryError} from '@/domain/recovery/policy';
import {boundedBody} from '@/lib/bounded-body';
import {merchantRequest} from '@/lib/api';

export function POST(request:Request,{params}:{params:{id:string}}){return merchantRequest(request,async actor=>{
 let raw:string;try{raw=await boundedBody(request.body,2048);}catch{throw new RecoveryError('Request body is too large',413);}
 const body=JSON.parse(raw||'{}') as {reason?:unknown};if(typeof body.reason!=='string')throw new RecoveryError('Provide a rejection reason',422);
 return new RecoveryService().reject(params.id,body.reason,actor);
});}
