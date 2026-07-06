/**
 * Daily jobs-needed targets — "what does each division have to run today to
 * stay on pace for its monthly revenue budget?"
 *
 * Inputs per division:
 *   - Monthly budget: `targets` rows (metric=revenue, scope=department),
 *     prorated by day-overlap with the current month so quarterly/annual
 *     rows still contribute sensibly.
 *   - MTD completed revenue: `financial_daily` summed month-start → today.
 *   - Scheduled backlog: won estimates attached to jobs with active
 *     appointments today → month-end (same join as /api/kpi/pipeline-revenue:
 *     job.createdFromEstimateId → estimate_analysis 'won' rows). Backlog
 *     scheduled past month-end is intentionally excluded.
 *   - Trailing rev/job: `financial_daily` at BU grain over the last 30 full
 *     days, split into maintenance / demand / install source classes by BU
 *     name. Falls back to 90 days when the 30-day sample is thin.
 *   - Today's schedule: live ST appointments classified by job-type name.
 *
 * The heavy ST crawl (appointments + jobs + job types) is shared between the
 * backlog and today-schedule outputs and the whole payload is memoized in
 * kpi_cache, so dashboard reads are instant after the first morning hit.
 */
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  businessUnits,
  departments,
  estimateAnalysis,
  financialDaily,
  kpiCache,
  targets,
} from '@/db/schema';
import { collectResource } from '@/lib/sync/servicetitan/raw-client';
import { fetchTodayCapacity, type DeptCapacityAgg } from '@/lib/sync/servicetitan/capacity';
import { getBusinessTz, localDayStartUTC, localTodayISO, shiftISO } from '@/lib/time';
import { isMergedAwayDivision, mergeDivisionCode, divisionDisplayName } from '@/lib/divisions';
import { loadDivisionModel } from '@/lib/config-service';
import { monthCalendarContext, type MonthCalendarContext } from '@/lib/targets/calendar';
import {
  computeDailyTargets,
  type DailyTargetRow,
  type DivisionInput,
  type SourceClass,
  type TrailingSource,
} from '@/lib/targets/compute';

export interface DailyTargetsTotals {
  budgetCents: number;
  mtdCents: number;
  backlogCents: number;
  remainingBudgetCents: number;
  dailyTargetCents: number;
  jobsScheduledToday: number;
}

/** Company-wide remaining capacity today (from ST Dispatch Capacity API). */
export interface DailyTargetsCapacityTotals {
  openHours: number;
  totalHours: number;
  techsAvailable: number;
  techsTotal: number;
  /** Booked share of remaining schedulable hours, 0-1. Null when no hours. */
  utilization: number | null;
}

export interface DailyTargetsResult {
  asOf: string;
  /** Business-local date the targets are for. */
  date: string;
  calendar: MonthCalendarContext;
  /** Default view: scheduled in-month backlog credited against budget. */
  totals: DailyTargetsTotals;
  /** Null when the Capacity API is unavailable (missing Dispatch scope). */
  capacityTotals: DailyTargetsCapacityTotals | null;
  divisions: DailyTargetRow[];
  /** Strict variant: backlog ignored (it isn't revenue until invoiced). */
  withoutBacklog: {
    totals: DailyTargetsTotals;
    divisions: DailyTargetRow[];
  };
}

/** Below this many trailing-30 jobs we widen the window to 90 days. */
const MIN_SAMPLE_JOBS = 8;

/**
 * The Sales division runs estimate appointments for every trade, but the
 * sold install's revenue, budget, and backlog live in the per-trade install
 * divisions. Sales is folded into those divisions by classifying each
 * estimate run's trade: BU-name routes win (Commercial Sales books
 * commercial installs), then job-type-name routes (e.g. "Estimate -
 * Plumbing - NCE"), else the default HVAC install. Each install division's
 * demand rate becomes ITS trailing completed revenue ÷ ITS trade's trailing
 * estimate runs, so "calls short" reads as estimate runs still to book.
 * Sales' own (tiny) MTD/backlog/budget land on the default target.
 */
