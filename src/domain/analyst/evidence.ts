import {AttemptSignals, Action} from '../recovery/types';
import {approvalRequired, RecoveryError, RecoveryPolicy} from '../recovery/policy';

export const actions = ['RETRY_LATER', 'SEND_PAYMENT_UPDATE_LINK', 'NEEDS_REVIEW', 'STOP'] as const;
const failures = ['BANK_TECHNICAL', 'INSUFFICIENT_FUNDS', 'EXPIRED_CARD', 'EXPIRED_MANDATE', 'CUSTOMER_ABANDONMENT', 'CANCELLED_SUBSCRIPTION', 'REFUND', 'SUSPECTED_CHARGEBACK', 'CHARGEBACK', 'UNKNOWN_FAILURE'] as const;
const paymentStatuses = ['FAILED', 'SUCCEEDED', 'PAID', 'CANCELLED', 'REFUNDED', 'CHARGEBACK', 'UNKNOWN'] as const;
const subscriptionStatuses = ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'REFUNDED', 'CHARGEBACK', 'UNKNOWN'] as const;
const caseStatuses = ['PENDING_APPROVAL', 'APPROVED', 'NEEDS_REVIEW', 'STOPPED', 'PROCESSING', 'EXECUTED', 'RECOVERED', 'FAILED', 'UNKNOWN'] as const;
const executionStates = ['NONE', 'CLAIMED', 'UNKNOWN', 'LINK_SENT', 'RECOVERED', 'FAILED'] as const;

export type AnalystContext = {
  signals: AttemptSignals;
  policy: RecoveryPolicy;
  caseStatus: string;
  savedAction: string;
  requiresHumanApproval: boolean;
  approvedAmount: number | null;
  scheduledFor: Date | null;
  executionState: string;
};

function known<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}
function number(value: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new RecoveryError('Case evidence contains an invalid numeric signal', 422);
  return value;
}

/** Explicit allowlist. Never spread a database object into model input. */
export function buildAnalystEvidence(context: AnalystContext, now: Date) {
  const s = context.signals;
  const age = now.getTime() - s.attemptedAt.getTime();
  if (!Number.isFinite(age) || age < 0) throw new RecoveryError('Case evidence has an invalid attempt timestamp', 422);
  const policy = context.policy;
  const dueAt = Math.max(context.scheduledFor?.getTime() ?? 0, s.attemptedAt.getTime() + 86400000);
  if (!Number.isFinite(dueAt)) throw new RecoveryError('Case evidence has an invalid retry schedule', 422);
  return {
    failureReason: known(s.failureReason, failures, 'UNKNOWN_FAILURE'),
    amountInr: number(s.amount),
    currency: 'INR' as const,
    bankHealthScore: number(s.bankHealthScore, 100),
    recentSuccessfulPayments: number(s.recentSuccessfulPayments),
    paymentMethodAgeDays: number(s.paymentMethodAgeDays),
    customerEngagementScore: number(s.customerEngagementScore, 100),
    retryCount: number(s.retryCount),
    contactCountLast7Days: number(s.contactCountLast7Days),
    paymentStatus: known(s.paymentStatus, paymentStatuses, 'UNKNOWN'),
    subscriptionStatus: known(s.subscriptionStatus, subscriptionStatuses, 'UNKNOWN'),
    failureAgeBand: age < 86400000 ? 'UNDER_24_HOURS' as const : age > 3 * 86400000 ? 'OVER_72_HOURS' as const : '24_TO_72_HOURS' as const,
    caseStatus: known(context.caseStatus, caseStatuses, 'UNKNOWN'),
    savedAction: known(context.savedAction, actions, 'STOP'),
    executionState: known(context.executionState, executionStates, 'UNKNOWN'),
    maxAutomatedRetries: 1,
    maxContactsIn7Days: Math.min(2, number(policy.maxContacts)),
    autoRecoveryLimitInr: Math.min(10000, number(policy.autoRecoveryLimit)),
    killSwitchEnabled: policy.killSwitch === true,
    requiresHumanApproval: context.requiresHumanApproval || approvalRequired(s.amount, policy),
    approvalValidForCurrentAmount: context.caseStatus === 'APPROVED' && context.approvedAmount === s.amount,
    retryDue: dueAt <= now.getTime(),
  };
}

export type AnalystEvidence = ReturnType<typeof buildAnalystEvidence>;
export type EvidenceKey = keyof AnalystEvidence;
export const evidenceLabels: Record<EvidenceKey, string> = {
  failureReason: 'Recorded failure', amountInr: 'Amount (INR)', currency: 'Currency',
  bankHealthScore: 'Bank health signal', recentSuccessfulPayments: 'Prior successful payments',
  paymentMethodAgeDays: 'Payment method age (days)', customerEngagementScore: 'Engagement signal',
  retryCount: 'Automated retries reserved', contactCountLast7Days: 'Contacts reserved in seven days',
  paymentStatus: 'Current payment state', subscriptionStatus: 'Current subscription state',
  failureAgeBand: 'Elapsed time band', caseStatus: 'Recovery case state', savedAction: 'Saved action',
  executionState: 'Existing execution state', maxAutomatedRetries: 'Maximum automated retries',
  maxContactsIn7Days: 'Maximum contacts in seven days', autoRecoveryLimitInr: 'Automatic recovery limit (INR)',
  killSwitchEnabled: 'Kill switch', requiresHumanApproval: 'Approval required',
  approvalValidForCurrentAmount: 'Approval matches current amount', retryDue: 'Retry is due',
};

export function evidenceSignals(e: AnalystEvidence): AttemptSignals {
  // Representative timestamps retain the scorer's exact <24h / >72h boundaries.
  const hours = e.failureAgeBand === 'UNDER_24_HOURS' ? 12 : e.failureAgeBand === 'OVER_72_HOURS' ? 96 : 48;
  return {
    failureReason: e.failureReason, amount: e.amountInr, retryCount: e.retryCount,
    bankHealthScore: e.bankHealthScore, recentSuccessfulPayments: e.recentSuccessfulPayments,
    paymentMethodAgeDays: e.paymentMethodAgeDays, customerEngagementScore: e.customerEngagementScore,
    contactCountLast7Days: e.contactCountLast7Days, attemptedAt: new Date(-hours * 3600000),
    paymentStatus: e.paymentStatus, subscriptionStatus: e.subscriptionStatus,
  };
}
export const evidencePolicy = (e: AnalystEvidence): RecoveryPolicy => ({
  autoRecoveryLimit: e.autoRecoveryLimitInr, maxContacts: e.maxContactsIn7Days, killSwitch: e.killSwitchEnabled,
});
export const isAction = (value: unknown): value is Action => typeof value === 'string' && actions.includes(value as Action);
