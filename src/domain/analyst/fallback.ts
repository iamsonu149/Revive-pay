import {scoreRecovery} from '../recovery/recovery-scorer';
import {AnalystAnalysis, FallbackReason} from './analysis';
import {AnalystEvidence, evidencePolicy, evidenceSignals} from './evidence';
import {validateProposal} from './proposal-policy';

export const fallbackMessages: Record<FallbackReason, string> = {
  MISSING_CREDENTIALS: 'Gemini is not configured. Set GEMINI_API_KEY in the server environment to enable it.',
  INVALID_MODEL_CONFIG: 'GEMINI_MODEL is not a valid model identifier. Check the server configuration.',
  TIMEOUT: 'Gemini exceeded the analysis time limit. No provider output was used.',
  RATE_LIMIT: 'Gemini rate-limited this request. No provider output was used.',
  INVALID_RESPONSE: 'Gemini returned an incomplete or invalid analysis. It was discarded.',
  PROVIDER_FAILURE: 'Gemini was unavailable or rejected the request. No provider output was used.',
};

export function deterministicAnalysis(e: AnalystEvidence): AnalystAnalysis {
  const d = scoreRecovery(evidenceSignals(e), new Date(0), evidencePolicy(e));
  let action = d.recommendation;
  if (validateProposal(action, e).status === 'REJECTED') action = e.executionState !== 'NONE' ? 'NEEDS_REVIEW' : 'STOP';
  if (e.caseStatus === 'NEEDS_REVIEW' && action !== 'STOP') action = 'NEEDS_REVIEW';
  let diagnosis = 'The recorded failure signal does not establish a single root cause. Prior successful payments describe history, not current funds or customer intent.';
  const uncertainties = ['The exact provider response and current customer intent have not been supplied.'];
  if (e.failureReason === 'BANK_TECHNICAL') {
    diagnosis = 'The recorded bank-technical failure supports a transient provider or bank issue. The bank-health signal is contextual evidence, not confirmation that the provider has recovered.';
    uncertainties.push('A merchant should confirm current provider health before a due retry.');
  } else if (['EXPIRED_CARD', 'EXPIRED_MANDATE'].includes(e.failureReason)) {
    diagnosis = 'The recorded credential expiry points to a payment-method or mandate update. Waiting alone does not establish that the credential will become usable.';
    uncertainties.push('It is unknown whether the customer has already updated the payment method elsewhere.');
  } else if (e.failureReason === 'INSUFFICIENT_FUNDS') {
    diagnosis = 'The recorded insufficient-funds response describes the failed attempt only. Prior payments or engagement cannot establish present funds; another attempt may still fail.';
    uncertainties.push('Current fund availability and the provider decline details are unknown.');
  } else {
    uncertainties.push('Inspect the provider decline code to distinguish a technical failure, credential problem, and customer-driven interruption.');
  }
  if (e.executionState !== 'NONE') uncertainties.push('Reconcile the existing provider operation; an uncertain outcome must not trigger another action.');
  return {
    diagnosis, evidenceRefs: ['failureReason', 'bankHealthScore', 'recentSuccessfulPayments', 'executionState'],
    proposedAction: action,
    actionRationale: action === 'NEEDS_REVIEW' ? 'Resolve the missing provider or case information through merchant review before selecting any recovery action.' : action === 'STOP' ? 'Current deterministic safeguards stop a new recovery action.' : d.reasonSummary,
    uncertainties,
    escalationReason: action === 'NEEDS_REVIEW' ? 'Provider details or an existing execution outcome require merchant investigation.' : action === 'STOP' ? 'A deterministic stopping condition applies; the analyst cannot override it.' : null,
    customerMessageDraft: action === 'SEND_PAYMENT_UPDATE_LINK' ? 'Hello [customer], please review your payment details for [amount] if you wish to continue your subscription: [secure payment update link]. If you already updated them, please disregard this draft request.' : null,
  };
}
