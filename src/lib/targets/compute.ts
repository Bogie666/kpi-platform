/**
 * Pure daily-targets math — no DB, no network — so the calculation can be
 * unit-tested against known spreadsheet values.
 *
 * Core formula per division:
 *   remaining_budget  = monthly_budget − MTD completed revenue − scheduled
 *                       backlog (sold work on the books within this month)
 *   daily_target      = remaining_budget / remaining workdays (incl. today)
 *   jobs_needed_today = daily_target / trailing revenue-per-job-run
 *
 * Stable-frame rule: every input is taken as of start-of-business today —
 * MTD runs through *yesterday* and today's board keeps completed (done)
 * appointments — so the daily target holds still all day instead of sagging
 * as today's own production lands. Revenue invoiced today arrives separately
 * (`todayRevenueCents`) and reads as progress *against* the target, never as
 * a reduction *of* it.
 *
 * Backlog crediting is toggleable (`creditBacklog`, default on): backlog
 * isn't guaranteed revenue until invoiced, so the strict variant ignores it
 * to keep daily pressure up — useful when sold work makes departments coast.
 *
 * Key principle: revenue-per-job-run already has close rate baked in
 * (trailing completed revenue ÷ trailing completed jobs), so close rate and
 * avg ticket are diagnostics only — never separate terms in the formula.
 *
 * Maintenance/PSI/ESI volume is largely pre-scheduled, so the actionable
 * number is demand calls: today's scheduled maintenance revenue is credited
 * against the daily target and the remaining gap is divided by the trailing
 * demand revenue-per-call.
 */

export type SourceClass = 'maintenance' | 'demand' | 'install';

export interface TrailingSource {
  jobs: number;
  revenueCents: number;
  /** null when there were no completed jobs in the window. */
  revenuePerJobCents: number | null;
  /** 30 normally; 90 when the 30-day sample was under the floor. */
  windowDays: number;
  /** True when even the fallback window is under the sample floor. */
  lowSample: boolean;
}

export interface TodaySchedule {
  maintenance: number;
  demand: number;
  install: number;
  total: number;
}

/** Hour aggregates for one crew class (maintenance / demand / install BUs)
 *  within a division's capacity. */
export interface ClassCapacity {
  /** Unbooked tech-hours still ahead of now, today. */
  openHours: number;
  /** Total schedulable tech-hours still ahead of now, today. */
  totalHours: number;
  /** Whole-day figures (past windows included). */
  fullDayOpenHours: number;
  fullDayTotalHours: number;
}

/** Remaining-today dispatch capacity for a division (from ST Capacity API). */
export interface CapacityInput {
  /** Unbooked tech-hours still ahead of now, today. */
  openHours: number;
  /** Total schedulable tech-hours still ahead of now, today. */
  totalHours: number;
  /** Whole-day unbooked tech-hours (not filtered to "ahead of now"). */
  fullDayOpenHours?: number;
  /** Whole-day schedulable tech-hours — the day's physical envelope, used
   *  for month-level capacity planning. Optional for older cached payloads. */
  fullDayTotalHours?: number;
  /** The same hours split by crew class (from BU classification). Combined
   *  divisions like HVAC Maint/Service run separate maintenance and demand
   *  crews — the split keeps their capacities from masquerading as
   *  interchangeable. Optional for older cached payloads. */
  byClass?: Partial<Record<SourceClass, ClassCapacity>>;
  techsAvailable: number;
  techsTotal: number;
}

