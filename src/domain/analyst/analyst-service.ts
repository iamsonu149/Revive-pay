import {createHash} from 'node:crypto';
import {Prisma, PrismaClient, RecoveryAnalysis} from '@prisma/client';
import {db} from '../../lib/db';
import {AnalystProvider, GeminiAnalyst, GeminiConfig, geminiConfig, requestedModel} from '../../integrations/gemini/gemini-analyst';
import {defaultPolicy, RecoveryError} from '../recovery/policy';
import {AnalystAnalysis, AnalystProviderError, FallbackReason, PROMPT_VERSION, validateAnalysis} from './analysis';
import {AnalystEvidence, buildAnalystEvidence} from './evidence';
import {deterministicAnalysis} from './fallback';
import {validateProposal} from './proposal-policy';
import {AnalystState, AnalystView} from './view';

export const ANALYSIS_COOLDOWN_MS = 60000;
export const ANALYSIS_HOURLY_LIMIT = 20;
export const ANALYSIS_RUNNING_LEASE_MS = 30000;
const hour = 3600000;
export const evidenceFingerprint = (e: AnalystEvidence) => createHash('sha256').update(JSON.stringify(e)).digest('hex');
type Database = Prisma.TransactionClient;

export class AnalystService {
  constructor(
    private client: PrismaClient = db,
    private provider: AnalystProvider = new GeminiAnalyst(),
    private config: () => GeminiConfig = geminiConfig,
    private clock: () => Date = () => new Date(),
  ) {}

  private async evidence(tx: Database, id: string, now: Date): Promise<AnalystEvidence> {
    const c = await tx.recoveryCase.findUnique({where: {id}, select: {
      status: true, recommendedAction: true, requiresHumanApproval: true, approvedAmount: true, scheduledFor: true,
      execution: {select: {status: true}},
      paymentAttempt: {select: {
        customerId: true, // Used locally to count contacts, never included in model evidence.
        failureReason: true, amount: true, retryCount: true, bankHealthScore: true,
        recentSuccessfulPayments: true, paymentMethodAgeDays: true, customerEngagementScore: true,
        status: true, attemptedAt: true, subscription: {select: {status: true}},
      }},
    }});
    if (!c) throw new RecoveryError('Case not found', 404);
    const p = c.paymentAttempt;
    const contactCountLast7Days = await tx.contactEvent.count({where: {customerId: p.customerId, createdAt: {gt: new Date(now.getTime() - 7 * 86400000)}}});
    const policy = await tx.setting.findUnique({where: {id: 'merchant'}}) ?? defaultPolicy;
    return buildAnalystEvidence({
      signals: {
        failureReason: p.failureReason, amount: p.amount, retryCount: p.retryCount,
        bankHealthScore: p.bankHealthScore, recentSuccessfulPayments: p.recentSuccessfulPayments,
        paymentMethodAgeDays: p.paymentMethodAgeDays, customerEngagementScore: p.customerEngagementScore,
        attemptedAt: p.attemptedAt, paymentStatus: p.status, subscriptionStatus: p.subscription.status,
        contactCountLast7Days,
      },
      policy, caseStatus: c.status, savedAction: c.recommendedAction,
      requiresHumanApproval: c.requiresHumanApproval, approvedAmount: c.approvedAmount,
      scheduledFor: c.scheduledFor, executionState: c.execution?.status ?? 'NONE',
    }, now);
  }

  private view(row: RecoveryAnalysis, current: AnalystEvidence): AnalystView {
    if (row.status !== 'COMPLETE' || !row.analysisJson || !row.completedAt || !['GEMINI', 'DETERMINISTIC_FALLBACK'].includes(row.source ?? '')) throw new RecoveryError('Analysis is not complete', 409);
    const evidence = JSON.parse(row.evidenceJson) as AnalystEvidence;
    const analysis = validateAnalysis(JSON.parse(row.analysisJson), evidence);
    const policy = validateProposal(analysis.proposedAction, current);
    // Do not display outreach from an old analysis if current policy now prohibits it.
    if (!policy.messageDraftAllowed) analysis.customerMessageDraft = null;
    return {
      source: row.source as AnalystView['source'],
      sourceLabel: row.source === 'GEMINI' ? 'Gemini analysis' : 'Deterministic fallback',
      model: row.model, requestedModel: row.requestedModel, promptVersion: row.promptVersion,
      analyzedAt: row.completedAt.toISOString(), evidenceFingerprint: row.evidenceFingerprint,
      evidence, analysis, policy,
      stale: row.evidenceFingerprint !== evidenceFingerprint(current) || row.promptVersion !== PROMPT_VERSION,
      fallbackReason: row.fallbackReason as FallbackReason | null,
    };
  }

  async latest(id: string): Promise<AnalystState> {
    const now = this.clock(), config = this.config();
    return this.client.$transaction(async tx => {
      const evidence = await this.evidence(tx, id, now);
      const completed = await tx.recoveryAnalysis.findFirst({where: {recoveryCaseId: id, status: 'COMPLETE'}, orderBy: [{createdAt: 'desc'}, {id: 'desc'}]});
      const latest = await tx.recoveryAnalysis.findFirst({where: {recoveryCaseId: id}, orderBy: [{createdAt: 'desc'}, {id: 'desc'}]});
      return {
        analysis: completed ? this.view(completed, evidence) : null,
        pending: !!latest && latest.status === 'RUNNING' && now.getTime() - latest.createdAt.getTime() < ANALYSIS_RUNNING_LEASE_MS,
        retryAt: latest ? new Date(latest.createdAt.getTime() + ANALYSIS_COOLDOWN_MS).toISOString() : null,
        configured: !!config.apiKey?.trim() && !!requestedModel(config),
      };
    });
  }

