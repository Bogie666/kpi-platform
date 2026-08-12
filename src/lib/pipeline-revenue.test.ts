import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  endOfMonthISO,
  isPipelineJobStatus,
  jobTotalCents,
  pipelineWindow,
} from './pipeline-revenue';

test('pipeline window is always local today through that month end', () => {
  assert.deepEqual(pipelineWindow('2026-02-11'), {
    start: '2026-02-11',
    end: '2026-02-28',
  });
  assert.equal(endOfMonthISO('2028-02-11'), '2028-02-29');
});

test('only Scheduled and InProgress job statuses qualify', () => {
  assert.equal(isPipelineJobStatus('Scheduled'), true);
  assert.equal(isPipelineJobStatus('In Progress'), true);
  assert.equal(isPipelineJobStatus('in_progress'), true);
  assert.equal(isPipelineJobStatus('Completed'), false);
  assert.equal(isPipelineJobStatus('Canceled'), false);
  assert.equal(isPipelineJobStatus(undefined), false);
});

test('live Job.total dollars convert safely to cents', () => {
  assert.equal(jobTotalCents(1234.56), 123456);
  assert.equal(jobTotalCents('19.995'), 2000);
  assert.equal(jobTotalCents(null), null);
  assert.equal(jobTotalCents('not-a-dollar-value'), null);
});