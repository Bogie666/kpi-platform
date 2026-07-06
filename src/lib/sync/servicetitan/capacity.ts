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

export interface DeptCapacityAgg {
  /** Unbooked tech-hours still ahead of now, today. */
  openHours: number;
  /** Total schedulable tech-hours still ahead of now, today. */
  totalHours: number;
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
 * Platform note: the main ST creds come from company_config (setup wizard);
 * optional dispatch-scope overrides are read from company_config keys
 * `st_dispatch_client_id` / `st_dispatch_client_secret` / `st_dispatch_app_key`
 * first, then env vars of the same (upper-case) names.
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
  return { openHours: 0, totalHours: 0, techsAvailable: 0, techsTotal: 0 };
}

/**
 * Today's remaining capacity per division.
 *
 * `buToDept` maps ST business-unit id → division code (post-merge). A slot's
 * BU group can span multiple divisions; its hours are split evenly across
 * the distinct mapped divisions (tech counts go to every mapped division —
 * the same crew serves them all).
 *
 * Returns `null` when the credentials lack Dispatch scope (403) or the call
 * fails — capacity is an enhancement, never a blocker.
 */
export async function fetchTodayCapacity(args: {
  /** UTC instant for start of the business-local day. */
  dayStartUtc: string;
  /** UTC instant for start of the NEXT business-local day. */
  dayEndUtc: string;
  buToDept: Map<number, string | null>;
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
    // Only capacity still ahead of us counts — a wide-open 8-11am window
    // is useless at 2pm.
    const endMs = Date.parse(slot.endUtc ?? slot.end ?? '');
    if (!Number.isFinite(endMs) || endMs <= nowMs) continue;

    const depts = Array.from(
      new Set(
        (slot.businessUnitIds ?? [])
          .map((id) => args.buToDept.get(id))
          .filter((d): d is string => d != null),
      ),
    );
    if (depts.length === 0) continue;

    const open = Number(slot.openAvailability ?? 0);
    const tot = Number(slot.totalAvailability ?? 0);
    total.openHours += open;
    total.totalHours += tot;

    for (const dept of depts) {
      const agg = byDept.get(dept) ?? emptyAgg();
      agg.openHours += open / depts.length;
      agg.totalHours += tot / depts.length;
      byDept.set(dept, agg);
    }

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
    agg.techsAvailable = availTechsByDept.get(dept)?.size ?? 0;
    agg.techsTotal = allTechsByDept.get(dept)?.size ?? 0;
  }
  total.openHours = Math.round(total.openHours * 100) / 100;
  total.totalHours = Math.round(total.totalHours * 100) / 100;
  total.techsAvailable = availTechsAll.size;
  total.techsTotal = allTechsAll.size;

  return { byDept, total };
}
