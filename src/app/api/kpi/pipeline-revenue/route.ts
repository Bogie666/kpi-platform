/**
 * GET /api/kpi/pipeline-revenue
 *
 * "Pipeline" = revenue committed via WON (i.e. sold) estimates whose jobs are
 * scheduled but NOT yet completed, dated within the selected budget period.
 * Surfaced on the Financial tab alongside actual revenue: actual is what's
 * already invoiced (completed), pipeline is the sold-but-not-yet-completed
 * work we still plan to finish inside the same budget period. Because the two
 * buckets are disjoint (completed vs. not-completed), actual + pipeline is a
 * clean month/quarter/year-end projection with no double counting.
 *
 * Window (2B): the SELECTED period extended to its budget-period end.
 *   - mtd / today / rolling  → 1st of month → last day of month
 *   - qtd                    → 1st of quarter → last day of quarter
 *   - ytd                    → Jan 1 → Dec 31
 *   - last_month             → that whole month
 *   - explicit from/to       → used verbatim
 * We then keep only appointments that are NOT done and NOT canceled — the
 * uncompleted sold work we still plan to complete in the period. This spans
 * past-but-outstanding jobs plus everything scheduled through period end.
 *
 * Dollars (1A): WON estimates only. Jobs without a won estimate contribute $0
 * — we only book value that was actually sold/quoted. Un-quoted service calls
 * are intentionally excluded so the number reflects committed sold revenue.
 *
 * Algorithm:
 *   1. Live-pull scheduled appointments across the budget window.
 *   2. Filter to active + not done/canceled → uncompleted work.
 *   3. Unique jobIds → ST jobs endpoint for BU mapping + createdFromEstimateId.
 *   4. Look up WON estimates for those estimateIds in estimate_analysis.
 *   5. Sum estimate subtotals per division (via business_units → departments).
 *
 * Cached client-side; ST calls dominate runtime (~5-10 sec).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { businessUnits, estimateAnalysis } from '@/db/schema';
import { collectResource } from '@/lib/sync/servicetitan/raw-client';
import { localTodayISO } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface StAppointment {
  id: number;
  jobId?: number | null;
  start?: string;
  status?: string;
  active?: boolean;
  unused?: boolean;
}

interface StJob {
  id: number;
  businessUnitId?: number | null;
  /** ST's back-reference: install jobs carry the estimateId that created
   *  them. Lets us join to estimate_analysis without needing the parent
   *  diagnostic job (which is what estimate_analysis.jobId stores). */
  createdFromEstimateId?: number | null;
}

export interface PipelineRevenueResponse {
  asOf: string;
  /** Budget window the pipeline covers (inclusive both ends, CT-local dates). */
  windowStart: string;
  windowEnd: string;
  /** Total expected pipeline revenue across all divisions, in cents. */
  totalCents: number;
  /** Count of scheduled appointments looked at. */
  appointmentsConsidered: number;
  /** Count of jobs with a won estimate (i.e. counted in totalCents). */
  jobsWithEstimate: number;
  /** Per-division breakdown in cents. Missing divisions = $0 pipeline. */
  byDivision: Record<string, number>;
}

/** TZ-aware UTC instant for the local-Chicago start of `localDay` (+addDays). */
function localDayStartUTC(localDay: string, addDays = 0): string {
  const [y, m, d] = localDay.split('-').map(Number);
  const naive = new Date(Date.UTC(y, m - 1, d + addDays, 0, 0, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    hour12: false,
  });
  const localHour = Number(fmt.format(naive));
  const offsetHours = (24 - localHour) % 24;
  return new Date(naive.getTime() + offsetHours * 3_600_000).toISOString();
}

