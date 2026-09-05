import {RazorpayWebhookService} from '@/domain/recovery/razorpay-webhook-service';
import {RecoveryError} from '@/domain/recovery/policy';
import {boundedBody} from '@/lib/bounded-body';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function POST(request:Request) {
 let raw:string;
 try {raw=await boundedBody(request.body,64*1024);}
 catch {return Response.json({error:'Webhook body exceeds 64 KB'},{status:413,headers:{'Cache-Control':'no-store'}});}
 try {
   const result=await new RazorpayWebhookService().handle(raw,request.headers.get('x-razorpay-signature'),request.headers.get('x-razorpay-event-id'));
   return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 } catch(error) {
   if(error instanceof RecoveryError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
   return Response.json({error:'Webhook processing failed'},{status:500,headers:{'Cache-Control':'no-store'}});
 }
}
