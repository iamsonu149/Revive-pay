import {RecoveryService} from '@/domain/recovery/recovery-service';
import {merchantRequest} from '@/lib/api';
export function POST(request:Request){return merchantRequest(request,actor=>new RecoveryService().runDue(actor));}
