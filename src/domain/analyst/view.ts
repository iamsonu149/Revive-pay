import type {AnalystAnalysis, FallbackReason} from './analysis';
import type {AnalystEvidence} from './evidence';
import type {ProposalPolicy} from './proposal-policy';

export type AnalystView = {
  source: 'GEMINI' | 'DETERMINISTIC_FALLBACK';
  sourceLabel: 'Gemini analysis' | 'Deterministic fallback';
  model: string | null;
  requestedModel: string | null;
  promptVersion: string;
  analyzedAt: string;
  evidenceFingerprint: string;
  evidence: AnalystEvidence;
  analysis: AnalystAnalysis;
  policy: ProposalPolicy;
  stale: boolean;
  fallbackReason: FallbackReason | null;
};
export type AnalystState = {analysis: AnalystView | null; pending: boolean; retryAt: string | null; configured: boolean};