export interface CapacityInfo extends CapacityInput {
  /** Rough demand calls the open hours could absorb (openHours ÷ avg call hours). */
  callsCapacity: number;
  /** Rough calls a FULL day's schedulable hours could absorb — the per-day
   *  physical ceiling for month-level planning. Sum of the per-class
   *  ceilings when the crew split is known (maintenance runs are shorter
   *  than demand calls), else full-day hours at the demand-call figure.
   *  Null when full-day hours are unavailable. */
  dayCallsCapacity: number | null;
  /** Full-day maintenance-run ceiling: maint-crew hours ÷ MAINT_CALL_HOURS.
   *  Null when the division has no classified maintenance hours. */
  dayMaintCallsCapacity: number | null;
  /** Full-day demand-call ceiling: demand-crew hours ÷ DEMAND_CALL_HOURS.
   *  Null when the division has no classified demand hours. */
  dayDemandCallsCapacity: number | null;
  /** Full-day install/estimate-run ceiling (install-crew hours at the
   *  demand-call figure). Null when there are no classified install hours. */
  dayInstallCallsCapacity: number | null;
  /** Booked share of remaining schedulable hours, 0-1. Null when no hours. */
  utilization: number | null;
}

export interface DivisionInput {
  code: string;
  name: string;
  colorToken: string;
  monthlyBudgetCents: number;
  /** Completed revenue month-start → yesterday (stable all day). */
  mtdRevenueCents: number;
  /** Revenue invoiced today so far — progress toward today's target. */
  todayRevenueCents?: number;
  /** Sold-but-not-completed revenue scheduled within the current month. */
  backlogCents: number;
  trailing: {
    blended: TrailingSource;
    maintenance: TrailingSource | null;
    demand: TrailingSource | null;
    install: TrailingSource | null;
  };
  todaySchedule: TodaySchedule;
  /** Remaining-today dispatch capacity; null when the Capacity API is unavailable. */
  capacity?: CapacityInput | null;
  /** Caveats attached upstream (e.g. feeder-division merges) — surfaced
   *  alongside the flags this calculation produces. */
  extraFlags?: string[];
}

export interface CalendarContext {
  totalWorkdays: number;
  elapsedWorkdays: number;
  remainingWorkdays: number;
  isWorkdayToday: boolean;
}

export type PaceStatus = 'ahead' | 'on_pace' | 'behind' | 'no_budget';

export interface DailyTargetRow {
  code: string;
  name: string;
  colorToken: string;
  monthlyBudgetCents: number;
  /** Completed revenue month-start → yesterday (stable all day). */
  mtdRevenueCents: number;
  /** Revenue invoiced today so far — progress toward today's target. */
  todayRevenueCents: number;
  backlogCents: number;
  /** Can be negative when MTD (+ credited backlog) already exceeds budget. */
  remainingBudgetCents: number;
  /** Per-remaining-workday revenue needed; floored at 0. Holds still all
   *  day — compare `todayRevenueCents` against it for progress. */
  dailyTargetCents: number;
  /** Daily target minus today's invoiced revenue; floored at 0. */
  remainingTodayCents: number;
  /** Blended trailing revenue per completed job run. */
  revenuePerJobCents: number | null;
  /** dailyTarget / revenuePerJob, rounded up. null when no trailing rate. */
  jobsNeededToday: number | null;
  /** Scheduled maintenance/PSI/ESI appointments today. */
  maintScheduledToday: number;
  /** Revenue those maintenance runs should produce at trailing rates. */
  maintRevenueTodayCents: number;
  /** Daily target left after maintenance coverage; floored at 0. */
  gapCents: number;
  /** gap / trailing demand rev-per-call, rounded up. null when no rate. */
  demandCallsNeeded: number | null;
  /** Demand calls already on today's board. */
  demandCallsBooked: number;
  /** Demand calls still to book beyond today's board to cover the gap. */
  demandCallsShort: number | null;
  /** Remaining-today dispatch capacity enriched with calls math. Null when
   *  the Capacity API is unavailable for this run. */
  capacity: CapacityInfo | null;
  /** Of the calls short, how many the remaining open hours can absorb.
   *  Null when either side of the comparison is unknown. */
  callsBookable: number | null;
  /** Calls short beyond today's remaining capacity — needs overtime,
   *  borrowed techs, or tomorrow's board. Null when unknown. */
  callsBeyondCapacity: number | null;
  /** Best-case revenue today at trailing rates with every remaining open
   *  hour filled with demand calls: maint coverage + booked demand + open
   *  capacity. Null when the demand rate or capacity is unknown. */
  achievableRevenueTodayCents: number | null;
  /** Part of today's target that physically can't land today even with a
   *  full board (target − achievable, floored at 0). Null when unknown. */
  shortfallBeyondCapacityCents: number | null;
  /** How much each remaining future workday's target rises if today maxes
   *  out and the unreachable shortfall rolls forward. Null when unknown. */
  carryoverPerDayCents: number | null;
  /** Extra tech-hours (overtime / borrowed techs) needed to fully close
   *  today's shortfall beyond the open board. Null when unknown. */
  extraHoursToClose: number | null;
  /** MTD ÷ (budget × elapsed/total workdays). null before the first workday. */
  paceRatio: number | null;
  status: PaceStatus;
  flags: string[];
  trailing: DivisionInput['trailing'];
  todaySchedule: TodaySchedule;
}

