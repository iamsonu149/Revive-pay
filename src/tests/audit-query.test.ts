import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readdirSync, rmdirSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {auditPageHref, getAuditPage} from '../domain/audit/audit-query';
import {label} from '../lib/utils';

const directory = mkdtempSync(join(tmpdir(), 'revive-audit-tests-'));
const url = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
const client = new PrismaClient({datasources: {db: {url}}});
const caseId = 'case-reference-42';
const spacedCaseId = 'case reference 43';

beforeAll(async () => {
  writeFileSync(join(directory, 'test.db'), '');
  execFileSync(process.execPath, [
    resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy',
    '--schema', resolve('prisma/schema.prisma'),
  ], {env: {...process.env, DATABASE_URL: url}, stdio: 'pipe'});

  const customer = await client.customer.create({data: {
    name: 'Audit fixture', email: 'audit@example.com', phone: '000', riskBand: 'LOW',
  }});
  const subscription = await client.subscription.create({data: {
    customerId: customer.id, planName: 'Fixture', amount: 1000,
    status: 'PAST_DUE', nextBillingDate: new Date('2026-09-05T00:00:00Z'),
  }});
  for (const id of [caseId, spacedCaseId]) {
    const attempt = await client.paymentAttempt.create({data: {
      customerId: customer.id, subscriptionId: subscription.id, amount: 1000,
      status: 'FAILED', failureReason: 'BANK_TECHNICAL', attemptedAt: new Date('2026-09-01T00:00:00Z'),
      retryCount: 0, paymentMethodAgeDays: 10, recentSuccessfulPayments: 3,
      bankHealthScore: 80, customerEngagementScore: 80, contactCountLast7Days: 0,
    }});
    await client.recoveryCase.create({data: {
      id, paymentAttemptId: attempt.id, predictedRecoveryProbability: 80,
      recommendedAction: 'RETRY_LATER', reasonSummary: 'Fixture', evidence: '[]',
      requiresHumanApproval: false,
    }});
  }
  await client.auditEvent.createMany({data: [
    ...Array.from({length: 55}, (_, i) => ({
      id: `policy-${String(i).padStart(3, '0')}`, eventType: 'POLICY_REEVALUATED',
      actor: 'SYSTEM', payload: '{}', createdAt: new Date('2026-09-05T00:00:00Z'),
    })),
    {id: 'actor-space', eventType: 'APPROVED', actor: 'Case Reviewer', recoveryCaseId: caseId, payload: '{}'},
    {id: 'actor-underscore', eventType: 'APPROVED', actor: 'Case_Reviewer', payload: '{}'},
    {id: 'case-space', eventType: 'EXECUTED', actor: 'MERCHANT', recoveryCaseId: spacedCaseId, payload: '{}'},
  ]});
}, 30000);

afterAll(async () => {
  await client.$disconnect();
  for (const name of readdirSync(directory)) {
    if (/^test\.db(?:-journal|-wal|-shm)?$/.test(name)) unlinkSync(join(directory, name));
  }
  rmdirSync(directory);
});

describe('audit search with SQLite', () => {
  it('returns identical events for displayed names and raw event codes on every page', async () => {
    for (const page of ['1', '2']) {
      const raw = await getAuditPage(client, {q: 'POLICY_REEVALUATED', page});
      for (const q of ['Policy reevaluated', label('POLICY_REEVALUATED')]) {
        const displayed = await getAuditPage(client, {q, page});
        expect(displayed.events.map(e => e.id)).toEqual(raw.events.map(e => e.id));
        expect(displayed.total).toBe(raw.total);
        expect(displayed.pages).toBe(raw.pages);
      }
    }
  });

  it.each(['  pOlIcY rEeVaLuAtEd  ', '\tPoLiCy_ReEvAlUaTeD\n'])('ignores case and surrounding whitespace: %j', async q => {
    const result = await getAuditPage(client, {q});
    expect(result.total).toBe(55);
    expect(result.q).toBe(q.trim());
    expect(result.events.every(e => e.eventType === 'POLICY_REEVALUATED')).toBe(true);
  });

  it('preserves actor searches, including spaces and raw underscores', async () => {
    const spaced = await getAuditPage(client, {q: '  cAsE rEvIeWeR  '});
    expect(spaced.events.map(e => e.id)).toEqual(['actor-space']);
    const underscored = await getAuditPage(client, {q: 'case_reviewer'});
    // Preserve existing SQLite LIKE semantics for actor queries, including underscores.
    const existingActorMatches = await client.auditEvent.findMany({
      where: {actor: {contains: 'case_reviewer'}},
    });
    expect(underscored.events.map(e => e.id).sort()).toEqual(existingActorMatches.map(e => e.id).sort());
    expect(underscored.events.some(e => e.id === 'actor-underscore')).toBe(true);
  });

  it('preserves case-ID searches without replacing their spaces', async () => {
    const raw = await getAuditPage(client, {q: `  ${caseId.toUpperCase()}  `});
    expect(raw.events.map(e => e.id)).toEqual(['actor-space']);
    const spaced = await getAuditPage(client, {q: 'CASE REFERENCE 43'});
    expect(spaced.events.map(e => e.id)).toEqual(['case-space']);
  });

  it('keeps filtered totals and page boundaries consistent, with no duplicate rows', async () => {
    const first = await getAuditPage(client, {q: 'Policy reevaluated'});
    const second = await getAuditPage(client, {q: 'Policy reevaluated', page: '2'});
    expect(first).toMatchObject({total: 55, pages: 2, page: 1});
    expect(second).toMatchObject({total: 55, pages: 2, page: 2});
    expect(first.events).toHaveLength(50);
    expect(second.events).toHaveLength(5);
    expect(new Set([...first.events, ...second.events].map(e => e.id)).size).toBe(55);
    const clamped = await getAuditPage(client, {q: 'Policy reevaluated', page: '999'});
    expect(clamped.events).toEqual(second.events);
    expect(clamped.page).toBe(2);
  });

  it('retains and safely encodes the query in pagination links', () => {
    const q = 'Policy reevaluated & actor';
    const url = new URL(auditPageHref(q, 2), 'http://localhost');
    expect(url.pathname).toBe('/audit');
    expect(url.searchParams.get('q')).toBe(q);
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('starts a new search without a page parameter at page one', async () => {
    await getAuditPage(client, {q: 'Policy reevaluated', page: '2'});
    const nextSearch = await getAuditPage(client, {q: 'Case Reviewer'});
    expect(nextSearch).toMatchObject({page: 1, pages: 1, total: 1});
  });

  it('returns an empty first page for no matches, even with a stale page number', async () => {
    const result = await getAuditPage(client, {q: 'no such event', page: '2'});
    expect(result).toMatchObject({total: 0, pages: 1, page: 1, events: []});
  });

  it('treats a whitespace-only query as unfiltered', async () => {
    const result = await getAuditPage(client, {q: ' \t\n '});
    expect(result).toMatchObject({q: '', total: 58, pages: 2, page: 1});
  });
});
