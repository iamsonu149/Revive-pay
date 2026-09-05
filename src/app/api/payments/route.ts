import {db} from '@/lib/db';
import {merchantRequest} from '@/lib/api';
export const dynamic='force-dynamic';
export function GET(request:Request){return merchantRequest(request,()=>db.paymentAttempt.findMany({take:50,orderBy:{attemptedAt:'desc'}}));}
