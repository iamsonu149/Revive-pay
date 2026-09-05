import {Prisma, PrismaClient} from '@prisma/client';

export const AUDIT_PAGE_SIZE = 50;
export type AuditSearchParams = {q?: string; page?: string};

export function auditSearchWhere(query: string): Prisma.AuditEventWhereInput {
  const q = query.trim();
  if (!q) return {};

  // label() displays event-code underscores as spaces. Normalize only that field.
  // SQLite's contains/LIKE matching is case-insensitive for these ASCII codes.
  const eventCode = q.replace(/\s+/g, '_');
  return {
    OR: [
      {eventType: {contains: q}},
      {eventType: {contains: eventCode}},
      {actor: {contains: q}},
      {recoveryCaseId: {contains: q}},
    ],
  };
}

export function auditPageHref(q: string, page: number) {
  return `/audit?${new URLSearchParams({q, page: String(page)})}`;
}

export async function getAuditPage(client: PrismaClient, searchParams: AuditSearchParams) {
  const q = searchParams.q?.trim() ?? '';
  const where = auditSearchWhere(q);

  // Count and rows use the same filter and database snapshot.
  return client.$transaction(async tx => {
    const total = await tx.auditEvent.count({where});
    const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
    const raw = Number(searchParams.page ?? 1);
    const page = Number.isInteger(raw) ? Math.min(pages, Math.max(1, raw)) : 1;
    const events = await tx.auditEvent.findMany({
      where,
      include: {recoveryCase: {include: {paymentAttempt: {include: {customer: true}}}}},
      orderBy: [{createdAt: 'desc'}, {id: 'desc'}],
      take: AUDIT_PAGE_SIZE,
      skip: (page - 1) * AUDIT_PAGE_SIZE,
    });
    return {q, total, pages, page, events};
  });
}