const SALES_FEEDER = {
  from: 'sales',
  defaultInto: 'hvac_equipment_install',
  buRoutes: [{ test: /commercial/i, into: 'commercial_hvac_install' }],
  typeRoutes: [
    // Plumbing install is merged into the single Plumbing division, so its
    // estimate runs route there.
    { test: /plumb/i, into: 'plumbing_maint_service' },
    { test: /electr/i, into: 'electrical_maint_service' },
  ],
};

/**
 * Division merges (plumbing_install → plumbing_maint_service, electrical
 * install → electrical service, …) applied at query time, with one
 * exception: `sales` keeps its identity through the warehouse reads because
 * the SALES_FEEDER fold below splits its estimate runs by trade before the
 * final merge.
 */
function canonicalDept(code: string | null | undefined): string | null {
  if (!code) return null;
  return code === SALES_FEEDER.from ? code : mergeDivisionCode(code);
}

function feederTargetFor(jobTypeName: string, buName: string): string {
  for (const r of SALES_FEEDER.buRoutes) if (r.test.test(buName)) return r.into;
  for (const r of SALES_FEEDER.typeRoutes) if (r.test.test(jobTypeName)) return r.into;
  return SALES_FEEDER.defaultInto;
}

/**
 * Source class from a BU name. The tenant names maintenance and install/
 * sales BUs explicitly (e.g. "LEX Maintenance", "LEX Sales"); everything
 * else is demand service.
 */
function classifyBuName(name: string): SourceClass {
  const n = name.toLowerCase();
  if (/maint/.test(n)) return 'maintenance';
  if (/install|sales|replace/.test(n)) return 'install';
  return 'demand';
}

/**
 * Source class from a job-type name. Maintenance covers the pre-scheduled
 * tune-up style visits (HVAC maintenance, PSI plumbing inspections, ESI
 * electrical inspections); install covers replacements and sales/estimate
 * runs; the rest is demand service.
 */
function classifyJobType(name: string): SourceClass {
  const n = name.toLowerCase();
  if (/maint|tune|psi|esi|inspect|club|filter/.test(n)) return 'maintenance';
  if (/install|replace|change\s?-?out|sales|estimate|quote|consult/.test(n)) return 'install';
  return 'demand';
}

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
  jobTypeId?: number | null;
  createdFromEstimateId?: number | null;
}

interface StJobType {
  id: number;
  name?: string | null;
}

/** Completed feeder (Sales) job — used to count trailing estimate runs. */
interface StCompletedJob {
  id: number;
  businessUnitId?: number | null;
  jobTypeId?: number | null;
  completedOn?: string | null;
}

function emptySource(windowDays: number): TrailingSource {
  return { jobs: 0, revenueCents: 0, revenuePerJobCents: null, windowDays, lowSample: true };
}

function toSource(
  jobs: number,
  revenueCents: number,
  windowDays: number,
): TrailingSource {
  return {
    jobs,
    revenueCents,
    revenuePerJobCents: jobs > 0 ? Math.round(revenueCents / jobs) : null,
    windowDays,
    lowSample: jobs < MIN_SAMPLE_JOBS,
  };
}

/** Prefer the 30-day window; widen to 90 when its sample is thin. */
function pickWindow(t30: TrailingSource, t90: TrailingSource): TrailingSource {
  if (t30.jobs >= MIN_SAMPLE_JOBS) return t30;
  if (t90.jobs > t30.jobs) return t90;
  return t30;
}