  async analyze(id: string, requestId: string, actor: string): Promise<AnalystView> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) throw new RecoveryError('Invalid analysis request', 422);
    const now = this.clock(), config = this.config(), model = requestedModel(config);
    const claim = await this.client.$transaction(async tx => {
      // This dedicated write serializes admission across processes using SQLite's writer lock.
      // It never writes recovery cases, payment attempts, settings, contacts, or executions.
      const budget = await tx.analysisBudget.upsert({where: {id: 'merchant'}, update: {requestCount: {increment: 0}}, create: {id: 'merchant', windowStart: now}});
      const evidence = await this.evidence(tx, id, now);
      const fingerprint = evidenceFingerprint(evidence);
      const existing = await tx.recoveryAnalysis.findUnique({where: {requestId}});
      if (existing) {
        if (existing.recoveryCaseId !== id) throw new RecoveryError('Analysis request ID belongs to another case', 409);
        if (existing.status === 'COMPLETE') return {cached: this.view(existing, evidence)};
        throw new RecoveryError('This analysis request is already in progress or was interrupted. Check the panel before starting a new request.', 409);
      }
      const latest = await tx.recoveryAnalysis.findFirst({where: {recoveryCaseId: id}, orderBy: [{createdAt: 'desc'}, {id: 'desc'}]});
      if (latest?.status === 'COMPLETE' && latest.source === 'GEMINI' && latest.model === model && latest.promptVersion === PROMPT_VERSION && latest.evidenceFingerprint === fingerprint && now.getTime() - latest.createdAt.getTime() < 10 * 60000) return {cached: this.view(latest, evidence)};
      if (latest?.status === 'RUNNING' && now.getTime() - latest.createdAt.getTime() < ANALYSIS_RUNNING_LEASE_MS) throw new RecoveryError('An analysis is already in progress for this case', 409);
      if (latest && now.getTime() - latest.createdAt.getTime() < ANALYSIS_COOLDOWN_MS) throw new RecoveryError('Analysis request limit: wait 60 seconds between new analyses of a case.', 429);
      const resetWindow = now.getTime() - budget.windowStart.getTime() >= hour;
      if (!resetWindow && budget.requestCount >= ANALYSIS_HOURLY_LIMIT) throw new RecoveryError('Analysis request limit reached: 20 new analyses per merchant per hour.', 429);
      await tx.analysisBudget.update({where: {id: 'merchant'}, data: {windowStart: resetWindow ? now : budget.windowStart, requestCount: resetWindow ? 1 : budget.requestCount + 1}});
      const row = await tx.recoveryAnalysis.create({data: {
        recoveryCaseId: id, requestId, promptVersion: PROMPT_VERSION, requestedModel: model,
        evidenceFingerprint: fingerprint, evidenceJson: JSON.stringify(evidence), createdAt: now,
      }});
      await tx.auditEvent.create({data: {
        recoveryCaseId: id, eventType: 'AI_ANALYSIS_REQUESTED', actor,
        payload: JSON.stringify({promptVersion: PROMPT_VERSION, model, evidenceFingerprint: fingerprint}),
      }});
      return {row, evidence};
    });
    if (claim.cached) return claim.cached;
    const {row, evidence} = claim;
    let analysis: AnalystAnalysis, fallbackReason: FallbackReason | null = null;
    try {
      if (!model) throw new AnalystProviderError('INVALID_MODEL_CONFIG');
      if (!config.apiKey?.trim()) throw new AnalystProviderError('MISSING_CREDENTIALS');
      analysis = validateAnalysis(await this.provider.analyze(evidence, config), evidence);
    } catch (error) {
      fallbackReason = error instanceof AnalystProviderError ? error.reason : 'PROVIDER_FAILURE';
      analysis = validateAnalysis(deterministicAnalysis(evidence), evidence);
    }
    const source = fallbackReason ? 'DETERMINISTIC_FALLBACK' : 'GEMINI';
    return this.client.$transaction(async tx => {
      const completedAt = this.clock();
      const current = await this.evidence(tx, id, completedAt);
      const policy = validateProposal(analysis.proposedAction, current);
      if (!policy.messageDraftAllowed) analysis.customerMessageDraft = null;
      const saved = await tx.recoveryAnalysis.update({where: {id: row.id}, data: {
        status: 'COMPLETE', source, model: source === 'GEMINI' ? model : null,
        analysisJson: JSON.stringify(analysis), policyJson: JSON.stringify(policy), fallbackReason, completedAt,
      }});
      await tx.auditEvent.create({data: {
        recoveryCaseId: id, eventType: 'AI_ANALYSIS_COMPLETED', actor,
        payload: JSON.stringify({source, model: saved.model, requestedModel: model, promptVersion: PROMPT_VERSION, timestamp: completedAt.toISOString(), evidenceFingerprint: row.evidenceFingerprint, policyEvidenceFingerprint: evidenceFingerprint(current), policy, fallbackReason}),
      }});
      return this.view(saved, current);
    });
  }
}
