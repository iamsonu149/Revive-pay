import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export const RAZORPAY_WEBHOOK_EVENTS=[
 'payment.failed','payment.captured','order.paid','payment_link.paid','subscription.pending','subscription.halted',
] as const;

export function webhookPayloadHash(raw:string) {
 return createHash('sha256').update(raw,'utf8').digest('hex');
}

export function verifyRazorpayWebhook(raw:string,signature:string|null,secret:string) {
 if(!signature||!secret||!/^[a-f0-9]{64}$/i.test(signature))return false;
 const expected=createHmac('sha256',secret).update(raw,'utf8').digest();
 const actual=Buffer.from(signature,'hex');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
