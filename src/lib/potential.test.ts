import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computePotential, type UnsoldEstimateRow } from './potential';

const HOT_AFTER = '2026-08-04'; // created after this date = hot

function row(overrides: Partial<UnsoldEstimateRow> = {}): UnsoldEstimateRow {
  return {
    estimateId: 'e1',
    jobId: 100,
    createdOn: '2026-08-10',
    subtotalCents: 500_000,
    departmentCode: 'hvac_maint_service',
    ...overrides,
  };
}

test('good/better/best on one job collapse to the cheapest option', () => {
  const rows = [
    row({ estimateId: 'good', subtotalCents: 400_000 }),
    row({ estimateId: 'better', subtotalCents: 600_000 }),
    row({ estimateId: 'best', subtotalCents: 900_000 }),
  ];
  const r = computePotential(rows, new Set(), HOT_AFTER);
  assert.equal(r.totalCents, 400_000);
  assert.equal(r.jobCount, 1);
  assert.equal(r.byDept.get('hvac_maint_service')?.hot, 400_000);
});

test('jobs with a won option are excluded entirely', () => {
  const rows = [
    row({ estimateId: 'a', jobId: 100, subtotalCents: 400_000 }),
    row({ estimateId: 'b', jobId: 100, subtotalCents: 600_000 }),
    row({ estimateId: 'c', jobId: 200, subtotalCents: 250_000 }),
  ];
  const r = computePotential(rows, new Set([100]), HOT_AFTER);
  assert.equal(r.totalCents, 250_000); // only job 200 remains
  assert.equal(r.jobCount, 1);
  assert.equal(r.soldJobsExcluded, 1);
});

test('hot/warm split uses the earliest option on the job', () => {
  const rows = [
    // Job quoted warm, option re-issued hot — still one warm opportunity.
    row({ estimateId: 'old', createdOn: '2026-08-01', subtotalCents: 300_000 }),
    row({ estimateId: 'new', createdOn: '2026-08-10', subtotalCents: 350_000 }),
    row({ estimateId: 'h', jobId: 300, createdOn: '2026-08-09', subtotalCents: 100_000 }),
  ];
  const r = computePotential(rows, new Set(), HOT_AFTER);
  assert.equal(r.warmCents, 300_000);
  assert.equal(r.hotCents, 100_000);
  assert.equal(r.totalCents, 400_000);
});

test('rows without a jobId key by estimate and cannot be won-excluded', () => {
  const rows = [
    row({ estimateId: 'x', jobId: null, subtotalCents: 120_000 }),
    row({ estimateId: 'y', jobId: null, subtotalCents: 80_000 }),
  ];
  const r = computePotential(rows, new Set([100]), HOT_AFTER);
  // Distinct estimates, no shared job — both count.
  assert.equal(r.totalCents, 200_000);
  assert.equal(r.jobCount, 2);
  assert.equal(r.soldJobsExcluded, 0);
});

test('unmapped-division rows count in totals but not byDept', () => {
  const rows = [
    row({ departmentCode: null, subtotalCents: 150_000 }),
    row({ jobId: 200, departmentCode: 'plumbing', subtotalCents: 100_000 }),
  ];
  const r = computePotential(rows, new Set(), HOT_AFTER);
  assert.equal(r.totalCents, 250_000);
  assert.equal(r.byDept.size, 1);
  assert.equal(r.byDept.get('plumbing')?.hot, 100_000);
});

test('same job split across two divisions counts once per division', () => {
  const rows = [
    row({ estimateId: 'hv', departmentCode: 'hvac_maint_service', subtotalCents: 200_000 }),
    row({ estimateId: 'pl', departmentCode: 'plumbing', subtotalCents: 90_000 }),
  ];
  const r = computePotential(rows, new Set(), HOT_AFTER);
  assert.equal(r.jobCount, 2);
  assert.equal(r.totalCents, 290_000);
});

test('empty input → zeroes', () => {
  const r = computePotential([], new Set(), HOT_AFTER);
  assert.equal(r.totalCents, 0);
  assert.equal(r.jobCount, 0);
  assert.equal(r.soldJobsExcluded, 0);
  assert.equal(r.byDept.size, 0);
});
