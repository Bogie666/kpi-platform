/**
 * ServiceTitan Dispatch Capacity — "how many open tech-hours does each
 * division still have today?"
 *
 * POST /dispatch/v2/tenant/{tenant}/capacity returns availability slots
 * (arrival windows), each covering a GROUP of business units that share a
 * schedule, with:
 *   - totalAvailability / openAvailability (tech-hours)
 *   - technicians[] with per-slot status (Available/Unavailable)
 *
 * Notes from live probing (2026-07):
 *   - `start`/`end` are business-LOCAL times mislabeled with a Z suffix;
 *     `startUtc`/`endUtc` are the actual UTC instants. Use the *Utc fields.
 *   - The endpoint needs the "Dispatch" API scope. The dashboard's default
 *     read app may not have it — ST_DISPATCH_CLIENT_ID / _SECRET / _APP_KEY
 *     env vars override the credentials just for this call. Missing scope
 *     (403) degrades gracefully to `null` so the targets page still renders.
 */
import { invalidateAccessToken, readStConfig, type StConfig } from './auth';
import { getConfig } from '@/lib/config-service';
import { getBusinessTz, localDayStartUTC } from '@/lib/time';
import type { ClassCapacity, SourceClass } from '@/lib/targets/compute';

export interface DeptCapacityAgg {
  /** Unbooked tech-hours still ahead of now, today. */
  openHours: number;
  /** Total schedulable tech-hours still ahead of now, today. */
  totalHours: number;
  /** Whole-day unbooked tech-hours (past windows included). */
  fullDayOpenHours: number;
  /** Whole-day schedulable tech-hours — the day's physical envelope, the
   *  yardstick for month-level "calls per day we can physically run". */
  fullDayTotalHours: number;
  /** The same hours split by crew class (maintenance / demand / install BU
   *  classification). A slot whose BU group spans several classes within a
   *  division splits that division's share evenly across them — the same
   *  heuristic already used for the division split. */
  byClass: Partial<Record<SourceClass, ClassCapacity>>;
  /** Distinct technicians available in at least one remaining slot. */
  techsAvailable: number;
  /** Distinct technicians appearing on the remaining slots. */
  techsTotal: number;
}

export interface CapacitySnapshot {
  byDept: Map<string, DeptCapacityAgg>;
  total: DeptCapacityAgg;
}

interface CapacitySlot {
  start?: string;
  end?: string;
  startUtc?: string;
  endUtc?: string;
  businessUnitIds?: number[];
  totalAvailability?: number;
  openAvailability?: number;
  technicians?: Array<{ id: number; name?: string; status?: string }>;
  isAvailable?: boolean;
}

interface CapacityResponse {
  timeStamp?: string;
  availabilities?: CapacitySlot[];
}

/**
 * Dispatch-scope credential override; falls back to the main ST config.
 * Platform note: setup stores the optional dispatch credentials in
 * company_config, with environment variables retained as an operational
 * override for hosted tenants.
 */
async function readDispatchConfig(): Promise<StConfig> {
  const base = await readStConfig();
  const [cfgId, cfgSecret, cfgKey] = await Promise.all([
    getConfig('st_dispatch_client_id'),
    getConfig('st_dispatch_client_secret'),
    getConfig('st_dispatch_app_key'),
  ]);
  const clientId = cfgId ?? process.env.ST_DISPATCH_CLIENT_ID;
  const clientSecret = cfgSecret ?? process.env.ST_DISPATCH_CLIENT_SECRET;
  const appKey = cfgKey ?? process.env.ST_DISPATCH_APP_KEY;
  if (clientId && clientSecret && appKey) {
    return { ...base, clientId, clientSecret, appKey };
  }
  return base;
}

// Separate token cache per clientId — auth.ts caches a single token in
// module scope, which would cross-contaminate two credential sets.
const dispatchTokens = new Map<string, { token: string; expiresAt: number }>();