async function computeDailyTargetsLive(todayIso: string): Promise<DailyTargetsResult> {
  const tz = await getBusinessTz();
  const database = db();
  const cal = monthCalendarContext(todayIso);

  // ── Warehouse reads (parallel) ──────────────────────────────────────────
  const t30From = shiftISO(todayIso, -30);
  const t90From = shiftISO(todayIso, -90);
  const yesterday = shiftISO(todayIso, -1);

  const trailingByBu = (from: string) =>
    database
      .select({
        businessUnitId: financialDaily.businessUnitId,
        departmentCode: financialDaily.departmentCode,
        revenueCents: sql<number>`COALESCE(SUM(${financialDaily.totalRevenueCents}), 0)`,
        jobs: sql<number>`COALESCE(SUM(${financialDaily.jobs}), 0)`,
      })
      .from(financialDaily)
      .where(and(gte(financialDaily.reportDate, from), lte(financialDaily.reportDate, yesterday)))
      .groupBy(financialDaily.businessUnitId, financialDaily.departmentCode);

  const [deptList, buList, budgetRows, mtdRows, t30Rows, t90Rows] = await Promise.all([
    database
      .select()
      .from(departments)
      .where(eq(departments.active, true))
      .orderBy(departments.sortOrder),
    database
      .select({
        id: businessUnits.id,
        name: businessUnits.name,
        departmentCode: businessUnits.departmentCode,
      })
      .from(businessUnits),
    database
      .select()
      .from(targets)
      .where(
        and(
          eq(targets.metric, 'revenue'),
          eq(targets.scope, 'department'),
          lte(targets.effectiveFrom, cal.monthEnd),
          gte(targets.effectiveTo, cal.monthStart),
        ),
      ),
    database
      .select({
        departmentCode: financialDaily.departmentCode,
        revenueCents: sql<number>`COALESCE(SUM(${financialDaily.totalRevenueCents}), 0)`,
      })
      .from(financialDaily)
      .where(
        and(
          gte(financialDaily.reportDate, cal.monthStart),
          lte(financialDaily.reportDate, todayIso),
        ),
      )
      .groupBy(financialDaily.departmentCode),
    trailingByBu(t30From),
    trailingByBu(t90From),
  ]);

  // Budgets per division, prorated by overlap with the current month.
  const dayMs = 86_400_000;
  const spanDays = (from: string, to: string) =>
    Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1;
  const budgetByDept = new Map<string, number>();
  for (const t of budgetRows) {
    const code = canonicalDept(t.scopeValue) ?? '';
    const total = spanDays(t.effectiveFrom, t.effectiveTo);
    if (total <= 0) continue;
    const from = t.effectiveFrom > cal.monthStart ? t.effectiveFrom : cal.monthStart;
    const to = t.effectiveTo < cal.monthEnd ? t.effectiveTo : cal.monthEnd;
    const overlap = from <= to ? spanDays(from, to) : 0;
    budgetByDept.set(
      code,
      (budgetByDept.get(code) ?? 0) + Number(t.targetValue) * (overlap / total),
    );
  }

  const mtdByDept = new Map<string, number>();
  for (const r of mtdRows) {
    const code = canonicalDept(r.departmentCode);
    if (!code) continue;
    mtdByDept.set(code, (mtdByDept.get(code) ?? 0) + Number(r.revenueCents));
  }

  // Trailing aggregates: blended per division (every row, including legacy
  // null-BU rows) and per source class (BU-classified rows only).
  type Agg = { jobs: number; revenueCents: number };
  const buClass = new Map<number, SourceClass>();
  const buDept = new Map<number, string | null>();
  const buName = new Map<number, string>();
  for (const b of buList) {
    buClass.set(b.id, classifyBuName(b.name));
    buDept.set(b.id, canonicalDept(b.departmentCode));
    buName.set(b.id, b.name);
  }

  const aggregate = (rows: typeof t30Rows) => {
    const blended = new Map<string, Agg>();
    const bySource = new Map<string, Agg>(); // key: `${dept}|${class}`
    for (const r of rows) {
      const jobs = Number(r.jobs);
      const revenue = Number(r.revenueCents);
      const dept =
        r.businessUnitId != null
          ? buDept.get(r.businessUnitId) ?? canonicalDept(r.departmentCode)
          : canonicalDept(r.departmentCode);
      if (!dept) continue;
      const b = blended.get(dept) ?? { jobs: 0, revenueCents: 0 };
      b.jobs += jobs;
      b.revenueCents += revenue;
      blended.set(dept, b);
      if (r.businessUnitId != null) {
        const cls = buClass.get(r.businessUnitId) ?? 'demand';
        const key = `${dept}|${cls}`;
        const s = bySource.get(key) ?? { jobs: 0, revenueCents: 0 };
        s.jobs += jobs;
        s.revenueCents += revenue;
        bySource.set(key, s);
      }
    }
    return { blended, bySource };
  };
  const t30 = aggregate(t30Rows);
  const t90 = aggregate(t90Rows);

  const trailingFor = (dept: string, cls: SourceClass | null): TrailingSource => {
    const pick = (m: { blended: Map<string, Agg>; bySource: Map<string, Agg> }, days: number) => {
      const agg = cls == null ? m.blended.get(dept) : m.bySource.get(`${dept}|${cls}`);
      return agg ? toSource(agg.jobs, agg.revenueCents, days) : emptySource(days);
    };
    return pickWindow(pick(t30, 30), pick(t90, 90));
  };

  // ── ServiceTitan crawl: appointments today → month end, plus the Sales
  // division's trailing completed jobs (estimate runs, ~150/month) so each
  // trade's run volume can be counted from job-type names. ──────────────
  const salesBuIds = buList
    .filter((b) => b.departmentCode === SALES_FEEDER.from)
    .map((b) => b.id);
  const daysForward = spanDays(todayIso, cal.monthEnd);
  const [appts, feederCompleted, capacitySnapshot] = await Promise.all([
    collectResource<StAppointment>({
      path: '/jpm/v2/tenant/{tenant}/appointments',
      query: {
        startsOnOrAfter: localDayStartUTC(todayIso, 0, tz),
        startsBefore: localDayStartUTC(todayIso, daysForward, tz),
      },
    }),
    salesBuIds.length > 0
      ? collectResource<StCompletedJob>({
          path: '/jpm/v2/tenant/{tenant}/jobs',
          query: {
            jobStatus: 'Completed',
            completedOnOrAfter: `${t90From}T00:00:00Z`,
            completedBefore: `${todayIso}T00:00:00Z`,
            // ST filters by BU server-side; we re-filter client-side below
            // in case the param is ignored on this endpoint version.
            businessUnitIds: salesBuIds.join(','),
          },
          pageSize: 500,
        })
      : Promise.resolve([] as StCompletedJob[]),
    fetchTodayCapacity({
      dayStartUtc: localDayStartUTC(todayIso, 0, tz),
      dayEndUtc: localDayStartUTC(todayIso, 1, tz),
      // Sales rows get folded into the HVAC install division below, so its
      // BUs' capacity should land there too.
      buToDept: new Map(
        Array.from(buDept, ([id, dept]) => [
          id,
          dept === SALES_FEEDER.from ? SALES_FEEDER.defaultInto : dept,
        ]),
      ),
    }),
  ]);
  const active = appts.filter((a) => {
    if (a.active === false || a.unused === true) return false;
    const status = (a.status ?? '').toLowerCase();
    return status !== 'canceled' && status !== 'done';
  });

  const jobIds = Array.from(
    new Set(active.map((a) => a.jobId).filter((id): id is number => id != null)),
  );
  const jobById = new Map<number, StJob>();
  const CHUNK = 50;
  for (let i = 0; i < jobIds.length; i += CHUNK) {
    const chunk = jobIds.slice(i, i + CHUNK);
    const page = await collectResource<StJob>({
      path: '/jpm/v2/tenant/{tenant}/jobs',
      query: { ids: chunk.join(',') },
      pageSize: Math.max(chunk.length + 10, 50),
    });
    for (const j of page) jobById.set(j.id, j);
  }

  // Job-type dimension (~82 rows) — needed for both today's schedule and
  // the feeder trade classification, so always fetch.
  const jobTypes = await collectResource<StJobType>({
    path: '/jpm/v2/tenant/{tenant}/job-types',
    query: {},
  });
  const typeNames = new Map<number, string>();
  for (const t of jobTypes) typeNames.set(t.id, (t.name ?? '').trim());

  // Trailing estimate runs per target install division, 30- and 90-day.
  const feederRuns30 = new Map<string, number>();
  const feederRuns90 = new Map<string, number>();
  const salesBuIdSet = new Set(salesBuIds);
  for (const j of feederCompleted) {
    if (j.businessUnitId == null || !salesBuIdSet.has(j.businessUnitId)) continue;
    const completed = (j.completedOn ?? '').slice(0, 10);
    if (!completed || completed >= todayIso) continue;
    const typeName = j.jobTypeId != null ? typeNames.get(j.jobTypeId) ?? '' : '';
    const target = feederTargetFor(typeName, buName.get(j.businessUnitId) ?? '');
    feederRuns90.set(target, (feederRuns90.get(target) ?? 0) + 1);
    if (completed >= t30From) feederRuns30.set(target, (feederRuns30.get(target) ?? 0) + 1);
  }

  // Backlog: won-estimate revenue on scheduled-in-month jobs, per division.
  const jobToEstimate = new Map<number, number>();
  for (const j of jobById.values()) {
    if (j.createdFromEstimateId != null) jobToEstimate.set(j.id, j.createdFromEstimateId);
  }
  const estimateIds = Array.from(new Set(jobToEstimate.values()));
  const wonByEstimate = new Map<string, number>();
  if (estimateIds.length > 0) {
    const wonRows = await database
      .select({
        estimateId: estimateAnalysis.estimateId,
        subtotalCents: estimateAnalysis.subtotalCents,
      })
      .from(estimateAnalysis)
      .where(
        and(
          eq(estimateAnalysis.opportunityStatus, 'won'),
          inArray(estimateAnalysis.estimateId, estimateIds.map(String)),
        ),
      );
    for (const r of wonRows) {
      const cents = Number(r.subtotalCents);
      if (cents > 0) wonByEstimate.set(r.estimateId, cents);
    }
  }
  const backlogByDept = new Map<string, number>();
  for (const [jobId, estId] of jobToEstimate) {
    const cents = wonByEstimate.get(String(estId));
    if (!cents) continue;
    const buId = jobById.get(jobId)?.businessUnitId;
    const dept = buId != null ? buDept.get(buId) : null;
    if (!dept) continue;
    backlogByDept.set(dept, (backlogByDept.get(dept) ?? 0) + cents);
  }

  // Today's schedule per division, classified by job-type name. De-dup on
  // jobId so a multi-appointment job counts as one run.
  const ctDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayJobIds = new Set<number>();
  for (const a of active) {
    if (!a.jobId || !a.start) continue;
    if (ctDay.format(new Date(a.start)) === todayIso) todayJobIds.add(a.jobId);
  }
  const scheduleByDept = new Map<
    string,
    { maintenance: number; demand: number; install: number; total: number }
  >();
  /** Sales estimate runs booked today, keyed by target install division. */
  const feederRunsToday = new Map<string, number>();
  let jobsScheduledToday = 0;
  for (const jobId of todayJobIds) {
    const job = jobById.get(jobId);
    if (!job) continue;
    const dept = job.businessUnitId != null ? buDept.get(job.businessUnitId) : null;
    if (!dept) continue;
    const typeName = job.jobTypeId != null ? typeNames.get(job.jobTypeId) ?? '' : '';
    if (dept === SALES_FEEDER.from) {
      const target = feederTargetFor(
        typeName,
        job.businessUnitId != null ? buName.get(job.businessUnitId) ?? '' : '',
      );
      feederRunsToday.set(target, (feederRunsToday.get(target) ?? 0) + 1);
      jobsScheduledToday += 1;
      continue; // counted as a run on its target division, not a sales job
    }
    // Fall back to the BU's class when the job type is unnamed/unknown.
    const cls = typeName
      ? classifyJobType(typeName)
      : job.businessUnitId != null
        ? buClass.get(job.businessUnitId) ?? 'demand'
        : 'demand';
    const s = scheduleByDept.get(dept) ?? { maintenance: 0, demand: 0, install: 0, total: 0 };
    s[cls] += 1;
    s.total += 1;
    scheduleByDept.set(dept, s);
    jobsScheduledToday += 1;
  }

  // ── Assemble + compute ──────────────────────────────────────────────────
  // Merged-away divisions (plumbing_install, electrical_install, …) don't
  // render as rows — their revenue/budget/backlog already rolled into the
  // surviving division via canonicalDept above.
  const allInputs: DivisionInput[] = deptList
    .filter((d) => !isMergedAwayDivision(d.code))
    .map((d) => ({
      code: d.code,
      name: divisionDisplayName(d.code, d.name),
      colorToken: d.colorToken,
      monthlyBudgetCents: Math.round(budgetByDept.get(d.code) ?? 0),
      mtdRevenueCents: mtdByDept.get(d.code) ?? 0,
      backlogCents: backlogByDept.get(d.code) ?? 0,
      trailing: {
        blended: trailingFor(d.code, null),
        maintenance: trailingFor(d.code, 'maintenance'),
        demand: trailingFor(d.code, 'demand'),
        install: trailingFor(d.code, 'install'),
      },
      todaySchedule:
        scheduleByDept.get(d.code) ?? { maintenance: 0, demand: 0, install: 0, total: 0 },
      capacity: capacitySnapshot?.byDept.get(d.code) ?? null,
    }));

  // Per-source rows with zero data render as "—"; null them for clarity.
  for (const i of allInputs) {
    if (i.trailing.maintenance?.jobs === 0) i.trailing.maintenance = null;
    if (i.trailing.demand?.jobs === 0) i.trailing.demand = null;
    if (i.trailing.install?.jobs === 0) i.trailing.install = null;
  }

  // Fold Sales into the install divisions where its revenue lands, one
  // trade at a time. Each target's demand economics become: its own
  // trailing completed revenue ÷ its trade's trailing estimate runs.
  const fromIdx = allInputs.findIndex((i) => i.code === SALES_FEEDER.from);
  if (fromIdx >= 0) {
    const from = allInputs[fromIdx];
    const targets = new Set<string>([
      SALES_FEEDER.defaultInto,
      ...feederRuns90.keys(),
      ...feederRunsToday.keys(),
    ]);
    for (const code of targets) {
      const into = allInputs.find((i) => i.code === code);
      if (!into) continue;
      const r30 = feederRuns30.get(code) ?? 0;
      const r90 = feederRuns90.get(code) ?? 0;
      const windowDays = r30 >= MIN_SAMPLE_JOBS || r90 <= r30 ? 30 : 90;
      const runs = windowDays === 30 ? r30 : r90;
      const intoAgg = (windowDays === 30 ? t30 : t90).blended.get(code);
      const revenueCents = Number(intoAgg?.revenueCents ?? 0);
      const ratePerRun = runs > 0 && revenueCents > 0 ? Math.round(revenueCents / runs) : null;
      const booked = feederRunsToday.get(code) ?? 0;

      // Sales' own (small) budget/MTD/backlog can't be split by trade from
      // the warehouse — they ride on the default target. The display name
      // ("HVAC - Sales") already reflects the merge via divisions.ts.
      if (code === SALES_FEEDER.defaultInto) {
        into.monthlyBudgetCents += from.monthlyBudgetCents;
        into.mtdRevenueCents += from.mtdRevenueCents;
        into.backlogCents += from.backlogCents;
      }
      into.todaySchedule = {
        ...into.todaySchedule,
        demand: into.todaySchedule.demand + booked,
        total: into.todaySchedule.total + booked,
      };
      into.trailing.demand = {
        jobs: runs,
        revenueCents,
        revenuePerJobCents: ratePerRun,
        windowDays,
        lowSample: runs < MIN_SAMPLE_JOBS,
      };
      into.extraFlags = [
        ...(into.extraFlags ?? []),
        ratePerRun != null
          ? `Calls here are Sales estimate runs for this trade — ${runs} runs/${windowDays}d at trailing $/run from this division's revenue`
          : 'Calls here are Sales estimate runs for this trade — no run history yet, so calls-needed is unavailable',
      ];
    }
    allInputs.splice(fromIdx, 1);
  }

  // Quiet divisions with no budget and no revenue stay out of the table.
  const inputs = allInputs.filter((d) => d.monthlyBudgetCents > 0 || d.mtdRevenueCents > 0);

  const totalsFor = (rows: DailyTargetRow[]) =>
    rows.reduce(
      (acc, r) => {
        acc.budgetCents += r.monthlyBudgetCents;
        acc.mtdCents += r.mtdRevenueCents;
        acc.backlogCents += r.backlogCents;
        acc.remainingBudgetCents += r.remainingBudgetCents;
        acc.dailyTargetCents += r.dailyTargetCents;
        return acc;
      },
      {
        budgetCents: 0,
        mtdCents: 0,
        backlogCents: 0,
        remainingBudgetCents: 0,
        dailyTargetCents: 0,
        jobsScheduledToday,
      },
    );

  const rows = computeDailyTargets(inputs, cal);
  const strictRows = computeDailyTargets(inputs, cal, { creditBacklog: false });

  const capacityTotals: DailyTargetsCapacityTotals | null = capacitySnapshot
    ? {
        openHours: capacitySnapshot.total.openHours,
        totalHours: capacitySnapshot.total.totalHours,
        techsAvailable: capacitySnapshot.total.techsAvailable,
        techsTotal: capacitySnapshot.total.techsTotal,
        utilization:
          capacitySnapshot.total.totalHours > 0
            ? Math.min(
                Math.max(
                  (capacitySnapshot.total.totalHours - capacitySnapshot.total.openHours) /
                    capacitySnapshot.total.totalHours,
                  0,
                ),
                1,
              )
            : null,
      }
    : null;

  return {
    asOf: new Date().toISOString(),
    date: todayIso,
    calendar: cal,
    totals: totalsFor(rows),
    capacityTotals,
    divisions: rows,
    withoutBacklog: {
      totals: totalsFor(strictRows),
      divisions: strictRows,
    },
  };
}

