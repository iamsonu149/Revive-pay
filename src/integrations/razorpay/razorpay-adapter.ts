export type ProviderMode = 'mock'|'razorpay_test';
export type ProviderResult = {
 reference:string;
 outcome:'RECOVERED'|'FAILED'|'LINK_SENT';
 providerStatus?:string;
 recoveryUrl?:string;
};
export interface RazorpayAdapter {
 readonly mode:ProviderMode;
 readonly displayName:string;
 readonly capabilities:{retry:boolean;paymentLinks:boolean};
 retry(paymentId:string, idempotencyKey:string):Promise<ProviderResult>;
 sendUpdateLink(paymentId:string, idempotencyKey:string):Promise<ProviderResult>;
 lookup(idempotencyKey:string, providerReference?:string|null):Promise<ProviderResult|null>;
}