async function getDispatchToken(cfg: StConfig): Promise<string> {
  const now = Date.now();
  const cached = dispatchTokens.get(cfg.clientId);
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(cfg.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`ST dispatch auth failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  dispatchTokens.set(cfg.clientId, {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 900) * 1000,
  });
  return json.access_token;
}

function emptyAgg(): DeptCapacityAgg {
  return {
    openHours: 0,
    totalHours: 0,
    fullDayOpenHours: 0,
    fullDayTotalHours: 0,
    byClass: {},
    techsAvailable: 0,
    techsTotal: 0,
  };
}

function emptyClass(): ClassCapacity {
  return { openHours: 0, totalHours: 0, fullDayOpenHours: 0, fullDayTotalHours: 0 };
}

function roundClass(c: ClassCapacity): void {
  c.openHours = Math.round(c.openHours * 100) / 100;
  c.totalHours = Math.round(c.totalHours * 100) / 100;
  c.fullDayOpenHours = Math.round(c.fullDayOpenHours * 100) / 100;
  c.fullDayTotalHours = Math.round(c.fullDayTotalHours * 100) / 100;
}

/**
 * Remaining capacity per division for the day bounded by `dayStartUtc` /
 * `dayEndUtc`.
 *
 * "Remaining" is relative to now, which makes the result correct for any
 * day without a flag: today's figures exclude windows that have already
 * closed, while every slot on a future day is still ahead, so its open
 * hours are simply the whole day's unbooked hours.
 *
 * `buToDept` maps ST business-unit id → division code (post-merge). A slot's
 * BU group can span multiple divisions; its hours are split evenly across
 * the distinct mapped divisions (tech counts go to every mapped division —
 * the same crew serves them all).
 *
 * Returns `null` when the credentials lack Dispatch scope (403) or the call
 * fails — capacity is an enhancement, never a blocker.
 */
export async function fetchDayCapacity(args: {
  /** UTC instant for start of the business-local day. */
  dayStartUtc: string;
  /** UTC instant for start of the NEXT business-local day. */
  dayEndUtc: string;
  buToDept: Map<number, string | null>;
  /** BU id → crew class; enables the per-class capacity split when given. */
  buToClass?: Map<number, SourceClass>;
}): Promise<CapacitySnapshot | null> {
  let cfg: StConfig;
  try {
    cfg = await readDispatchConfig();
  } catch {
    return null;
  }

  let json: CapacityResponse;
  try {
    const token = await getDispatchToken(cfg);
    const res = await fetch(
      `${cfg.apiBase}/dispatch/v2/tenant/${cfg.tenantId}/capacity`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'ST-App-Key': cfg.appKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          startsOnOrAfter: args.dayStartUtc,
          endsOnOrBefore: args.dayEndUtc,
          skillBasedAvailability: false,
        }),
        // Capacity is advisory. Never let a stalled Dispatch request consume
        // the appointments route's full 60-second execution budget.
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (res.status === 401) invalidateAccessToken();
    if (!res.ok) {
      console.warn(`[capacity] ST capacity call failed: ${res.status}`);
      return null;
    }
    json = (await res.json()) as CapacityResponse;
  } catch (err) {
    console.warn('[capacity] ST capacity call errored', err);
    return null;
  }

  const nowMs = Date.now();
  const byDept = new Map<string, DeptCapacityAgg>();
  const availTechsByDept = new Map<string, Set<number>>();
  const allTechsByDept = new Map<string, Set<number>>();
  const availTechsAll = new Set<number>();
  const allTechsAll = new Set<number>();
  const total = emptyAgg();

  for (const slot of json.availabilities ?? []) {
    // Which crew classes each division contributes to this slot's BU group —
    // drives both the division list and the per-class split of its share.
    const deptClasses = new Map<string, Set<SourceClass>>();
    for (const id of slot.businessUnitIds ?? []) {
      const dept = args.buToDept.get(id);
      if (dept == null) continue;
      let classes = deptClasses.get(dept);
      if (!classes) deptClasses.set(dept, (classes = new Set()));
      const cls = args.buToClass?.get(id);
      if (cls) classes.add(cls);
    }
    const depts = Array.from(deptClasses.keys());
    if (depts.length === 0) continue;

    // Full-day figures take every window; the headline remaining figures
    // only count capacity still ahead of us — a wide-open 8-11am window is
    // useless at 2pm, but it still belongs to the day's physical envelope.
    const endMs = Date.parse(slot.endUtc ?? slot.end ?? '');
    const stillAhead = Number.isFinite(endMs) && endMs > nowMs;

    const open = Number(slot.openAvailability ?? 0);
    const tot = Number(slot.totalAvailability ?? 0);
    total.fullDayOpenHours += open;
    total.fullDayTotalHours += tot;
    if (stillAhead) {
      total.openHours += open;
      total.totalHours += tot;
    }

    for (const dept of depts) {
      const agg = byDept.get(dept) ?? emptyAgg();
      const shareOpen = open / depts.length;
      const shareTot = tot / depts.length;
      agg.fullDayOpenHours += shareOpen;
      agg.fullDayTotalHours += shareTot;
      if (stillAhead) {
        agg.openHours += shareOpen;
        agg.totalHours += shareTot;
      }
      const classes = deptClasses.get(dept)!;
      for (const cls of classes) {
        const c = agg.byClass[cls] ?? emptyClass();
        c.fullDayOpenHours += shareOpen / classes.size;
        c.fullDayTotalHours += shareTot / classes.size;
        if (stillAhead) {
          c.openHours += shareOpen / classes.size;
          c.totalHours += shareTot / classes.size;
        }
        agg.byClass[cls] = c;
      }
      byDept.set(dept, agg);
    }

    // Tech availability keeps its remaining-today meaning.
    if (!stillAhead) continue;
    for (const t of slot.technicians ?? []) {
      allTechsAll.add(t.id);
      const available = (t.status ?? '').toLowerCase() === 'available';
      if (available) availTechsAll.add(t.id);
      for (const dept of depts) {
        let all = allTechsByDept.get(dept);
        if (!all) allTechsByDept.set(dept, (all = new Set()));
        all.add(t.id);
        if (available) {
          let avail = availTechsByDept.get(dept);
          if (!avail) availTechsByDept.set(dept, (avail = new Set()));
          avail.add(t.id);
        }
      }
    }
  }

  for (const [dept, agg] of byDept) {
    agg.openHours = Math.round(agg.openHours * 100) / 100;
    agg.totalHours = Math.round(agg.totalHours * 100) / 100;
    agg.fullDayOpenHours = Math.round(agg.fullDayOpenHours * 100) / 100;
    agg.fullDayTotalHours = Math.round(agg.fullDayTotalHours * 100) / 100;
    // Company-wide class totals roll up from the division shares.
    for (const [cls, c] of Object.entries(agg.byClass) as [SourceClass, ClassCapacity][]) {
      roundClass(c);
      const t = total.byClass[cls] ?? emptyClass();
      t.openHours += c.openHours;
      t.totalHours += c.totalHours;
      t.fullDayOpenHours += c.fullDayOpenHours;
      t.fullDayTotalHours += c.fullDayTotalHours;
      total.byClass[cls] = t;
    }
    agg.techsAvailable = availTechsByDept.get(dept)?.size ?? 0;
    agg.techsTotal = allTechsByDept.get(dept)?.size ?? 0;
  }
  total.openHours = Math.round(total.openHours * 100) / 100;
  total.totalHours = Math.round(total.totalHours * 100) / 100;
  total.fullDayOpenHours = Math.round(total.fullDayOpenHours * 100) / 100;
  total.fullDayTotalHours = Math.round(total.fullDayTotalHours * 100) / 100;
  for (const c of Object.values(total.byClass)) roundClass(c);
  total.techsAvailable = availTechsAll.size;
  total.techsTotal = allTechsAll.size;

  return { byDept, total };
}

/**
 * Capacity for each business-local day in `days`, keyed by ISO date.
 *
 * One request per day rather than a single ranged request: the per-day call
 * is the shape already proven in production, and it keeps a day that fails
 * or lacks a board from taking the rest of the window down with it. Days
 * whose call fails are simply absent from the map, so callers render them
 * without capacity instead of showing a zero that would read as "fully
 * booked".
 *
 * The first day is awaited alone so the shared dispatch token is cached
 * before the remaining days go out together. A first-day failure does not
 * suppress future days because transient provider errors can be day-specific.
 */
export async function fetchCapacityByDay(args: {
  /** Business-local ISO dates (YYYY-MM-DD). */
  days: readonly string[];
  buToDept: Map<number, string | null>;
  buToClass?: Map<number, SourceClass>;
}): Promise<Map<string, CapacitySnapshot>> {
  const out = new Map<string, CapacitySnapshot>();
  if (args.days.length === 0) return out;
  const tz = await getBusinessTz();

  const forDay = (day: string) =>
    fetchDayCapacity({
      dayStartUtc: localDayStartUTC(day, 0, tz),
      dayEndUtc: localDayStartUTC(day, 1, tz),
      buToDept: args.buToDept,
      buToClass: args.buToClass,
    }).catch(() => null);

  const [first, ...rest] = args.days;
  const firstSnap = await forDay(first);
  if (firstSnap) out.set(first, firstSnap);

  const restSnaps = await Promise.all(rest.map(forDay));
  rest.forEach((day, i) => {
    const snap = restSnaps[i];
    if (snap) out.set(day, snap);
  });
  return out;
}
