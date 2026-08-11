/**
 * Intraday (hour-by-hour) pacing math — pure functions, no DB, no clock.
 *
 * Problem this solves: the "Today · Daily pace" card used to compare today's
 * invoiced revenue against the *entire* day target from midnight, so every
 * morning opened deep "behind goal" and only caught up by late afternoon.
 * Instead, the day target is spread evenly across the working day (length and
 * start time are admin-configurable, default 8:00a–6:00p = 10 hours) and the
 * card compares revenue against what should be in the door *by now*:
 *
 *   expected_now = day_target × elapsed_work_hours / workday_hours
 *
 * Before the workday starts expected_now is 0; after it ends it equals the
 * full day target (matching the old behavior for the evening review). On
 * non-workdays (weekends/holidays) expected_now stays 0 all day — weekend
 * production is bonus capacity, never "behind".
 */

/** Default working-day length in hours when no admin setting exists. */
export const DEFAULT_WORKDAY_HOURS = 10;
/** Default workday start (hour of day, business-local). 8 → 8:00 AM. */
export const DEFAULT_WORKDAY_START_HOUR = 8;

export interface WorkdayConfig {
  /** Length of the working day in hours (0 < h ≤ 24). */
  workdayHours: number;
  /** Start of the working day as an hour-of-day (0 ≤ h < 24, fractional ok). */
  startHour: number;
}

/**
 * Working hours elapsed at `minutesOfDay` (minutes since local midnight),
 * clamped to [0, workdayHours]. 0 before the workday starts, workdayHours
 * after it ends.
 */
export function elapsedWorkHours(
  minutesOfDay: number,
  cfg: WorkdayConfig,
): number {
  const elapsed = minutesOfDay / 60 - cfg.startHour;
  return Math.min(Math.max(elapsed, 0), cfg.workdayHours);
}

/**
 * Revenue (cents) expected by now: the day target prorated over elapsed
 * working hours. `elapsedHours` is expected to already be clamped (see
 * `elapsedWorkHours`); the fraction is clamped again defensively.
 */
export function intradayExpectedCents(
  dayTargetCents: number,
  elapsedHours: number,
  workdayHours: number,
): number {
  if (workdayHours <= 0 || dayTargetCents <= 0) return 0;
  const frac = Math.min(Math.max(elapsedHours / workdayHours, 0), 1);
  return Math.round(dayTargetCents * frac);
}

/** Day target ÷ workday hours — the per-hour run rate (cents/hour). */
export function hourlyTargetCents(
  dayTargetCents: number,
  workdayHours: number,
): number {
  if (workdayHours <= 0) return 0;
  return Math.round(dayTargetCents / workdayHours);
}
