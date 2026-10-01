import { and, eq, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { kpiCache, membershipDaily } from '@/db/schema';
import { getBusinessTz } from '@/lib/time';
import { buildMembershipHealth, eventsInWindow, localDate, type StMembership, type StMembershipType } from '@/lib/membership-health';
import { fetchResourcePage, type ResourceQueryArgs } from './raw-client';
import { startSyncRun, finishSyncRunSuccess, finishSyncRunError, type SyncTrigger } from '@/lib/sync/runs';

export const MEMBERSHIPS_SOURCE = 'st_memberships';
export interface MembershipsSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  typesLoaded: number;
  membershipsFetched: number;
  tiersWritten: number;
  totalActive: number;
  totalNewThisMonth: number;
  totalCanceledThisMonth: number;
}

/** Fail closed on malformed/truncated pagination, before replacing any snapshot. */
export async function collectCompleteMembershipResource<T>(args: ResourceQueryArgs): Promise<T[]> {
  const records: T[] = [];
  for (let page = 1; ; page++) {
    const response = await fetchResourcePage<T>({ ...args, page, pageSize: 500 });
    if (!Array.isArray(response.data) || typeof response.hasMore !== 'boolean' || response.page !== page) {
      throw new Error(`Invalid membership pagination at page ${page}`);
    }
    records.push(...response.data);
    if (!response.hasMore) {
      if (typeof response.totalCount === 'number' && response.totalCount !== records.length) {
        throw new Error(`Incomplete membership fetch: expected ${response.totalCount}, received ${records.length}`);
      }
      return records;
    }
    if (response.data.length === 0) throw new Error(`Empty membership page ${page} with hasMore=true`);
  }
}

export async function syncMemberships(trigger: SyncTrigger): Promise<MembershipsSyncResult> {
  const timezone = await getBusinessTz();
  const today = localDate(new Date(), timezone);
  const start = await startSyncRun({ source: MEMBERSHIPS_SOURCE, trigger, reportId: 'memberships', windowStart: today, windowEnd: today });
  if (start.status === 'skipped') return { runId: null, skipped: start.reason, typesLoaded: 0, membershipsFetched: 0, tiersWritten: 0, totalActive: 0, totalNewThisMonth: 0, totalCanceledThisMonth: 0 };
  const runId = start.runId;
  try {
    const types = await collectCompleteMembershipResource<StMembershipType>({ path: '/memberships/v2/tenant/{tenant}/membership-types', query: { active: 'Any' } });
    const memberships = await collectCompleteMembershipResource<StMembership>({ path: '/memberships/v2/tenant/{tenant}/memberships' });
    const database = db();
    const existing = await database.selectDistinct({ name: membershipDaily.membershipName }).from(membershipDaily).where(ne(membershipDaily.sourceReportId, 'seed'));
    const health = buildMembershipHealth(memberships, types, existing.map((row) => row.name), today, timezone);
    const monthStart = `${today.slice(0, 7)}-01`;
    const month = eventsInWindow(health, monthStart, today)!;
    const rows = health.plans.map((plan): typeof membershipDaily.$inferInsert => {
      const events = eventsInWindow({ snapshotDate: today, events: plan.events }, monthStart, today)!;
      return { membershipName: plan.name, reportDate: today, activeEnd: plan.active, newSales: events.starts, canceled: events.cancellations, netChange: events.starts - events.cancellations - events.expirations, priceCents: null, sourceReportId: MEMBERSHIPS_SOURCE };
    });
    const cacheWrite = database.insert(kpiCache).values({ cacheKey: `membership_health:${today}`, payload: health, computedAt: new Date(health.fetchedAt) }).onConflictDoUpdate({ target: kpiCache.cacheKey, set: { payload: health, computedAt: new Date(health.fetchedAt) } });
    const cleanup = database.delete(membershipDaily).where(or(eq(membershipDaily.sourceReportId, 'seed'), and(eq(membershipDaily.sourceReportId, MEMBERSHIPS_SOURCE), eq(membershipDaily.reportDate, today))));
    const inserts = [];
    for (let i = 0; i < rows.length; i += 500) {
      inserts.push(database.insert(membershipDaily).values(rows.slice(i, i + 500)).onConflictDoUpdate({
        target: [membershipDaily.membershipName, membershipDaily.reportDate],
        set: { activeEnd: sql`excluded.active_end`, newSales: sql`excluded.new_sales`, canceled: sql`excluded.canceled`, netChange: sql`excluded.net_change`, priceCents: null, sourceReportId: MEMBERSHIPS_SOURCE, syncedAt: new Date() },
      }));
    }
    // Neon HTTP callback transactions are unsupported. batch uses a single
    // non-interactive transaction: missing cache schema rolls back all writes.
    await database.batch([cacheWrite, cleanup, ...inserts]);
    await finishSyncRunSuccess(runId, { rowsFetched: memberships.length, rowsUpserted: rows.length });
    return { runId, typesLoaded: types.length, membershipsFetched: memberships.length, tiersWritten: rows.length, totalActive: health.active, totalNewThisMonth: month.starts, totalCanceledThisMonth: month.cancellations };
  } catch (error) {
    await finishSyncRunError(runId, error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error));
    throw error;
  }
}
