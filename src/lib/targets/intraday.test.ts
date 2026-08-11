import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_WORKDAY_HOURS,
  DEFAULT_WORKDAY_START_HOUR,
  elapsedWorkHours,
  hourlyTargetCents,
  intradayExpectedCents,
} from './intraday';

const cfg = {
  workdayHours: DEFAULT_WORKDAY_HOURS,
  startHour: DEFAULT_WORKDAY_START_HOUR,
};

test('elapsedWorkHours: 0 before the workday starts', () => {
  assert.equal(elapsedWorkHours(0, cfg), 0); // midnight
  assert.equal(elapsedWorkHours(7 * 60 + 59, cfg), 0); // 7:59a
});

test('elapsedWorkHours: linear during the day', () => {
  assert.equal(elapsedWorkHours(8 * 60, cfg), 0); // 8:00a exactly
  assert.equal(elapsedWorkHours(9 * 60, cfg), 1); // 9:00a
  assert.equal(elapsedWorkHours(12 * 60 + 30, cfg), 4.5); // 12:30p
  assert.equal(elapsedWorkHours(18 * 60, cfg), 10); // 6:00p — full day
});

test('elapsedWorkHours: clamped after the workday ends', () => {
  assert.equal(elapsedWorkHours(21 * 60, cfg), 10); // 9:00p
  assert.equal(elapsedWorkHours(23 * 60 + 59, cfg), 10);
});

test('elapsedWorkHours: honors a custom start + length', () => {
  const early = { workdayHours: 8, startHour: 7 };
  assert.equal(elapsedWorkHours(6 * 60, early), 0);
  assert.equal(elapsedWorkHours(11 * 60, early), 4);
  assert.equal(elapsedWorkHours(16 * 60, early), 8); // 3p end, clamped
  const halfHourStart = { workdayHours: 10, startHour: 7.5 };
  assert.equal(elapsedWorkHours(8 * 60, halfHourStart), 0.5);
});

test('intradayExpectedCents: prorates the day target by elapsed fraction', () => {
  const dayTarget = 50_000_00;
  assert.equal(intradayExpectedCents(dayTarget, 0, 10), 0);
  assert.equal(intradayExpectedCents(dayTarget, 1, 10), 5_000_00);
  assert.equal(intradayExpectedCents(dayTarget, 4.5, 10), 22_500_00);
  assert.equal(intradayExpectedCents(dayTarget, 10, 10), dayTarget);
});

test('intradayExpectedCents: clamps and guards degenerate inputs', () => {
  assert.equal(intradayExpectedCents(50_000_00, 12, 10), 50_000_00); // over-elapsed
  assert.equal(intradayExpectedCents(50_000_00, -1, 10), 0); // negative elapsed
  assert.equal(intradayExpectedCents(50_000_00, 5, 0), 0); // zero-length day
  assert.equal(intradayExpectedCents(0, 5, 10), 0); // no target
  assert.equal(intradayExpectedCents(-100, 5, 10), 0); // negative target
});

test('hourlyTargetCents: day target ÷ workday hours', () => {
  assert.equal(hourlyTargetCents(50_000_00, 10), 5_000_00);
  assert.equal(hourlyTargetCents(50_000_00, 8), 625_000);
  assert.equal(hourlyTargetCents(50_000_00, 0), 0);
});

test('a morning no longer opens deep behind: 9a on a $50k day expects $5k, not $50k', () => {
  const dayTarget = 50_000_00;
  const elapsed = elapsedWorkHours(9 * 60, cfg);
  const expected = intradayExpectedCents(dayTarget, elapsed, cfg.workdayHours);
  assert.equal(expected, 5_000_00);
  // $6k invoiced by 9a reads ahead of pace even though it's 12% of the day.
  assert.ok(6_000_00 >= expected);
});
