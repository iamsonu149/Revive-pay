export type ProviderResult = {reference:string; outcome:'RECOVERED'|'FAILED'|'LINK_SENT'};
export interface RazorpayAdapter {
 retry(paymentId:string, idempotencyKey:string):Promise<ProviderResult>;
 sendUpdateLink(paymentId:string, idempotencyKey:string):Promise<ProviderResult>;
 lookup(idempotencyKey:string):Promise<ProviderResult|null>;
}
