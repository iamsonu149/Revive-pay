import {hardStop} from '../recovery/policy';
import {scoreRecovery} from '../recovery/recovery-scorer';
import {Action} from '../recovery/types';
import {AnalystEvidence, evidencePolicy, evidenceSignals} from './evidence';

export type ProposalPolicy = {
  status: 'REJECTED' | 'RESTRICTED' | 'ADVISORY';
  reasons: string[];
  requiresApproval: boolean;
  differsFromSavedAction: boolean;
  messageDraftAllowed: boolean;
};

export function validateProposal(action: Action, e: AnalystEvidence): ProposalPolicy {
  const differsFromSavedAction = action !== e.savedAction;
  const reasons: string[] = [];
  const result: ProposalPolicy = {status: 'ADVISORY', reasons, requiresApproval: false, differsFromSavedAction, messageDraftAllowed: false};
  if (action === 'STOP' || action === 'NEEDS_REVIEW') {
    reasons.push('Advisory only. No recovery action, approval, or customer contact is authorized.');
    return result;
  }
  const signals = evidenceSignals(e), policy = evidencePolicy(e);
  const stop = hardStop(signals, policy);
  const fresh = scoreRecovery(signals, new Date(0), policy);
  if (stop) reasons.push(stop);
  if (e.killSwitchEnabled) reasons.push('The merchant kill switch blocks new actions.');
  if (e.executionState !== 'NONE') reasons.push('A provider operation already exists. Reconcile it instead of creating another action.');
  if (['STOPPED', 'PROCESSING', 'EXECUTED', 'RECOVERED', 'FAILED', 'UNKNOWN'].includes(e.caseStatus)) reasons.push('The current case state does not allow a new action.');
  if (e.paymentStatus === 'UNKNOWN' || e.subscriptionStatus === 'UNKNOWN') reasons.push('Payment or subscription state is unknown; investigate before acting.');
  if (e.savedAction === 'STOP' || fresh.recommendation === 'STOP') reasons.push('The deterministic decision engine stops recovery.');
  if (action === 'RETRY_LATER' && fresh.recommendation === 'SEND_PAYMENT_UPDATE_LINK') reasons.push('Expired credentials require a payment update, not a retry.');
  if (reasons.length) return {...result, status: 'REJECTED'};

  result.requiresApproval = differsFromSavedAction || ((e.requiresHumanApproval || fresh.recommendation === 'NEEDS_REVIEW' || e.caseStatus === 'NEEDS_REVIEW') && !e.approvalValidForCurrentAmount);
  if (e.caseStatus === 'APPROVED' && !e.approvalValidForCurrentAmount) {
    result.requiresApproval = true;
    reasons.push('The existing approval does not match the current payment amount.');
  }
  if (result.requiresApproval) reasons.push('An explicit merchant review and approval is required before any action.');
  if (differsFromSavedAction) reasons.push('This differs from the saved action. The AI proposal has not changed that action.');
  if (action === 'RETRY_LATER' && !e.retryDue) reasons.push('The retry is not due yet; the scheduled time and 24-hour minimum still apply.');
  result.status = reasons.length ? 'RESTRICTED' : 'ADVISORY';
  result.messageDraftAllowed = action === 'SEND_PAYMENT_UPDATE_LINK';
  reasons.push('Use the existing recovery controls. This analysis cannot approve, apply, or execute its proposal.');
  return result;
}
