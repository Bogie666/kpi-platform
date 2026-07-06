import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDailyTargets,
  type CalendarContext,
  type DivisionInput,
  type TrailingSource,
} from './compute';

function source(revenuePerJobCents: number | null, jobs = 50): TrailingSource {
  return {
    jobs,
    revenueCents: revenuePerJobCents != null ? revenuePerJobCents * jobs : 0,
    revenuePerJobCents,
    windowDays: 30,
    lowSample: false,
  };
}

function division(overrides: Partial<DivisionInput> = {}): DivisionInput {
  return {
    code: 'hvac_maint_service',
    name: 'HVAC Service',
    colorToken: '--dept-hvac',
    monthlyBudgetCents: 100_000_00,
    mtdRevenueCents: 40_000_00,
    backlogCents: 10_000_00,
    trailing: {
      blended: source(1_000_00),
      maintenance: source(450_00),
      demand: source(1_500_00),
      install: null,
    },
    todaySchedule: { maintenance: 3, demand: 4, install: 0, total: 7 },
    ...overrides,
  };
}

const midMonth: CalendarContext = {
  totalWorkdays: 20,
  elapsedWorkdays: 10,
  remainingWorkdays: 10,
  isWorkdayToday: true,
};

test('core formula: remaining budget → daily target → jobs + demand calls', () => {
  const [row] = computeDailyTargets([division()], midMonth);

  // remaining = 100k − 40k MTD − 10k backlog = 50k over 10 workdays.
  assert.equal(row.remainingBudgetCents, 50_000_00);
  assert.equal(row.dailyTargetCents, 5_000_00);
  // 5,000 / 1,000 per job = 5 jobs.
  assert.equal(row.jobsNeededToday, 5);
  // 3 scheduled maint runs × $450 = $1,350 credited.
  assert.equal(row.maintRevenueTodayCents, 1_350_00);
  assert.equal(row.gapCents, 3_650_00);
  // 3,650 / 1,500 per demand call = 2.43 → 3 calls.
  assert.equal(row.demandCallsNeeded, 3);
  // 4 demand calls already booked × $1,500 covers the $3,650 gap → not short.
  assert.equal(row.demandCallsBooked, 4);
  assert.equal(row.demandCallsShort, 0);
  // Expected-to-date = 100k × 10/20 = 50k; MTD 40k → 0.8 → behind.
  assert.equal(row.paceRatio, 0.8);
  assert.equal(row.status, 'behind');
});

test('calls short = gap left after the booked demand board', () => {
  const [row] = computeDailyTargets(
    [division({ todaySchedule: { maintenance: 3, demand: 1, install: 0, total: 4 } })],
    midMonth,
  );
  // Gap $3,650 − 1 booked × $1,500 = $2,150 → 2 more calls to find.
  assert.equal(row.demandCallsNeeded, 3);
  assert.equal(row.demandCallsBooked, 1);
  assert.equal(row.demandCallsShort, 2);
});

test('creditBacklog: false ignores backlog and raises the daily target', () => {
  const [row] = computeDailyTargets([division()], midMonth, { creditBacklog: false });
  // remaining = 100k − 40k MTD = 60k; the 10k backlog is not credited.
  assert.equal(row.remainingBudgetCents, 60_000_00);
  assert.equal(row.dailyTargetCents, 6_000_00);
  assert.equal(row.jobsNeededToday, 6);
  assert.equal(row.gapCents, 4_650_00);
  assert.equal(row.demandCallsNeeded, 4);
});

test('pace bands: ahead at ≥1.05×, on pace in between', () => {
  const [ahead] = computeDailyTargets(
    [division({ mtdRevenueCents: 55_000_00 })],
    midMonth,
  );
  assert.equal(ahead.status, 'ahead');

  const [onPace] = computeDailyTargets(
    [division({ mtdRevenueCents: 50_000_00 })],
    midMonth,
  );
  assert.equal(onPace.status, 'on_pace');
});

test('budget already covered → zero targets, flagged', () => {
  const [row] = computeDailyTargets(
    [division({ mtdRevenueCents: 90_000_00, backlogCents: 20_000_00 })],
    midMonth,
  );
  assert.equal(row.remainingBudgetCents, -10_000_00);
  assert.equal(row.dailyTargetCents, 0);
  assert.equal(row.jobsNeededToday, 0);
  assert.equal(row.demandCallsNeeded, 0);
  assert.ok(row.flags.some((f) => f.includes('already covered')));
});

