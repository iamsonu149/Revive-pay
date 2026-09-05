import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readdirSync, rmdirSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {AnalystService} from '../domain/analyst/analyst-service';
import {AnalystAnalysis, AnalystProviderError} from '../domain/analyst/analysis';
import {AnalystProvider, GeminiConfig} from '../integrations/gemini/gemini-analyst';
import {getAnalyst, postAnalyst} from '../lib/analyst-api';

const directory = mkdtempSync(join(tmpdir(), 'revive-analyst-tests-'));
const url = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
const client = new PrismaClient({datasources: {db: {url}}});
const valid: AnalystAnalysis = {
  diagnosis: 'A technical cause is plausible from the failure signal; a credential problem remains unconfirmed.',
  evidenceRefs: ['failureReason', 'bankHealthScore'], proposedAction: 'SEND_PAYMENT_UPDATE_LINK',
  actionRationale: 'A merchant may consider requesting a credential review after investigating the decline details.',
  uncertainties: ['The exact decline code is not available.'], escalationReason: 'Review the difference from the saved action.',
  customerMessageDraft: 'Hello [customer], please review your payment method for [amount] if you wish to continue: [secure payment update link].',
};
let now: Date;
let config: GeminiConfig;
let generate: ReturnType<typeof vi.fn<AnalystProvider['analyze']>>;
let service: AnalystService;
let sequence = 0;
async function fixture() {
  const customer = await client.customer.create({data: {name: 'Private Customer', email: `private${sequence++}@example.com`, phone: '+919876543210', riskBand: 'LOW'}});
  const subscription = await client.subscription.create({data: {customerId: customer.id, planName: 'Private Plan', amount: 2500, status: 'PAST_DUE', nextBillingDate: now}});
  const payment = await client.paymentAttempt.create({data: {
    customerId: customer.id, subscriptionId: subscription.id, amount: 2500, status: 'FAILED',
    failureReason: 'BANK_TECHNICAL', attemptedAt: new Date(now.getTime() - 48 * 3600000),
    retryCount: 0, paymentMethodAgeDays: 100, recentSuccessfulPayments: 6, bankHealthScore: 90,
    customerEngagementScore: 80, contactCountLast7Days: 0,
  }});
  const c = await client.recoveryCase.create({data: {
    paymentAttemptId: payment.id, predictedRecoveryProbability: 80, recommendedAction: 'RETRY_LATER',
    reasonSummary: 'Saved explanation', evidence: '[]', requiresHumanApproval: false,
    scheduledFor: new Date(now.getTime() - 3600000),
  }});
  return {c, customer, subscription, payment};
}

beforeAll(() => {
  writeFileSync(join(directory, 'test.db'), '');
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {env: {...process.env, DATABASE_URL: url}, stdio: 'pipe'});
}, 30000);
beforeEach(async () => {
  await client.recoveryAnalysis.deleteMany(); await client.analysisBudget.deleteMany(); await client.auditEvent.deleteMany();
  await client.contactEvent.deleteMany(); await client.recoveryExecution.deleteMany(); await client.recoveryCase.deleteMany();
  await client.paymentAttempt.deleteMany(); await client.subscription.deleteMany(); await client.customer.deleteMany();
  await client.setting.upsert({where: {id: 'merchant'}, update: {killSwitch: false, maxContacts: 2, autoRecoveryLimit: 10000}, create: {id: 'merchant'}});
  now = new Date('2026-09-05T12:00:00Z');
  config = {apiKey: 'secret-test-key', model: 'gemini-3.8-flash'};
  generate = vi.fn<AnalystProvider['analyze']>().mockImplementation(async () => structuredClone(valid));
  service = new AnalystService(client, {analyze: generate}, () => config, () => now);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await client.$disconnect();
  for (const name of readdirSync(directory)) if (/^test\.db(?:-journal|-wal|-shm)?$/.test(name)) unlinkSync(join(directory, name));
  rmdirSync(directory);
});