/** Last day (1-based month) as a YYYY-MM-DD string. */
function eom(y: number, m1: number): string {
  const last = new Date(Date.UTC(y, m1, 0)).getUTCDate();
  return `${y}-${String(m1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}
function som(y: number, m1: number): string {
  return `${y}-${String(m1).padStart(2, '0')}-01`;
}

/**
 * The SELECTED period extended to its budget-period end. Explicit from/to
 * win verbatim; otherwise the preset maps to its enclosing calendar month /
 * quarter / year. Rolling presets (l7/l30/l90/ttm) fall back to the current
 * month — they aren't budget-pacing views, but a month-end pipeline is the
 * sensible default there.
 */
function budgetWindow(
  preset: string | null,
  from: string | null,
  to: string | null,
  today: string,
): { start: string; end: string } {
  if (from && to) return { start: from, end: to };
  const [y, m] = today.split('-').map(Number);
  switch (preset ?? 'mtd') {
    case 'ytd':
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    case 'qtd': {
      const q = Math.floor((m - 1) / 3); // 0..3
      const qStartMonth = q * 3 + 1;
      const qEndMonth = qStartMonth + 2;
      return { start: som(y, qStartMonth), end: eom(y, qEndMonth) };
    }
    case 'last_month': {
      const pm = m === 1 ? 12 : m - 1;
      const py = m === 1 ? y - 1 : y;
      return { start: som(py, pm), end: eom(py, pm) };
    }
    case 'mtd':
    case 'today':
    case 'l7':
    case 'l30':
    case 'l90':
    case 'ttm':
    default:
      return { start: som(y, m), end: eom(y, m) };
  }
}

export async function GET(req: NextRequest) {
  const today = await localTodayISO();
  const params = req.nextUrl.searchParams;
  const { start: windowStart, end: windowEnd } = budgetWindow(
    params.get('preset'),
    params.get('from'),
    params.get('to'),
    today,
  );

  const startMs = Date.parse(`${windowStart}T00:00:00Z`);
  const endMs = Date.parse(`${windowEnd}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return NextResponse.json({
      data: {
        asOf: new Date().toISOString(),
        windowStart,
        windowEnd,
        totalCents: 0,
        appointmentsConsidered: 0,
        jobsWithEstimate: 0,
        byDivision: {},
      } satisfies PipelineRevenueResponse,
    });
  }
  // Exclusive upper bound = day after windowEnd (so an appointment at
  // end-of-day on the last day is included).
  const daysSpan =
    Math.round((endMs - startMs) / 86_400_000) + 1;

  // 1. Active scheduled appointments across the budget window.
  const appts = await collectResource<StAppointment>({
    path: '/jpm/v2/tenant/{tenant}/appointments',
    query: {
      startsOnOrAfter: localDayStartUTC(windowStart, 0),
      startsBefore: localDayStartUTC(windowStart, daysSpan),
    },
  });
  // 2. Keep only uncompleted work: drop canceled/done/inactive/unused.
  const active = appts.filter((a) => {
    if (a.active === false || a.unused === true) return false;
    const status = (a.status ?? '').toLowerCase();
    return status !== 'canceled' && status !== 'done';
  });
  const jobIds = Array.from(
    new Set(active.map((a) => a.jobId).filter((id): id is number => id != null)),
  );

  if (jobIds.length === 0) {
    return NextResponse.json({
      data: {
        asOf: new Date().toISOString(),
        windowStart,
        windowEnd,
        totalCents: 0,
        appointmentsConsidered: active.length,
        jobsWithEstimate: 0,
        byDivision: {},
      } satisfies PipelineRevenueResponse,
    });
  }

  // 3. Pull jobs (chunked) for businessUnitId + createdFromEstimateId.
  const jobs: StJob[] = [];
  const CHUNK = 50;
  for (let i = 0; i < jobIds.length; i += CHUNK) {
    const chunk = jobIds.slice(i, i + CHUNK);
    const page = await collectResource<StJob>({
      path: '/jpm/v2/tenant/{tenant}/jobs',
      query: { ids: chunk.join(',') },
      pageSize: Math.max(chunk.length + 10, 50),
    });
    for (const j of page) jobs.push(j);
  }
  const jobBu = new Map<number, number | null>();
  const jobToEstimate = new Map<number, number>();
  for (const j of jobs) {
    jobBu.set(j.id, j.businessUnitId ?? null);
    if (j.createdFromEstimateId != null) jobToEstimate.set(j.id, j.createdFromEstimateId);
  }
  const estimateIds = Array.from(new Set(jobToEstimate.values()));

  // 4. Look up the WON-estimate rows by their estimateId. The jobs we
  // scheduled-pull have createdFromEstimateId pointing at the estimate
  // that triggered the install — NOT at the diagnostic job whose id
  // estimate_analysis.jobId stores. Joining via estimateId sidesteps
  // the parent/child job dance entirely.
  const database = db();
  let wonRows: Array<{ estimateId: string; subtotalCents: number | null }> = [];
  if (estimateIds.length > 0) {
    wonRows = await database
      .select({
        estimateId: estimateAnalysis.estimateId,
        subtotalCents: estimateAnalysis.subtotalCents,
      })
      .from(estimateAnalysis)
      .where(
        and(
          eq(estimateAnalysis.opportunityStatus, 'won'),
          inArray(
            estimateAnalysis.estimateId,
            estimateIds.map((n) => String(n)),
          ),
        ),
      );
  }
  const wonByEstimate = new Map<string, number>();
  for (const r of wonRows) {
    const cents = Number(r.subtotalCents);
    if (cents <= 0) continue;
    wonByEstimate.set(r.estimateId, cents);
  }

  // Map each scheduled job → its won estimate $ (if any).
  const wonByJob = new Map<number, number>();
  for (const [jobId, estId] of jobToEstimate) {
    const cents = wonByEstimate.get(String(estId));
    if (cents && cents > 0) wonByJob.set(jobId, cents);
  }

  if (params.get('debug') === '1') {
    return NextResponse.json({
      debug: true,
      windowStart,
      windowEnd,
      appointmentsConsidered: active.length,
      uniqueJobIds: jobIds.length,
      jobsWithCreatedFromEstimate: jobToEstimate.size,
      uniqueEstimateIds: estimateIds.length,
      sampleEstimateIds: estimateIds.slice(0, 10),
      wonRowsMatched: wonRows.length,
      wonByJobSize: wonByJob.size,
    });
  }

  // 5. Map BU → division code, then roll up.
  const buRows = await database
    .select({ id: businessUnits.id, departmentCode: businessUnits.departmentCode })
    .from(businessUnits);
  const buToDept = new Map<number, string | null>();
  for (const r of buRows) buToDept.set(r.id, r.departmentCode);

  let totalCents = 0;
  let jobsWithEstimate = 0;
  const byDivision: Record<string, number> = {};
  for (const [jobId, cents] of wonByJob) {
    const buId = jobBu.get(jobId);
    if (buId == null) continue;
    const dept = buToDept.get(buId);
    if (!dept) continue;
    totalCents += cents;
    jobsWithEstimate += 1;
    byDivision[dept] = (byDivision[dept] ?? 0) + cents;
  }

  return NextResponse.json({
    data: {
      asOf: new Date().toISOString(),
      windowStart,
      windowEnd,
      totalCents,
      appointmentsConsidered: active.length,
      jobsWithEstimate,
      byDivision,
    } satisfies PipelineRevenueResponse,
  });
}