test('no budget → no_budget status', () => {
  const [row] = computeDailyTargets(
    [division({ monthlyBudgetCents: 0 })],
    midMonth,
  );
  assert.equal(row.status, 'no_budget');
});

test('missing trailing rates degrade gracefully', () => {
  const [row] = computeDailyTargets(
    [
      division({
        trailing: { blended: source(null, 0), maintenance: null, demand: null, install: null },
      }),
    ],
    midMonth,
  );
  assert.equal(row.jobsNeededToday, null);
  assert.equal(row.demandCallsNeeded, null);
  assert.equal(row.demandCallsShort, null);
  // No maintenance rate → scheduled maint runs are not credited.
  assert.equal(row.maintRevenueTodayCents, 0);
  assert.equal(row.gapCents, row.dailyTargetCents);
  assert.ok(row.flags.length >= 2);
});

test('demand rate falls back to blended when missing', () => {
  const [row] = computeDailyTargets(
    [
      division({
        trailing: {
          blended: source(1_000_00),
          maintenance: source(450_00),
          demand: null,
          install: null,
        },
      }),
    ],
    midMonth,
  );
  // gap 3,650 / blended 1,000 = 3.65 → 4.
  assert.equal(row.demandCallsNeeded, 4);
});

test('zero remaining workdays clamps to a single day', () => {
  const [row] = computeDailyTargets([division()], {
    totalWorkdays: 20,
    elapsedWorkdays: 20,
    remainingWorkdays: 0,
    isWorkdayToday: false,
  });
  // Whole remaining budget lands on one synthetic day.
  assert.equal(row.dailyTargetCents, 50_000_00);
});

test('extraFlags from upstream merges surface on the row', () => {
  const [row] = computeDailyTargets(
    [division({ extraFlags: ['Calls here are Sales estimate runs'] })],
    midMonth,
  );
  assert.ok(row.flags.includes('Calls here are Sales estimate runs'));
});

test('capacity: open hours translate to calls and split the shortfall', () => {
  // Gap $3,650, 1 demand booked × $1,500 → $2,150 short → 2 calls short.
  const [row] = computeDailyTargets(
    [
      division({
        todaySchedule: { maintenance: 3, demand: 1, install: 0, total: 4 },
        capacity: { openHours: 2.5, totalHours: 40, techsAvailable: 1, techsTotal: 8 },
      }),
    ],
    midMonth,
  );
  assert.equal(row.demandCallsShort, 2);
  // 2.5h open ÷ 2.5h/call = 1 call absorbable.
  assert.equal(row.capacity?.callsCapacity, 1);
  assert.equal(row.callsBookable, 1);
  assert.equal(row.callsBeyondCapacity, 1);
  // (40 − 2.5) / 40 = 93.75% booked.
  assert.ok(Math.abs((row.capacity?.utilization ?? 0) - 0.9375) < 1e-9);
  assert.ok(row.flags.some((f) => f.includes("exceed today's remaining capacity")));
});

test('capacity: plenty of open hours → everything bookable, no flag', () => {
  const [row] = computeDailyTargets(
    [
      division({
        todaySchedule: { maintenance: 3, demand: 1, install: 0, total: 4 },
        capacity: { openHours: 20, totalHours: 40, techsAvailable: 5, techsTotal: 8 },
      }),
    ],
    midMonth,
  );
  assert.equal(row.demandCallsShort, 2);
  assert.equal(row.capacity?.callsCapacity, 8);
  assert.equal(row.callsBookable, 2);
  assert.equal(row.callsBeyondCapacity, 0);
  assert.ok(!row.flags.some((f) => f.includes('remaining capacity')));
});

test('capacity: absent capacity keeps nulls and no capacity flag', () => {
  const [row] = computeDailyTargets([division()], midMonth);
  assert.equal(row.capacity, null);
  assert.equal(row.callsBookable, null);
  assert.equal(row.callsBeyondCapacity, null);
});

test('first morning of the month has no pace ratio yet', () => {
  const [row] = computeDailyTargets([division({ mtdRevenueCents: 0 })], {
    totalWorkdays: 20,
    elapsedWorkdays: 0,
    remainingWorkdays: 20,
    isWorkdayToday: true,
  });
  assert.equal(row.paceRatio, null);
  assert.equal(row.status, 'on_pace');
});