/**
 * Bump whenever DailyTargetsResult's shape changes. The kpi_cache memo
 * outlives deploys, so without a versioned key a fresh deploy can serve an
 * old-shape payload (missing fields render as dashes) until the TTL expires.
 */
const PAYLOAD_VERSION = 7;

/**
 * Cached read. Returns the memoized payload when fresh (< maxAgeMin), else
 * computes live, stores, and returns. `force` always recomputes.
 */
export async function getDailyTargets(
  opts: { maxAgeMin?: number; force?: boolean } = {},
): Promise<DailyTargetsResult & { cached: boolean }> {
  await loadDivisionModel();
  const todayIso = await localTodayISO();
  const key = `daily-targets:v${PAYLOAD_VERSION}:${todayIso}`;
  const maxAgeMin = opts.maxAgeMin ?? 30;

  if (!opts.force) {
    const rows = await db().select().from(kpiCache).where(eq(kpiCache.cacheKey, key)).limit(1);
    const row = rows[0];
    if (row) {
      const ageMin = (Date.now() - new Date(row.computedAt).getTime()) / 60_000;
      if (ageMin < maxAgeMin) {
        return { ...(row.payload as DailyTargetsResult), cached: true };
      }
    }
  }

  const fresh = await computeDailyTargetsLive(todayIso);
  await db()
    .insert(kpiCache)
    .values({ cacheKey: key, payload: fresh, computedAt: new Date() })
    .onConflictDoUpdate({
      target: kpiCache.cacheKey,
      set: { payload: fresh, computedAt: new Date() },
    });
  return { ...fresh, cached: false };
}