describe('persisted advisory analysis', () => {
  it('persists validated Gemini analysis with sanitized metadata and audit events', async () => {
    const {c, customer, payment} = await fixture();
    const result = await service.analyze(c.id, randomUUID(), 'merchant');
    expect(result).toMatchObject({source: 'GEMINI', sourceLabel: 'Gemini analysis', model: 'gemini-3.8-flash', stale: false, fallbackReason: null});
    expect(result.policy).toMatchObject({status: 'RESTRICTED', differsFromSavedAction: true});
    const row = await client.recoveryAnalysis.findFirstOrThrow();
    expect(row.status).toBe('COMPLETE');expect(row.policyJson).toBeTruthy();expect(row.promptVersion).toBe('recovery-analyst-v1');
    expect(row.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect((await client.auditEvent.findMany()).map(e => e.eventType).sort()).toEqual(['AI_ANALYSIS_COMPLETED', 'AI_ANALYSIS_REQUESTED']);
    const input = JSON.stringify(generate.mock.calls[0][0]);
    const metadata = (await client.auditEvent.findMany()).map(e => e.payload).join(' ');
    for (const secret of [customer.name, customer.email, customer.phone, customer.id, payment.id, c.id, 'secret-test-key']) {
      expect(input).not.toContain(secret);expect(row.evidenceJson).not.toContain(secret);expect(metadata).not.toContain(secret);
    }
  });
  it('cannot approve, execute, alter settings, or consume retry/contact counters', async () => {
    const {c, payment} = await fixture();
    const beforeSettings = await client.setting.findUniqueOrThrow({where: {id: 'merchant'}});
    await service.analyze(c.id, randomUUID(), 'merchant');
    expect(await client.recoveryCase.findUniqueOrThrow({where: {id: c.id}})).toEqual(c);
    expect(await client.paymentAttempt.findUniqueOrThrow({where: {id: payment.id}})).toEqual(payment);
    expect(await client.setting.findUniqueOrThrow({where: {id: 'merchant'}})).toEqual(beforeSettings);
    expect(await client.recoveryExecution.count()).toBe(0);expect(await client.contactEvent.count()).toBe(0);expect(await client.mockProviderOperation.count()).toBe(0);
  });
  it('loads metadata without calling Gemini or creating an analysis', async () => {
    const {c} = await fixture();expect((await service.latest(c.id)).analysis).toBeNull();
    expect(generate).not.toHaveBeenCalled();expect(await client.recoveryAnalysis.count()).toBe(0);
  });
  it('provides an accurately labeled fallback without credentials', async () => {
    config = {};const {c} = await fixture();
    const result = await service.analyze(c.id, randomUUID(), 'merchant');
    expect(result).toMatchObject({source: 'DETERMINISTIC_FALLBACK', sourceLabel: 'Deterministic fallback', model: null, fallbackReason: 'MISSING_CREDENTIALS'});
    expect(generate).not.toHaveBeenCalled();
    expect((await service.latest(c.id)).analysis?.sourceLabel).toBe('Deterministic fallback');
  });
  it.each(['TIMEOUT', 'RATE_LIMIT', 'INVALID_RESPONSE', 'PROVIDER_FAILURE'] as const)('persists fallback for %s without raw provider errors', async reason => {
    generate.mockRejectedValue(new AnalystProviderError(reason));const {c} = await fixture();
    const result = await service.analyze(c.id, randomUUID(), 'merchant');
    expect(result).toMatchObject({source: 'DETERMINISTIC_FALLBACK', model: null, fallbackReason: reason});
    expect((await client.recoveryAnalysis.findFirstOrThrow()).source).toBe('DETERMINISTIC_FALLBACK');
  });
  it('revalidates provider objects and refuses unsupported actions', async () => {
    generate.mockResolvedValue({...valid, proposedAction: 'EXECUTE_NOW'} as unknown as AnalystAnalysis);
    const {c} = await fixture();const result = await service.analyze(c.id, randomUUID(), 'merchant');
    expect(result.fallbackReason).toBe('INVALID_RESPONSE');
    expect(await client.recoveryExecution.count()).toBe(0);
  });
  it('rejects unsafe proposals without sending or exposing an outreach draft', async () => {
    const {c, subscription} = await fixture();
    await client.subscription.update({where: {id: subscription.id}, data: {status: 'CANCELLED'}});
    const result = await service.analyze(c.id, randomUUID(), 'merchant');
    expect(result.source).toBe('GEMINI');expect(result.policy.status).toBe('REJECTED');
    expect(result.analysis.customerMessageDraft).toBeNull();expect(await client.contactEvent.count()).toBe(0);
  });
  it('rechecks policy when evidence changes during the Gemini request', async () => {
    const {c, subscription} = await fixture();
    generate.mockImplementationOnce(async () => {
      await client.subscription.update({where: {id: subscription.id}, data: {status: 'CANCELLED'}});
      return structuredClone(valid);
    });
    const result = await service.analyze(c.id, randomUUID(), 'merchant');
    expect(result.stale).toBe(true);expect(result.policy.status).toBe('REJECTED');expect(result.analysis.customerMessageDraft).toBeNull();
  });
  it.each(['amount', 'contacts', 'status', 'policy'] as const)('marks saved analysis stale when %s changes', async change => {
    const {c, payment, customer} = await fixture();await service.analyze(c.id, randomUUID(), 'merchant');
    if (change === 'amount') await client.paymentAttempt.update({where: {id: payment.id}, data: {amount: 15000}});
    if (change === 'contacts') await client.contactEvent.create({data: {customerId: customer.id, reservationKey: 'new-contact', createdAt: now}});
    if (change === 'status') await client.paymentAttempt.update({where: {id: payment.id}, data: {status: 'REFUNDED'}});
    if (change === 'policy') await client.setting.update({where: {id: 'merchant'}, data: {killSwitch: true}});
    const latest = await service.latest(c.id);
    expect(latest.analysis?.stale).toBe(true);expect(generate).toHaveBeenCalledTimes(1);
    if (change === 'status' || change === 'policy') {expect(latest.analysis?.policy.status).toBe('REJECTED');expect(latest.analysis?.analysis.customerMessageDraft).toBeNull();}
  });
  it('detects time-dependent contact expiry without making a new model call', async () => {
    const {c, customer} = await fixture();
    await client.contactEvent.create({data: {customerId: customer.id, reservationKey: 'expiring', createdAt: new Date(now.getTime() - 7 * 86400000 + 1000)}});
    await service.analyze(c.id, randomUUID(), 'merchant');now = new Date(now.getTime() + 2000);
    expect((await service.latest(c.id)).analysis?.stale).toBe(true);expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('analysis request admission and endpoint protection', () => {
  it('deduplicates retries and reuses fresh matching Gemini snapshots', async () => {
    const {c} = await fixture();const requestId = randomUUID();
    const first = await service.analyze(c.id, requestId, 'merchant');
    expect(await service.analyze(c.id, requestId, 'merchant')).toEqual(first);
    expect(await service.analyze(c.id, randomUUID(), 'merchant')).toEqual(first);
    expect(generate).toHaveBeenCalledTimes(1);expect(await client.recoveryAnalysis.count()).toBe(1);
  });
  it('prevents concurrent model requests for a case', async () => {
    const {c} = await fixture();let started!: () => void;let release!: (value: AnalystAnalysis) => void;
    const invoked = new Promise<void>(resolve => {started = resolve;});
    const result = new Promise<AnalystAnalysis>(resolve => {release = resolve;});
    generate.mockImplementationOnce(() => {started();return result;});
    const first = service.analyze(c.id, randomUUID(), 'merchant');await invoked;
    try {await expect(service.analyze(c.id, randomUUID(), 'merchant')).rejects.toMatchObject({status: 409});}
    finally {release(structuredClone(valid));await first;}
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('enforces the per-case cooldown including failed provider attempts', async () => {
    const {c} = await fixture();generate.mockRejectedValue(new AnalystProviderError('RATE_LIMIT'));
    await service.analyze(c.id, randomUUID(), 'merchant');
    await expect(service.analyze(c.id, randomUUID(), 'merchant')).rejects.toMatchObject({status: 429});
    expect(generate).toHaveBeenCalledTimes(1);
    now = new Date(now.getTime() + 60001);await service.analyze(c.id, randomUUID(), 'merchant');expect(generate).toHaveBeenCalledTimes(2);
  });
  it('enforces the persistent merchant-wide hourly request cap', async () => {
    const {c} = await fixture();await client.analysisBudget.create({data: {id: 'merchant', windowStart: now, requestCount: 20}});
    await expect(service.analyze(c.id, randomUUID(), 'merchant')).rejects.toMatchObject({status: 429});
    expect(generate).not.toHaveBeenCalled();
    now = new Date(now.getTime() + 3600001);await service.analyze(c.id, randomUUID(), 'merchant');expect(generate).toHaveBeenCalledTimes(1);
  });
  it('rejects reused request IDs across cases', async () => {
    const first = await fixture(), second = await fixture(), requestId = randomUUID();
    await service.analyze(first.c.id, requestId, 'merchant');
    await expect(service.analyze(second.c.id, requestId, 'merchant')).rejects.toMatchObject({status: 409});
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('authenticates GET and POST inside the endpoint independently of middleware', async () => {
    const {c} = await fixture();const request = new Request('http://localhost/api/analysis', {method: 'POST', body: JSON.stringify({requestId: randomUUID()})});
    expect((await postAnalyst(request, c.id, service)).status).toBe(401);
    expect((await getAnalyst(new Request('http://localhost/api/analysis'), c.id, service)).status).toBe(401);
    expect(generate).not.toHaveBeenCalled();expect(await client.analysisBudget.count()).toBe(0);
  });
  it('rejects cross-origin requests, injected evidence and oversized bodies', async () => {
    vi.stubEnv('MERCHANT_USER', 'merchant');vi.stubEnv('MERCHANT_PASSWORD', 'test-password-long-enough');
    const {c} = await fixture();
    const headers = {authorization: `Basic ${btoa('merchant:test-password-long-enough')}`, 'Content-Type': 'application/json'};
    const external = new Request('http://localhost/api/analysis', {method: 'POST', headers: {...headers, origin: 'https://attacker.example'}, body: JSON.stringify({requestId: randomUUID()})});
    expect((await postAnalyst(external, c.id, service)).status).toBe(403);
    for (const body of [JSON.stringify({requestId: randomUUID(), evidence: {killSwitchEnabled: false}}), 'x'.repeat(1025), JSON.stringify({requestId: 'not-a-uuid'})]) {
      expect((await postAnalyst(new Request('http://localhost/api/analysis', {method: 'POST', headers, body}), c.id, service)).status).toBe(422);
    }
    expect(generate).not.toHaveBeenCalled();
  });
  it('returns a rate-limit response through the authenticated endpoint', async () => {
    vi.stubEnv('MERCHANT_USER', 'merchant');vi.stubEnv('MERCHANT_PASSWORD', 'test-password-long-enough');
    const {c} = await fixture();await client.analysisBudget.create({data: {id: 'merchant', windowStart: now, requestCount: 20}});
    const r = await postAnalyst(new Request('http://localhost/api/analysis', {method: 'POST', headers: {authorization: `Basic ${btoa('merchant:test-password-long-enough')}`}, body: JSON.stringify({requestId: randomUUID()})}), c.id, service);
    expect(r.status).toBe(429);expect(generate).not.toHaveBeenCalled();
  });
});
