/**
 * GET /api/kpi/pipeline-revenue
 *
 * "Pipeline" = revenue committed via won estimates whose jobs are scheduled
 * but not yet completed. Surfaced on the Financial tab alongside actual
 * revenue: actual is what's already invoiced, pipeline is the next bucket
 * of expected revenue the team has on the books.
 *
 * Algorithm:
 *   1. Live-pull scheduled appointments for the next N days (default 30).
 *   2. Get unique jobIds → ST jobs endpoint for BU mapping.
 *   3. Look up won estimates for those jobIds in estimate_analysis.
 *   4. Sum estimate subtotals per division (via business_units → departments).
 *
 * Jobs without a won estimate (most service appointments) contribute $0 —
 * we only know value if it was pre-quoted. Acceptable scope for MVP; the
 * meaningful pipeline number is install-side anyway.
 *
 * Cached client-side for 2 min; ST calls dominate runtime (~5-10 sec).
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
  /** Window the pipeline covers (inclusive both ends, CT-local dates). */
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

/** Same TZ-aware UTC instant helper as upcoming-appointments. */
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

/**
 * Default window = today through EOM (CT-local). Lets the value combine
 * cleanly with MTD revenue to project month-end totals. Override via
 * `?endDate=YYYY-MM-DD` for ad-hoc queries (e.g. quarter-end forecast).
 */
function lastDayOfMonthISO(localToday: string): string {
  const [y, m] = localToday.split('-').map(Number);
  // JS month is 1-based here; new Date(y, m, 0) gives last day of month m.
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const today = await localTodayISO();
  const endDateParam = req.nextUrl.searchParams.get('endDate');
  // `endDate` is inclusive; convert to an exclusive "starts before" by
  // adding one day so an appointment scheduled at end-of-day on EOM is
  // included.
  const endDate = endDateParam ?? lastDayOfMonthISO(today);

  // Sanity bound: never look more than 365 days forward.
  const maxForwardMs = 365 * 86_400_000;
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(endMs) || endMs < todayMs) {
    // endDate < today — return empty pipeline rather than an error.
    return NextResponse.json({
      data: {
        asOf: new Date().toISOString(),
        windowStart: today,
        windowEnd: endDate,
        totalCents: 0,
        appointmentsConsidered: 0,
        jobsWithEstimate: 0,
        byDivision: {},
      } satisfies PipelineRevenueResponse,
    });
  }
  const clampedEnd =
    endMs - todayMs > maxForwardMs
      ? new Date(todayMs + maxForwardMs).toISOString().slice(0, 10)
      : endDate;
  // Number of days to add to `today` to reach the exclusive upper bound.
  const daysForward =
    Math.round((Date.parse(`${clampedEnd}T00:00:00Z`) - todayMs) / 86_400_000) + 1;

  // 1. Active scheduled appointments through the end of the window.
  const appts = await collectResource<StAppointment>({
    path: '/jpm/v2/tenant/{tenant}/appointments',
    query: {
      startsOnOrAfter: localDayStartUTC(today, 0),
      startsBefore: localDayStartUTC(today, daysForward),
    },
  });
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
        windowStart: today,
        windowEnd: clampedEnd,
        totalCents: 0,
        appointmentsConsidered: active.length,
        jobsWithEstimate: 0,
        byDivision: {},
      } satisfies PipelineRevenueResponse,
    });
  }

  // 2. Pull jobs (chunked) for businessUnitId.
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

  // 3. Look up the won-estimate rows by their estimateId. The jobs we
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

  if (req.nextUrl.searchParams.get('debug') === '1') {
    return NextResponse.json({
      debug: true,
      appointmentsConsidered: active.length,
      uniqueJobIds: jobIds.length,
      jobsWithCreatedFromEstimate: jobToEstimate.size,
      uniqueEstimateIds: estimateIds.length,
      sampleEstimateIds: estimateIds.slice(0, 10),
      wonRowsMatched: wonRows.length,
      wonByJobSize: wonByJob.size,
    });
  }

  // 4. Map BU → division code.
  const buRows = await database
    .select({ id: businessUnits.id, departmentCode: businessUnits.departmentCode })
    .from(businessUnits);
  const buToDept = new Map<number, string | null>();
  for (const r of buRows) buToDept.set(r.id, r.departmentCode);

  // 5. Roll up.
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
      windowStart: today,
      windowEnd: clampedEnd,
      totalCents,
      appointmentsConsidered: active.length,
      jobsWithEstimate,
      byDivision,
    } satisfies PipelineRevenueResponse,
  });
}
