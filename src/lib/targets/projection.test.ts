import { test } from 'node:test';
import assert from 'node:assert/strict';

import { projectMonthAtCurrentPace } from './projection';

// July 2026: the 1st–3rd are Wed–Fri, July 3 is Independence Day observed
// (July 4 falls on a Saturday). Mon Jul 6 → Fri Jul 31 are all workdays.
const JULY = {
  budgetCents: 100_000_00,
  mtdCents: 30_000_00,
  creditedBacklogCents: 0,
  todayIso: '2026-07-06',
  monthEnd: '2026-07-31',
  // Jul 1, 2 elapsed (Jul 3 observed holiday); Mon 6 → Fri 31 = 20 remaining.
  elapsedWorkdays: 2,
  remainingWorkdays: 20,
};

test('projects each remaining workday at current pace', () => {
  const p = projectMonthAtCurrentPace(JULY);
  assert.ok(p);
  // 30k over 2 workdays = 15k/workday.
  assert.equal(p.paceCentsPerWorkday, 15_000_00);
  assert.equal(p.days.length, 20);

  // Day 1 (today): (100k − 30k) / 20 = 3.5k — matches the live daily target.
  assert.equal(p.days[0].date, '2026-07-06');
  assert.equal(p.days[0].projectedMtdCents, 30_000_00);
  assert.equal(p.days[0].dailyTargetCents, 3_500_00);

  // Pace far exceeds the required rate, so later targets fall to zero.
  assert.equal(p.days[5].projectedMtdCents, 30_000_00 + 5 * 15_000_00);
  assert.equal(p.days.at(-1)!.dailyTargetCents, 0);

  // Finish: 30k + 20 × 15k = 330k → +230k over budget.
  assert.equal(p.projectedMonthEndCents, 330_000_00);
  assert.equal(p.varianceCents, 230_000_00);
});

test('behind pace: targets climb toward month end', () => {
  const p = projectMonthAtCurrentPace({
    ...JULY,
    // 2k/workday against a budget needing ~4.5k/workday.
    mtdCents: 4_000_00,
  });
  assert.ok(p);
  assert.equal(p.paceCentsPerWorkday, 2_000_00);
  const targets = p.days.map((d) => d.dailyTargetCents);
  // Strictly increasing when pace < required rate.
  for (let i = 1; i < targets.length; i++) {
    assert.ok(targets[i] > targets[i - 1], `day ${i} should exceed day ${i - 1}`);
  }
  // Finish short of budget.
  assert.equal(p.projectedMonthEndCents, 4_000_00 + 20 * 2_000_00);
  assert.ok(p.varianceCents < 0);
});

test('weekends and holidays are skipped in the day list', () => {
  const p = projectMonthAtCurrentPace({
    ...JULY,
    todayIso: '2026-07-02',
    elapsedWorkdays: 1,
    // Thu Jul 2 + Mon 6 → Fri 31 (Fri Jul 3 is the observed holiday).
    remainingWorkdays: 21,
  });
  assert.ok(p);
  assert.equal(p.days.length, 21);
  const dates = new Set(p.days.map((d) => d.date));
  assert.ok(!dates.has('2026-07-03')); // observed Independence Day
  assert.ok(!dates.has('2026-07-04')); // Saturday
  assert.ok(!dates.has('2026-07-05')); // Sunday
  assert.ok(dates.has('2026-07-06'));
});

test('credited backlog lowers every day\'s target', () => {
  const base = projectMonthAtCurrentPace(JULY)!;
  const credited = projectMonthAtCurrentPace({
    ...JULY,
    creditedBacklogCents: 20_000_00,
  })!;
  // (100k − 20k − 30k) / 20 = 2.5k vs 3.5k uncredited.
  assert.equal(credited.days[0].dailyTargetCents, 2_500_00);
  assert.ok(credited.days[0].dailyTargetCents < base.days[0].dailyTargetCents);
  // Projected finish is pace-based, so backlog credit doesn't change it.
  assert.equal(credited.projectedMonthEndCents, base.projectedMonthEndCents);
});

test('no elapsed workdays yet → no observable pace → null', () => {
  assert.equal(
    projectMonthAtCurrentPace({ ...JULY, todayIso: '2026-07-01', elapsedWorkdays: 0 }),
    null,
  );
});

test('month exhausted: empty day list but finish still reported', () => {
  const p = projectMonthAtCurrentPace({
    ...JULY,
    todayIso: '2026-07-31',
    mtdCents: 90_000_00,
    elapsedWorkdays: 22,
    remainingWorkdays: 0,
  });
  assert.ok(p);
  assert.equal(p.days.length, 0);
  assert.equal(p.projectedMonthEndCents, 90_000_00);
});
