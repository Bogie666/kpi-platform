import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportParameters } from './sync/servicetitan/technician-reports';

const WINDOW = { from: '2026-08-01', to: '2026-08-19' };

test('window only: emits From/To', () => {
  const params = buildReportParameters(WINDOW);
  assert.deepEqual(params, [
    { name: 'From', value: '2026-08-01' },
    { name: 'To', value: '2026-08-19' },
  ]);
});

test('extra parameter is appended (DateType for estimate-analysis reports)', () => {
  const params = buildReportParameters(WINDOW, [{ name: 'DateType', value: 3 }]);
  assert.deepEqual(params, [
    { name: 'From', value: '2026-08-01' },
    { name: 'To', value: '2026-08-19' },
    { name: 'DateType', value: 3 },
  ]);
});

test('extra parameter overrides window by name', () => {
  const params = buildReportParameters(WINDOW, [{ name: 'From', value: '2026-01-01' }]);
  assert.deepEqual(params, [
    { name: 'From', value: '2026-01-01' },
    { name: 'To', value: '2026-08-19' },
  ]);
});

test('blank/invalid names are dropped', () => {
  const params = buildReportParameters(WINDOW, [
    { name: '', value: 1 },
    { name: '   ', value: 2 },
    { name: 'DateType', value: 3 },
  ]);
  assert.equal(params.length, 3);
  assert.deepEqual(params[2], { name: 'DateType', value: 3 });
});
