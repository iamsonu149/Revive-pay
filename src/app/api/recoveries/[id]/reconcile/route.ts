import {RecoveryService} from '@/domain/recovery/recovery-service';
import {merchantRequest} from '@/lib/api';
export function POST(request:Request,{params}:{params:{id:string}}){return merchantRequest(request,actor=>new RecoveryService().reconcile(params.id,actor));}
