import {ApprovalService} from '@/domain/recovery/approval-service';
import {RecoveryError} from '@/domain/recovery/policy';
import {boundedBody} from '@/lib/bounded-body';
import {merchantRequest} from '@/lib/api';

export function POST(request:Request){return merchantRequest(request,async actor=>{
 let raw:string;try{raw=await boundedBody(request.body,16*1024);}catch{throw new RecoveryError('Request body is too large',413);}
 const body=JSON.parse(raw||'{}') as {ids?:unknown};return new ApprovalService().bulkApprove(body.ids,actor);
});}
