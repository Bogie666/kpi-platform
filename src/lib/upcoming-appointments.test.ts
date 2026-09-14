import assert from 'node:assert/strict';
import test from 'node:test';
import { classTotalsFromDays, totalAppointmentsFromDays } from './kpi/upcoming-appointments';

test('appointment headline reconciles to the visible seven-day buckets', () => {
  // The upstream active list may have extra malformed/unjoinable rows; only
  // these rendered buckets belong in the KPI headline (issue #70).
  const days = [
    { count: 4 },
    { count: 0 },
    { count: 3 },
    { count: 2 },
    { count: 0 },
    { count: 1 },
    { count: 0 },
  ];

  assert.equal(totalAppointmentsFromDays(days), 10);
});

test('appointment headline is zero for an empty or all-zero window', () => {
  assert.equal(totalAppointmentsFromDays([]), 0);
  assert.equal(totalAppointmentsFromDays(Array.from({ length: 7 }, () => ({ count: 0 }))), 0);
});

test('class totals reconcile with the headline they are derived from', () => {
  // Both figures come from the same rendered buckets, so the demand /
  // maintenance / install split must add up to the headline exactly.
  const days = [
    {
      count: 5,
      byBu: [
        { jobTypes: [{ count: 2, cls: 'demand' as const }, { count: 1, cls: 'maintenance' as const }] },
        { jobTypes: [{ count: 2, cls: 'install' as const }] },
      ],
    },
    { count: 0, byBu: [] },
    {
      count: 3,
      byBu: [{ jobTypes: [{ count: 3, cls: 'maintenance' as const }] }],
    },
  ];

  const totals = classTotalsFromDays(days);
  assert.deepEqual(totals, { demand: 2, maintenance: 4, install: 2 });
  assert.equal(
    totals.demand + totals.maintenance + totals.install,
    totalAppointmentsFromDays(days),
  );
});

test('class totals are all zero for an empty window', () => {
  assert.deepEqual(classTotalsFromDays([]), { demand: 0, maintenance: 0, install: 0 });
});