/** Pace band: ahead ≥ 1.05 × expected-to-date, behind ≤ 0.95×. */
export const PACE_AHEAD = 1.05;
export const PACE_BEHIND = 0.95;

/**
 * Rough tech-hours a demand service call occupies (drive + diagnose + work).
 * Used only to translate open capacity hours into "calls we could still
 * absorb" — a planning heuristic, not billing math.
 */
export const DEMAND_CALL_HOURS = 2.5;

/**
 * Rough tech-hours a maintenance/tune-up run occupies. Shorter than a
 * demand call — mostly checklist work with no diagnose-and-sell arc. Same
 * caveat as DEMAND_CALL_HOURS: a planning heuristic, not billing math.
 */
export const MAINT_CALL_HOURS = 1.5;

function divCeil(numerator: number, denominator: number): number {
  return Math.ceil(numerator / denominator);
}

/** Whole-dollar formatting for flag text (flags are prose, not table cells). */
function fmtUsd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export interface ComputeOptions {
  /** Subtract scheduled in-month backlog from remaining budget. Default true. */
  creditBacklog?: boolean;
}

export function computeDailyTargets(
  divisions: DivisionInput[],
  cal: CalendarContext,
  opts: ComputeOptions = {},
): DailyTargetRow[] {
  const creditBacklog = opts.creditBacklog ?? true;
  // On a weekend/holiday there are no workdays "including today" — pace the
  // remaining budget over the workdays still ahead; if the month's workdays
  // are exhausted, everything left lands on a single synthetic day.
  const remainingDays = Math.max(cal.remainingWorkdays, 1);

  return divisions.map((d) => {
    const flags: string[] = [...(d.extraFlags ?? [])];
    const budget = d.monthlyBudgetCents;
    const todayRevenue = d.todayRevenueCents ?? 0;
    const remainingBudget =
      budget - d.mtdRevenueCents - (creditBacklog ? d.backlogCents : 0);
    const dailyTarget = Math.max(Math.round(remainingBudget / remainingDays), 0);
    const remainingToday = Math.max(dailyTarget - todayRevenue, 0);

    const blendedRate = d.trailing.blended.revenuePerJobCents;
    const jobsNeededToday =
      blendedRate != null && blendedRate > 0
        ? dailyTarget > 0
          ? divCeil(dailyTarget, blendedRate)
          : 0
        : null;

    const maintRate = d.trailing.maintenance?.revenuePerJobCents ?? null;
    const maintRevenueToday =
      maintRate != null ? d.todaySchedule.maintenance * maintRate : 0;
    const gap = Math.max(dailyTarget - maintRevenueToday, 0);

    const demandRate = d.trailing.demand?.revenuePerJobCents ?? blendedRate;
    const demandCallsNeeded =
      demandRate != null && demandRate > 0
        ? gap > 0
          ? divCeil(gap, demandRate)
          : 0
        : null;

    // Deficit vs the board: demand calls already booked today produce
    // revenue at the same trailing rate, so the shortfall is whatever gap
    // remains after crediting them.
    const demandCallsBooked = d.todaySchedule.demand;
    const demandCallsShort =
      demandRate != null && demandRate > 0
        ? Math.max(divCeil(Math.max(gap - demandCallsBooked * demandRate, 0), demandRate), 0)
        : null;

    // Capacity: translate the division's remaining open tech-hours into
    // demand calls it could still absorb, then split "calls short" into
    // bookable-today vs beyond-today's-board.
    let capacity: CapacityInfo | null = null;
    let callsBookable: number | null = null;
    let callsBeyondCapacity: number | null = null;
    let achievableRevenueToday: number | null = null;
    let shortfallBeyondCapacity: number | null = null;
    let carryoverPerDay: number | null = null;
    let extraHoursToClose: number | null = null;
    let callsOpenHours: number | null = null;
    if (d.capacity) {
      // Calls short is a demand-side metric, so only demand-crew hours can
      // absorb it. Install/sales divisions use install crew hours when no
      // demand crew exists. Never borrow maintenance capacity for demand.
      // Older cached payloads without a class split retain the aggregate
      // fallback until their versioned cache expires.
      const classSplit = d.capacity.byClass;
      const callClassCapacity = classSplit?.demand ?? classSplit?.install ?? null;
      callsOpenHours = classSplit
        ? (callClassCapacity?.openHours ?? 0)
        : d.capacity.openHours;
      const callsCapacity = Math.floor(callsOpenHours / DEMAND_CALL_HOURS);
      const fullDayTotal = d.capacity.fullDayTotalHours ?? null;
      const classDayCalls = (cls: SourceClass, hoursPerCall: number): number | null => {
        const h = d.capacity?.byClass?.[cls]?.fullDayTotalHours ?? 0;
        return h > 0 ? Math.floor(h / hoursPerCall) : null;
      };
      const dayMaintCallsCapacity = classDayCalls('maintenance', MAINT_CALL_HOURS);
      const dayDemandCallsCapacity = classDayCalls('demand', DEMAND_CALL_HOURS);
      const dayInstallCallsCapacity = classDayCalls('install', DEMAND_CALL_HOURS);
      const classCeilingSum =
        (dayMaintCallsCapacity ?? 0) +
        (dayDemandCallsCapacity ?? 0) +
        (dayInstallCallsCapacity ?? 0);
      const dayCallsCapacity =
        classCeilingSum > 0
          ? classCeilingSum
          : fullDayTotal != null && fullDayTotal > 0
            ? Math.floor(fullDayTotal / DEMAND_CALL_HOURS)
            : null;
      const utilization =
        d.capacity.totalHours > 0
          ? Math.min(
              Math.max(
                (d.capacity.totalHours - d.capacity.openHours) / d.capacity.totalHours,
                0,
              ),
              1,
            )
          : null;
      capacity = {
        ...d.capacity,
        callsCapacity,
        dayCallsCapacity,
        dayMaintCallsCapacity,
        dayDemandCallsCapacity,
        dayInstallCallsCapacity,
        utilization,
      };
      if (demandCallsShort != null && cal.isWorkdayToday) {
        callsBookable = Math.min(demandCallsShort, callsCapacity);
        callsBeyondCapacity = Math.max(demandCallsShort - callsCapacity, 0);
      }
      // Best case today: completed revenue plus every still-booked job and
      // every remaining demand slot, all at trailing rates. Only issue a
      // same-day capacity recommendation on a workday.
      if (cal.isWorkdayToday && demandRate != null && demandRate > 0) {
        achievableRevenueToday = Math.round(
          todayRevenue + maintRevenueToday + (demandCallsBooked + callsCapacity) * demandRate,
        );
        shortfallBeyondCapacity = Math.max(dailyTarget - achievableRevenueToday, 0);
        const futureWorkdays = Math.max(cal.remainingWorkdays - 1, 0);
        carryoverPerDay =
          futureWorkdays > 0 ? Math.round(shortfallBeyondCapacity / futureWorkdays) : null;
        const revenueCallsBeyond = divCeil(shortfallBeyondCapacity, demandRate);
        extraHoursToClose = revenueCallsBeyond * DEMAND_CALL_HOURS;
      }
    }

    // Pace status compares completed MTD revenue against where the budget
    // says we should be after the elapsed workdays. Backlog intentionally
    // doesn't count toward pace — only invoiced revenue does.
    const expectedToDate =
      cal.totalWorkdays > 0 ? budget * (cal.elapsedWorkdays / cal.totalWorkdays) : 0;
    const paceRatio = expectedToDate > 0 ? d.mtdRevenueCents / expectedToDate : null;

    let status: PaceStatus;
    if (budget <= 0) status = 'no_budget';
    else if (paceRatio == null) status = 'on_pace';
    else if (paceRatio >= PACE_AHEAD) status = 'ahead';
    else if (paceRatio <= PACE_BEHIND) status = 'behind';
    else status = 'on_pace';

    if (blendedRate == null) {
      flags.push('No trailing revenue-per-job — jobs needed unavailable');
    } else if (d.trailing.blended.lowSample) {
      flags.push(
        `Low sample: rev/job from ${d.trailing.blended.jobs} jobs over ${d.trailing.blended.windowDays} days`,
      );
    } else if (d.trailing.blended.windowDays > 30) {
      flags.push(`Thin 30-day sample — using ${d.trailing.blended.windowDays}-day rates`);
    }
    if (maintRate == null && d.todaySchedule.maintenance > 0) {
      flags.push(
        `${d.todaySchedule.maintenance} maintenance runs today not credited (no trailing maintenance rate)`,
      );
    }
    if (remainingBudget < 0 && budget > 0) {
      flags.push(
        creditBacklog
          ? 'Budget already covered by MTD revenue + scheduled backlog'
          : 'Budget already covered by MTD revenue',
      );
    }
    if (
      capacity != null &&
      (callsBeyondCapacity ?? 0) > 0 &&
      (shortfallBeyondCapacity ?? 0) > 0
    ) {
      const impact =
        carryoverPerDay != null && carryoverPerDay > 0
          ? ` — ~${fmtUsd(shortfallBeyondCapacity ?? 0)} of today's target can't land today and rolls forward (≈ +${fmtUsd(carryoverPerDay)}/day on remaining days) unless ~${extraHoursToClose}h of extra capacity is added`
          : ` — ~${fmtUsd(shortfallBeyondCapacity ?? 0)} of today's target can't land today unless ~${extraHoursToClose}h of extra capacity is added`;
      flags.push(
        `Only ${callsBookable} of ${demandCallsShort} calls short fit today's remaining capacity for demand (${(callsOpenHours ?? 0).toFixed(1)}h open)${impact}`,
      );
    }

    return {
      code: d.code,
      name: d.name,
      colorToken: d.colorToken,
      monthlyBudgetCents: budget,
      mtdRevenueCents: d.mtdRevenueCents,
      todayRevenueCents: todayRevenue,
      backlogCents: d.backlogCents,
      remainingBudgetCents: remainingBudget,
      dailyTargetCents: dailyTarget,
      remainingTodayCents: remainingToday,
      revenuePerJobCents: blendedRate,
      jobsNeededToday,
      maintScheduledToday: d.todaySchedule.maintenance,
      maintRevenueTodayCents: maintRevenueToday,
      gapCents: gap,
      demandCallsNeeded,
      demandCallsBooked,
      demandCallsShort,
      capacity,
      callsBookable,
      callsBeyondCapacity,
      achievableRevenueTodayCents: achievableRevenueToday,
      shortfallBeyondCapacityCents: shortfallBeyondCapacity,
      carryoverPerDayCents: carryoverPerDay,
      extraHoursToClose,
      paceRatio,
      status,
      flags,
      trailing: d.trailing,
      todaySchedule: d.todaySchedule,
    };
  });
}
