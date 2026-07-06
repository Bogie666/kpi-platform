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

/** Remaining-today dispatch capacity for a division (from ST Capacity API). */
export interface CapacityInput {
  /** Unbooked tech-hours still ahead of now, today. */
  openHours: number;
  /** Total schedulable tech-hours still ahead of now, today. */
  totalHours: number;
  techsAvailable: number;
  techsTotal: number;
}

export interface CapacityInfo extends CapacityInput {
  /** Rough demand calls the open hours could absorb (openHours ÷ avg call hours). */
  callsCapacity: number;
  /** Booked share of remaining schedulable hours, 0-1. Null when no hours. */
  utilization: number | null;
}

export interface DivisionInput {
  code: string;
  name: string;
  colorToken: string;
  monthlyBudgetCents: number;
  mtdRevenueCents: number;
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
  mtdRevenueCents: number;
  backlogCents: number;
  /** Can be negative when MTD (+ credited backlog) already exceeds budget. */
  remainingBudgetCents: number;
  /** Per-remaining-workday revenue needed; floored at 0. */
  dailyTargetCents: number;
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

function divCeil(numerator: number, denominator: number): number {
  return Math.ceil(numerator / denominator);
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
    const remainingBudget =
      budget - d.mtdRevenueCents - (creditBacklog ? d.backlogCents : 0);
    const dailyTarget = Math.max(Math.round(remainingBudget / remainingDays), 0);

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
    if (d.capacity) {
      const callsCapacity = Math.floor(d.capacity.openHours / DEMAND_CALL_HOURS);
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
      capacity = { ...d.capacity, callsCapacity, utilization };
      if (demandCallsShort != null) {
        callsBookable = Math.min(demandCallsShort, callsCapacity);
        callsBeyondCapacity = Math.max(demandCallsShort - callsCapacity, 0);
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
    if (capacity != null && (callsBeyondCapacity ?? 0) > 0) {
      flags.push(
        `${callsBeyondCapacity} of the calls short exceed today's remaining capacity (${capacity.openHours.toFixed(1)}h open) — needs overtime, borrowed techs, or tomorrow's board`,
      );
    }

    return {
      code: d.code,
      name: d.name,
      colorToken: d.colorToken,
      monthlyBudgetCents: budget,
      mtdRevenueCents: d.mtdRevenueCents,
      backlogCents: d.backlogCents,
      remainingBudgetCents: remainingBudget,
      dailyTargetCents: dailyTarget,
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
      paceRatio,
      status,
      flags,
      trailing: d.trailing,
      todaySchedule: d.todaySchedule,
    };
  });
}
