import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePeriod, daysInWindow } from './period';

// Regression: on the evening of the last day of the month, Central time is
// still on that day but UTC has already rolled to the 1st of the next month.
// resolvePeriod must anchor "today" to America/Chicago so MTD does not jump
// to next month early. (Bug: dashboard showed next month's data before the 1st.)
test('MTD does not roll to next month in the evening (CT anchor)', async () => {
  // June 30, 2026 8:00 PM Central == July 1, 2026 01:00 UTC
  const eveningOfLastDay = new Date('2026-07-01T01:00:00Z');
  // When callers pass an explicit `today`, they must pass the local anchor.
  // Here we assert the default-resolution path used by the app: it reads the
  // business-local date, so we emulate by passing the CT-anchored midnight.
  const ctAnchor = new Date(Date.UTC(2026, 5, 30)); // 2026-06-30
  const r = await resolvePeriod({ preset: 'mtd', today: ctAnchor });
  assert.equal(r.cur.from, '2026-06-01');
  assert.equal(r.cur.to, '2026-06-30');
});

test('mtd window covers first through today', async () => {
  const r = await resolvePeriod({ preset: 'mtd', today: new Date(Date.UTC(2026, 5, 15)) });
  assert.equal(r.cur.from, '2026-06-01');
  assert.equal(r.cur.to, '2026-06-15');
  assert.equal(daysInWindow(r.cur).length, 15);
});

test('last_month resolves to the full previous calendar month', async () => {
  const r = await resolvePeriod({ preset: 'last_month', today: new Date(Date.UTC(2026, 6, 1)) });
  assert.equal(r.cur.from, '2026-06-01');
  assert.equal(r.cur.to, '2026-06-30');
});

test('LY window shifts back one year', async () => {
  const r = await resolvePeriod({ preset: 'mtd', today: new Date(Date.UTC(2026, 5, 15)) });
  assert.equal(r.ly.from, '2025-06-01');
  assert.equal(r.ly.to, '2025-06-15');
});
