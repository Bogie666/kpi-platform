/**
 * Weekday-only working calendar for daily pacing targets.
 *
 * Decision (per the daily-jobs-needed plan): monthly budgets are paced over
 * Mon–Fri working days minus company holidays, shared by every division.
 * Weekend production still lands in MTD actuals, so Monday's remaining
 * budget shrinks and targets self-correct — weekends are bonus capacity,
 * not budgeted capacity.
 *
 * All dates are YYYY-MM-DD strings in business-local time (America/Chicago);
 * day-of-week math runs in UTC on the raw string so there are no TZ shifts.
 */

import { shiftISO } from '@/lib/time';

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
function dayOfWeek(iso: string): number {
  return parseISO(iso).getUTCDay();
}

export function isWeekday(iso: string): boolean {
  const dow = dayOfWeek(iso);
  return dow >= 1 && dow <= 5;
}

/** Nth (1-based) occurrence of `dow` in a month. Month is 1-based. */
function nthWeekdayOfMonth(year: number, month: number, dow: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (dow - first.getUTCDay() + 7) % 7;
  return toISO(new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7)));
}

/** Last occurrence of `dow` in a month. Month is 1-based. */
function lastWeekdayOfMonth(year: number, month: number, dow: number): string {
  const last = new Date(Date.UTC(year, month, 0)); // last day of month
  const offset = (last.getUTCDay() - dow + 7) % 7;
  return toISO(new Date(Date.UTC(year, month, -offset)));
}

/** Saturday holidays are observed the Friday before; Sunday the Monday after. */
function observed(iso: string): string {
  const dow = dayOfWeek(iso);
  if (dow === 6) return shiftISO(iso, -1);
  if (dow === 0) return shiftISO(iso, 1);
  return iso;
}

/**
 * Observed company holidays generated for one calendar year. Note the
 * observed date can spill into the prior year (Jan 1 on a Saturday is
 * observed Dec 31), which is why `holidaySet` spans adjacent years.
 */
export function companyHolidays(year: number): string[] {
  return [
    observed(`${year}-01-01`),                    // New Year's Day
    lastWeekdayOfMonth(year, 5, 1),               // Memorial Day — last Mon in May
    observed(`${year}-07-04`),                    // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 1),             // Labor Day — first Mon in Sept
    nthWeekdayOfMonth(year, 11, 4, 4),            // Thanksgiving — 4th Thu in Nov
    observed(`${year}-12-25`),                    // Christmas Day
  ];
}

function holidaySet(year: number): Set<string> {
  return new Set([
    ...companyHolidays(year - 1),
    ...companyHolidays(year),
    ...companyHolidays(year + 1),
  ]);
}

export function isWorkday(iso: string): boolean {
  if (!isWeekday(iso)) return false;
  return !holidaySet(Number(iso.slice(0, 4))).has(iso);
}

/** Count of working days from `fromIso` through `toIso`, inclusive. */
export function countWorkdays(fromIso: string, toIso: string): number {
  let count = 0;
  for (let d = fromIso; d <= toIso; d = shiftISO(d, 1)) {
    if (isWorkday(d)) count += 1;
  }
  return count;
}

export interface MonthCalendarContext {
  monthStart: string;
  monthEnd: string;
  /** e.g. "June 2026" */
  monthLabel: string;
  totalWorkdays: number;
  /** Workdays already behind us (month start through yesterday). */
  elapsedWorkdays: number;
  /** Workdays left including today (0 on a weekend after the last workday). */
  remainingWorkdays: number;
  isWorkdayToday: boolean;
  /** Observed holidays falling inside this month. */
  holidays: string[];
}

export function monthCalendarContext(todayIso: string): MonthCalendarContext {
  const [y, m] = todayIso.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const totalWorkdays = countWorkdays(monthStart, monthEnd);
  const remainingWorkdays = countWorkdays(todayIso, monthEnd);
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseISO(todayIso));

  const holidays = companyHolidays(y).filter(
    (h) => h >= monthStart && h <= monthEnd,
  );

  return {
    monthStart,
    monthEnd,
    monthLabel,
    totalWorkdays,
    elapsedWorkdays: totalWorkdays - remainingWorkdays,
    remainingWorkdays,
    isWorkdayToday: isWorkday(todayIso),
    holidays,
  };
}
