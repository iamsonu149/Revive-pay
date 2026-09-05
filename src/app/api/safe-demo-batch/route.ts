import {merchantRequest} from '@/lib/api';
import {RecoveryError} from '@/domain/recovery/policy';
import {SafeDemoBatchService} from '@/domain/recovery/safe-demo-batch-service';

export function GET(request:Request){return merchantRequest(request,()=>new SafeDemoBatchService().list());}
export function POST(request:Request){return merchantRequest(request,async actor=>{const raw=await request.text();if(raw.length>2048)throw new RecoveryError('Request too large',413);let body:{requestId?:unknown};try{body=JSON.parse(raw);}catch{throw new RecoveryError('Invalid JSON',422);}if(typeof body.requestId!=='string')throw new RecoveryError('A valid request ID is required',422);return new SafeDemoBatchService().run(body.requestId,actor);});}
