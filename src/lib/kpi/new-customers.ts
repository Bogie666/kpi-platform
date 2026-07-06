/**
 * New-customers metric — customers whose record was created in a window AND
 * who had a completed job in the same window. Heavy: crawls ST customers +
 * completed jobs per window. Cached in kpi_cache so dashboard reads are
 * instant; a cron pre-warms common windows.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { kpiCache } from '@/db/schema';
import { collectResource } from '@/lib/sync/servicetitan/raw-client';
import { resolvePeriod, type Window } from '@/lib/period';
import { shiftISO } from '@/lib/time';

export interface NewCustomersResult {
  asOf: string;
  window: { from: string; to: string };
  value: number;
  ly: number;
  ly2: number;
}

interface StCustomer {
  id: number;
}
interface StJob {
  id: number;
  customerId?: number | null;
}

async function countNewCustomersIn(window: Window): Promise<number> {
  const afterIso = `${window.from}T00:00:00Z`;
  const beforeIso = `${shiftISO(window.to, 1)}T00:00:00Z`;

  const customers = await collectResource<StCustomer>({
    path: '/crm/v2/tenant/{tenant}/customers',
    query: { createdOnOrAfter: afterIso, createdBefore: beforeIso },
    pageSize: 500,
  });
  if (customers.length === 0) return 0;
  const newIds = new Set(customers.map((c) => c.id));

  const jobs = await collectResource<StJob>({
    path: '/jpm/v2/tenant/{tenant}/jobs',
    query: {
      completedOnOrAfter: afterIso,
      completedBefore: beforeIso,
      jobStatus: 'Completed',
    },
    pageSize: 500,
  });

  const served = new Set<number>();
  for (const j of jobs) {
    if (j.customerId != null && newIds.has(j.customerId)) served.add(j.customerId);
  }
  return served.size;
}

export interface PeriodArgs {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
}

/** Live compute across cur / LY / LY2 windows for a resolved period. */
export async function computeNewCustomers(args: PeriodArgs): Promise<NewCustomersResult> {
  const period = await resolvePeriod(args);
  const cur = await countNewCustomersIn(period.cur);
  const ly = await countNewCustomersIn(period.ly);
  const ly2 = await countNewCustomersIn(period.ly2);
  return {
    asOf: new Date().toISOString(),
    window: { from: period.cur.from, to: period.cur.to },
    value: cur,
    ly,
    ly2,
  };
}

/**
 * Cached read. Returns cached payload when fresh (< maxAgeMin), else
 * computes live, stores, and returns. With `force`, always recomputes
 * (used by the cron pre-warm). Cache key is the resolved current window,
 * so presets and custom from/to ranges are both handled correctly.
 */
export async function getNewCustomers(
  args: PeriodArgs,
  opts: { maxAgeMin?: number; force?: boolean } = {},
): Promise<NewCustomersResult & { cached: boolean }> {
  const period = await resolvePeriod(args);
  const key = `new-customers:${period.cur.from}:${period.cur.to}`;
  const maxAgeMin = opts.maxAgeMin ?? 180;

  if (!opts.force) {
    const rows = await db().select().from(kpiCache).where(eq(kpiCache.cacheKey, key)).limit(1);
    const row = rows[0];
    if (row) {
      const ageMin = (Date.now() - new Date(row.computedAt).getTime()) / 60_000;
      if (ageMin < maxAgeMin) {
        return { ...(row.payload as NewCustomersResult), cached: true };
      }
    }
  }

  const fresh = await computeNewCustomers(args);
  await db()
    .insert(kpiCache)
    .values({ cacheKey: key, payload: fresh, computedAt: new Date() })
    .onConflictDoUpdate({
      target: kpiCache.cacheKey,
      set: { payload: fresh, computedAt: new Date() },
    });
  return { ...fresh, cached: false };
}
