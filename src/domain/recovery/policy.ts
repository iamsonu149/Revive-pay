import {AttemptSignals} from './types';

export const mandatoryNeverRetry=['CANCELLED_SUBSCRIPTION','REFUND','SUSPECTED_CHARGEBACK','CHARGEBACK'] as const;
export const recoveryActions=['RETRY_LATER','SEND_PAYMENT_UPDATE_LINK'] as const;
export type RecoveryPolicy = {
 autoRecoveryLimit:number;maxContacts:number;killSwitch:boolean;maxRetries?:number;minRecoveryScore?:number;
 minPaymentAmount?:number;approvalAmountThreshold?:number;quietHoursStart?:number;quietHoursEnd?:number;
 retryDelayHours?:number;allowedRecoveryActions?:string;neverRetryFailureReasons?:string;
};
export const defaultPolicy: RecoveryPolicy = {autoRecoveryLimit:10000,maxContacts:2,killSwitch:false,maxRetries:1,minRecoveryScore:0,minPaymentAmount:100,approvalAmountThreshold:10000,quietHoursStart:22,quietHoursEnd:8,retryDelayHours:24,allowedRecoveryActions:JSON.stringify(recoveryActions),neverRetryFailureReasons:JSON.stringify(mandatoryNeverRetry)};
export class RecoveryError extends Error {
  constructor(message:string, public status=409) { super(message); }
}
export function approvalRequired(amount:number, policy:RecoveryPolicy) {
  return amount > Math.min(10000, policy.autoRecoveryLimit, policy.approvalAmountThreshold??10000);
}
export function allowedActions(policy:RecoveryPolicy) {try{return JSON.parse(policy.allowedRecoveryActions??defaultPolicy.allowedRecoveryActions!) as string[];}catch{return [...recoveryActions];}}
export function neverRetryReasons(policy:RecoveryPolicy) {try{return JSON.parse(policy.neverRetryFailureReasons??defaultPolicy.neverRetryFailureReasons!) as string[];}catch{return [...mandatoryNeverRetry];}}
export function isQuietHour(date:Date,policy:RecoveryPolicy) {
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}).format(date));
 const start=policy.quietHoursStart??22,end=policy.quietHoursEnd??8;return start===end?false:start<end?hour>=start&&hour<end:hour>=start||hour<end;
}
export function hardStop(s:AttemptSignals, policy=defaultPolicy):string|null {
  if (neverRetryReasons(policy).includes(s.failureReason)
      || ['CANCELLED','REFUNDED','CHARGEBACK','SUCCEEDED','PAID'].includes(s.paymentStatus ?? '')
      || ['CANCELLED','REFUNDED','CHARGEBACK'].includes(s.subscriptionStatus ?? '')) {
    return 'Payment is cancelled, refunded, paid, or chargeback-linked';
  }
  const minimum=policy.minPaymentAmount??0;if(s.amount<minimum)return `Payment amount is below the merchant minimum (${minimum} INR)`;
  if (s.retryCount >= 1) return 'Maximum automated retry limit reached (1)';
  if (s.contactCountLast7Days >= Math.min(2, policy.maxContacts)) return 'Customer contact limit reached';
  return null;
}
