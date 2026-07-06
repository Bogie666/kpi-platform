import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  companyHolidays,
  countWorkdays,
  isWorkday,
  monthCalendarContext,
} from './calendar';

test('companyHolidays computes floating holidays', () => {
  const h2026 = companyHolidays(2026);
  assert.ok(h2026.includes('2026-05-25')); // Memorial Day — last Mon in May
  assert.ok(h2026.includes('2026-09-07')); // Labor Day — first Mon in Sept
  assert.ok(h2026.includes('2026-11-26')); // Thanksgiving — 4th Thu in Nov
});

test('fixed holidays shift to the observed weekday', () => {
  // July 4, 2026 is a Saturday → observed Friday July 3.
  assert.ok(companyHolidays(2026).includes('2026-07-03'));
  // Christmas 2027 is a Saturday → observed Friday Dec 24.
  assert.ok(companyHolidays(2027).includes('2027-12-24'));
  // New Year's 2028 is a Saturday → observed Friday Dec 31, 2027.
  assert.ok(companyHolidays(2028).includes('2027-12-31'));
  assert.equal(isWorkday('2027-12-31'), false);
});

test('isWorkday excludes weekends and holidays', () => {
  assert.equal(isWorkday('2026-06-12'), true); // Friday
  assert.equal(isWorkday('2026-06-13'), false); // Saturday
  assert.equal(isWorkday('2026-06-14'), false); // Sunday
  assert.equal(isWorkday('2026-05-25'), false); // Memorial Day (a Monday)
  assert.equal(isWorkday('2026-07-03'), false); // observed July 4
});

test('countWorkdays is inclusive on both ends', () => {
  // Mon Jun 8 → Fri Jun 12, 2026 — a plain work week.
  assert.equal(countWorkdays('2026-06-08', '2026-06-12'), 5);
  // Single weekend day.
  assert.equal(countWorkdays('2026-06-13', '2026-06-13'), 0);
  // Inverted range.
  assert.equal(countWorkdays('2026-06-12', '2026-06-08'), 0);
});

test('monthCalendarContext for mid-June 2026', () => {
  const ctx = monthCalendarContext('2026-06-12');
  assert.equal(ctx.monthStart, '2026-06-01');
  assert.equal(ctx.monthEnd, '2026-06-30');
  assert.equal(ctx.monthLabel, 'June 2026');
  assert.equal(ctx.totalWorkdays, 22); // June 2026: 22 weekdays, no holidays
  assert.equal(ctx.remainingWorkdays, 13); // Jun 12 + 5 + 5 + 2
  assert.equal(ctx.elapsedWorkdays, 9);
  assert.equal(ctx.isWorkdayToday, true);
  assert.deepEqual(ctx.holidays, []);
});

test('monthCalendarContext subtracts holidays from workday counts', () => {
  // May 2026 has Memorial Day on Mon the 25th: 21 weekdays − 1 holiday.
  const ctx = monthCalendarContext('2026-05-01');
  assert.equal(ctx.totalWorkdays, 20);
  assert.deepEqual(ctx.holidays, ['2026-05-25']);
});

test('a 19 vs 20 working-day month moves daily targets ~5%', () => {
  // November 2026: 21 weekdays − Thanksgiving = 20.
  const nov = monthCalendarContext('2026-11-02');
  assert.equal(nov.totalWorkdays, 20);
});
