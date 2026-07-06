/**
 * Static remainder-of-month projection — "if we keep producing at the pace
 * we've actually run so far this month, what does each remaining workday's
 * target look like, and where do we land at month end?"
 *
 * Pure math (no DB, no network) so it can be unit-tested:
 *   pace           = MTD completed revenue ÷ elapsed workdays
 *   day k's target = (budget − credited backlog − projected MTD entering
 *                     day k) ÷ workdays left from day k
 *   projected MTD  advances by `pace` each workday.
 *
 * The projection is an as-of-this-morning snapshot: MTD runs through
 * yesterday (same stable frame as the daily target), today's partial
 * production is deliberately ignored, and weekend/holiday revenue is baked
 * into the pace numerator rather than modeled as separate days. If pace
 * holds below the required run rate the targets climb toward month end;
 * if we're ahead they fall.
 */

import { shiftISO } from '@/lib/time';
import { isWorkday } from '@/lib/targets/calendar';

export interface ProjectionDay {
  /** Business-local date (YYYY-MM-DD). Workdays only. */
  date: string;
  /** Projected completed revenue entering this day, at current pace. */
  projectedMtdCents: number;
  /** Revenue this day must produce to finish the month on budget, given
   *  every prior remaining day only produced `pace`. */
  dailyTargetCents: number;
}

export interface MonthProjection {
  /** Completed revenue per elapsed workday so far this month. */
  paceCentsPerWorkday: number;
  /** MTD + pace × remaining workdays. */
  projectedMonthEndCents: number;
  /** projectedMonthEnd − budget: negative means a projected miss. */
  varianceCents: number;
  /** One entry per remaining workday, today (when a workday) first. */
  days: ProjectionDay[];
}

export interface ProjectionInput {
  budgetCents: number;
  /** Completed revenue month-start → yesterday. */
  mtdCents: number;
  /** Backlog subtracted from the remaining budget (0 in the strict view). */
  creditedBacklogCents: number;
  todayIso: string;
  monthEnd: string;
  elapsedWorkdays: number;
  remainingWorkdays: number;
}

/**
 * Returns null before the month's first workday has elapsed — there is no
 * observed pace to project from yet.
 */
export function projectMonthAtCurrentPace(input: ProjectionInput): MonthProjection | null {
  if (input.elapsedWorkdays <= 0) return null;
  const pace = input.mtdCents / input.elapsedWorkdays;

  const days: ProjectionDay[] = [];
  let projectedMtd = input.mtdCents;
  let daysLeft = input.remainingWorkdays;
  for (let d = input.todayIso; d <= input.monthEnd && daysLeft > 0; d = shiftISO(d, 1)) {
    if (!isWorkday(d)) continue;
    const remaining = input.budgetCents - input.creditedBacklogCents - projectedMtd;
    days.push({
      date: d,
      projectedMtdCents: Math.round(projectedMtd),
      dailyTargetCents: Math.max(Math.round(remaining / daysLeft), 0),
    });
    projectedMtd += pace;
    daysLeft -= 1;
  }

  const projectedMonthEndCents = Math.round(
    input.mtdCents + pace * input.remainingWorkdays,
  );
  return {
    paceCentsPerWorkday: Math.round(pace),
    projectedMonthEndCents,
    varianceCents: projectedMonthEndCents - input.budgetCents,
    days,
  };
}
