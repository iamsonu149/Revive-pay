import {AttemptSignals} from './types';

export type RecoveryPolicy = {autoRecoveryLimit:number; maxContacts:number; killSwitch:boolean};
export const defaultPolicy: RecoveryPolicy = {autoRecoveryLimit:10000, maxContacts:2, killSwitch:false};
export class RecoveryError extends Error {
  constructor(message:string, public status=409) { super(message); }
}
export function approvalRequired(amount:number, policy:RecoveryPolicy) {
  return amount > Math.min(10000, policy.autoRecoveryLimit);
}
export function hardStop(s:AttemptSignals, policy=defaultPolicy):string|null {
  if (['CANCELLED_SUBSCRIPTION','REFUND','SUSPECTED_CHARGEBACK','CHARGEBACK'].includes(s.failureReason)
      || ['CANCELLED','REFUNDED','CHARGEBACK','SUCCEEDED','PAID'].includes(s.paymentStatus ?? '')
      || ['CANCELLED','REFUNDED','CHARGEBACK'].includes(s.subscriptionStatus ?? '')) {
    return 'Payment is cancelled, refunded, paid, or chargeback-linked';
  }
  if (s.retryCount >= 1) return 'Maximum automated retry limit reached (1)';
  if (s.contactCountLast7Days >= Math.min(2, policy.maxContacts)) return 'Customer contact limit reached';
  return null;
}
