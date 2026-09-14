import assert from 'node:assert/strict';
import test from 'node:test';
import { bookableByClass, bookableJobs, callHoursFor } from './kpi/bookable';

test('a maintenance run is sized shorter than a demand call', () => {
  assert.ok(callHoursFor('maintenance') < callHoursFor('demand'));
  // Install/sales runs are sized as demand calls.
  assert.equal(callHoursFor('install'), callHoursFor('demand'));
});

test('bookable jobs floor — a partly filled slot is not a bookable job', () => {
  // 2.5h per demand call: 6h fits two, with 1h left over that books nothing.
  assert.equal(bookableJobs(6, 'demand'), 2);
  assert.equal(bookableJobs(2.4, 'demand'), 0);
  // 1.5h per maintenance run.
  assert.equal(bookableJobs(6, 'maintenance'), 4);
});

test('no capacity means nothing bookable, never a negative or NaN', () => {
  assert.equal(bookableJobs(0, 'demand'), 0);
  assert.equal(bookableJobs(-5, 'demand'), 0);
  assert.equal(bookableJobs(Number.NaN, 'demand'), 0);
});

test('the total sums per-class capacity rather than blending crews', () => {
  // 6h of maintenance-crew time and 5h of demand-crew time.
  const { byClass, total } = bookableByClass({ maintenance: 6, demand: 5 });
  assert.deepEqual(byClass, { maintenance: 4, demand: 2, install: 0 });
  assert.equal(total, 6);
  // Blending all 11h at the demand length would have said 4 — understating
  // the shorter maintenance runs the maintenance crew can actually run.
  assert.notEqual(total, bookableJobs(11, 'demand'));
});

test('missing classes are treated as no capacity, not as absent crews', () => {
  const { byClass, total } = bookableByClass({});
  assert.deepEqual(byClass, { demand: 0, maintenance: 0, install: 0 });
  assert.equal(total, 0);
});
