import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fmtAsOf} from './date';
test('snapshot header renders business-local time rather than browser timezone',()=>{assert.equal(fmtAsOf('2026-10-01T16:25:00Z','America/Chicago'),'Oct 1, 2026 · 11:25 AM');assert.equal(fmtAsOf('2026-10-01T16:25:00Z','America/Los_Angeles'),'Oct 1, 2026 · 9:25 AM');});
