/**
 * Synthetic ServiceTitan records for demo fixture capture.
 *
 * The four ST-live KPI routes (pipeline-revenue, upcoming-appointments,
 * daily-targets, new-customers) read all their data through
 * collectResource({ path, query }). During capture we swap the resource
 * fetcher (see raw-client __setResourceFetcherForCapture) for this function so
 * the REAL route logic runs against believable in-memory records — no ST
 * credentials, no network. Numbers model a mid-size multi-trade home-services
 * shop (HVAC + plumbing + electrical).
 *
 * Business unit ids here intentionally overlap the seed's BUSINESS_UNITS so BU
 * to division mapping resolves; unknown BUs are tolerated by the routes.
 */
import type { ResourceQueryArgs } from '../src/lib/sync/servicetitan/raw-client';

// A pool of business unit ids that exist in the seed (see src/db/seed/data.ts).
const BU_IDS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 20, 21, 30, 31];

function parseIso(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3.6e6;
}

let seq = 100000;
const nextId = () => ++seq;

/**
 * Deterministic pseudo-random so repeated captures are stable.
 */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260709);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * Generate appointment records spanning [start, end] (from the query window),
 * each linked to a job id. Density ~ a busy dispatch board.
 */
function genAppointments(args: ResourceQueryArgs): unknown[] {
  const q = args.query ?? {};
  // The routes filter by starts-on-or-after / starts-before (upcoming) or
  // similar. Derive a window; default to a 14-day forward window from "now".
  const now = new Date();
  const start =
    parseIso(q.startsOnOrAfter) ??
    parseIso(q.startsOnOrAfterUtc) ??
    parseIso(q.createdOnOrAfter) ??
    now;
  const end =
    parseIso(q.startsBefore) ??
    parseIso(q.startsBeforeUtc) ??
    parseIso(q.createdBefore) ??
    new Date(start.getTime() + 14 * 864e5);

  const totalHours = Math.max(1, hoursBetween(start, end));
  // ~6 appointments per day of window, capped so capture stays fast.
  const count = Math.min(400, Math.max(8, Math.round((totalHours / 24) * 6)));

  const out: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(start.getTime() + rand() * (end.getTime() - start.getTime()));
    out.push({
      id: nextId(),
      jobId: nextId(),
      start: t.toISOString(),
      status: pick(['Scheduled', 'Dispatched', 'Scheduled', 'Scheduled']),
      active: true,
      unused: false,
    });
  }
  return out;
}

/**
 * Jobs are looked up by id for BU mapping. The routes pass a set of jobIds via
 * query (ids=...) OR crawl completed jobs in a window. We return records that
 * carry a plausible BU + jobType so downstream grouping produces variety.
 */
function genJobs(args: ResourceQueryArgs): unknown[] {
  const q = args.query ?? {};
  // Case A: explicit id list -> return one job per id, mapped to a BU.
  const idsParam = q.ids;
  if (idsParam != null) {
    const ids = String(idsParam)
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    return ids.map((id) => ({
      id,
      businessUnitId: BU_IDS[id % BU_IDS.length],
      jobTypeId: 500 + (id % 8),
      createdFromEstimateId: rand() < 0.4 ? nextId() : null,
      customerId: 700000 + (id % 5000),
      completedOn: null,
    }));
  }
  // Case B: window crawl (completed feeder jobs / new-customer jobs).
  const now = new Date();
  const start =
    parseIso(q.completedOnOrAfter) ?? parseIso(q.createdOnOrAfter) ?? new Date(now.getTime() - 30 * 864e5);
  const end =
    parseIso(q.completedBefore) ?? parseIso(q.createdBefore) ?? now;
  const days = Math.max(1, hoursBetween(start, end) / 24);
  const count = Math.min(600, Math.max(10, Math.round(days * 14)));
  const out: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(start.getTime() + rand() * (end.getTime() - start.getTime()));
    const id = nextId();
    out.push({
      id,
      businessUnitId: pick(BU_IDS),
      jobTypeId: 500 + Math.floor(rand() * 8),
      createdFromEstimateId: rand() < 0.4 ? nextId() : null,
      // new-customers ties jobs to customers created in the same window.
      customerId: 700000 + Math.floor(rand() * 900),
      completedOn: t.toISOString(),
    });
  }
  return out;
}

function genJobTypes(): unknown[] {
  const names = [
    'HVAC Service Call',
    'HVAC System Replacement',
    'HVAC Maintenance',
    'Plumbing Service',
    'Drain Cleaning',
    'Water Heater Install',
    'Electrical Service',
    'Panel Upgrade',
  ];
  return names.map((name, i) => ({ id: 500 + i, name }));
}

function genCustomers(args: ResourceQueryArgs): unknown[] {
  const q = args.query ?? {};
  const now = new Date();
  const start = parseIso(q.createdOnOrAfter) ?? new Date(now.getTime() - 30 * 864e5);
  const end = parseIso(q.createdBefore) ?? now;
  const days = Math.max(1, hoursBetween(start, end) / 24);
  // ~9 new customers per day.
  const count = Math.min(900, Math.max(5, Math.round(days * 9)));
  const out: unknown[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ id: 700000 + Math.floor(rand() * 900) });
  }
  return out;
}

/**
 * Route synthetic data by ST resource path.
 */
export function syntheticStFetch(args: ResourceQueryArgs): unknown[] {
  const p = args.path;
  if (p.includes('/appointments')) return genAppointments(args);
  if (p.includes('/job-types')) return genJobTypes();
  if (p.includes('/jobs')) return genJobs(args);
  if (p.includes('/customers')) return genCustomers(args);
  // Unknown resource: empty is safe — routes tolerate no data.
  return [];
}
