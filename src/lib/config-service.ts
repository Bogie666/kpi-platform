/**
 * Config service — the read/write façade over the `company_config`,
 * `departments`, `business_units`, and `google_locations` tables.
 *
 * Every sync worker, every API route, and the setup wizard all flow
 * through this module so that hot config (ST creds, timezone, division
 * colors) can be served from a single in-process cache.
 *
 * Ports the older `kpi-dashboard` `lib/config-service.ts` to Drizzle and
 * fixes four bugs along the way (see inline `// FIX:` notes referenced
 * in §7.4 of the build spec).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  businessUnits,
  companyConfig,
  departments,
  employees,
  googleLocations,
  setupLog,
  technicianRoles,
} from '@/db/schema';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConfigType = 'string' | 'number' | 'boolean' | 'json';

export interface ConfigEntry {
  key: string;
  value: string | null;
  type: ConfigType;
  isSensitive: boolean;
}

export interface Division {
  code: string;
  name: string;
  colorToken: string;
  color: string | null;
  icon: string | null;
  hasTechnicians: boolean;
  hasComfortAdvisors: boolean;
  sortOrder: number;
  active: boolean;
}

export interface BusinessUnit {
  id: number;
  name: string;
  departmentCode: string | null;
  active: boolean;
}

export interface GoogleLocation {
  id: number;
  name: string;
  accountId: string;
  locationId: string;
  slug: string;
  isActive: boolean;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

// `getConfig()` is hot — every sync worker calls it for ST creds, every API
// route reads the timezone, layout.tsx reads company_name + every division
// color. A short module-scoped TTL keeps a dashboard load down to one DB
// roundtrip per key (mirrors the pattern in sync/servicetitan/auth.ts).
const CACHE_TTL_MS = 30_000;

let configCache: Map<string, ConfigEntry> | null = null;
let configCacheExpiresAt = 0;

/** Invalidate the in-process config cache. Call after any write. */
export function invalidateConfigCache(): void {
  configCache = null;
  configCacheExpiresAt = 0;
}

async function loadConfigCache(): Promise<Map<string, ConfigEntry>> {
  if (configCache && Date.now() < configCacheExpiresAt) return configCache;
  const rows = await db().select().from(companyConfig);
  const next = new Map<string, ConfigEntry>();
  // FIX (§7.4 #1): older code did `config[row.config_key] = result.rows[0].config_value`
  // which always read row 0, returning the same value for every key. Iterate
  // the loop variable instead.
  for (const row of rows) {
    next.set(row.configKey, {
      key: row.configKey,
      value: row.configValue,
      type: row.configType as ConfigType,
      isSensitive: row.isSensitive,
    });
  }
  configCache = next;
  configCacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return next;
}

// ─── company_config reads/writes ────────────────────────────────────────────

/** Get a single config value as a string. Returns null if unset. */
export async function getConfig(key: string): Promise<string | null> {
  const cache = await loadConfigCache();
  const entry = cache.get(key);
  return entry?.value ?? null;
}

/** Get a single config value coerced to its declared type. */
export async function getConfigTyped<T = string | number | boolean | unknown>(
  key: string,
): Promise<T | null> {
  const cache = await loadConfigCache();
  const entry = cache.get(key);
  if (!entry || entry.value == null) return null;
  return coerce(entry) as T;
}

/** All config keys as a `{ key: value }` map, with type coercion applied. */
export async function getAllConfig(opts: { includeSensitive?: boolean } = {}): Promise<
  Record<string, string | number | boolean | unknown | null>
> {
  const cache = await loadConfigCache();
  const out: Record<string, string | number | boolean | unknown | null> = {};
  for (const [key, entry] of cache) {
    if (!opts.includeSensitive && entry.isSensitive) continue;
    out[key] = entry.value == null ? null : coerce(entry);
  }
  return out;
}

/** Public, non-sensitive subset — safe to ship to the browser. */
export async function getPublicConfig(): Promise<
  Record<string, string | number | boolean | unknown | null>
> {
  return getAllConfig({ includeSensitive: false });
}

/** Set a single config value. Cache is invalidated after the write. */
export async function setConfig(
  key: string,
  value: string | number | boolean | null,
  opts: { type?: ConfigType; isSensitive?: boolean; updatedBy?: string } = {},
): Promise<void> {
  const stringValue = value == null ? null : String(value);
  await db()
    .insert(companyConfig)
    .values({
      configKey: key,
      configValue: stringValue,
      configType: opts.type ?? 'string',
      isSensitive: opts.isSensitive ?? false,
      updatedBy: opts.updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: companyConfig.configKey,
      // Don't overwrite type / isSensitive on update unless explicitly passed
      // (the pre-seed migration is the source of truth for those flags).
      set: {
        configValue: stringValue,
        updatedAt: new Date(),
        ...(opts.updatedBy ? { updatedBy: opts.updatedBy } : {}),
      },
    });
  invalidateConfigCache();
}

/** Bulk write — used by the wizard's "Save Step" actions. */
export async function setManyConfig(
  entries: Array<{ key: string; value: string | number | boolean | null }>,
  opts: { updatedBy?: string } = {},
): Promise<void> {
  if (entries.length === 0) return;
  // Loop is fine here — the wizard saves <20 keys per step and Drizzle's
  // multi-row upsert syntax is awkward with mixed types. Wrap in a single
  // cache invalidation at the end.
  for (const entry of entries) {
    await db()
      .insert(companyConfig)
      .values({
        configKey: entry.key,
        configValue: entry.value == null ? null : String(entry.value),
        configType: 'string',
        isSensitive: false,
        updatedBy: opts.updatedBy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: companyConfig.configKey,
        set: {
          configValue: entry.value == null ? null : String(entry.value),
          updatedAt: new Date(),
          ...(opts.updatedBy ? { updatedBy: opts.updatedBy } : {}),
        },
      });
  }
  invalidateConfigCache();
}

function coerce(entry: ConfigEntry): string | number | boolean | unknown {
  const v = entry.value;
  if (v == null) return null;
  switch (entry.type) {
    case 'number':
      return Number(v);
    case 'boolean':
      return v === 'true' || v === '1';
    case 'json':
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    default:
      return v;
  }
}

// ─── Divisions (departments) ────────────────────────────────────────────────

/** All divisions. By default returns only active rows. */
export async function getDivisions(includeInactive = false): Promise<Division[]> {
  const q = db()
    .select({
      code: departments.code,
      name: departments.name,
      colorToken: departments.colorToken,
      color: departments.color,
      icon: departments.icon,
      hasTechnicians: departments.hasTechnicians,
      hasComfortAdvisors: departments.hasComfortAdvisors,
      sortOrder: departments.sortOrder,
      active: departments.active,
    })
    .from(departments)
    .orderBy(departments.sortOrder);
  const rows = includeInactive ? await q : await q.where(eq(departments.active, true));
  return rows;
}

/**
 * BU id → Division map. Replaces the older `getDivisionBusinessUnitMapping`
 * which keyed by BU *name* (brittle on rename). Used by every sync worker
 * to bucket fact rows into the right division.
 */
export async function getDivisionsByBuId(): Promise<Map<number, Division>> {
  const rows = await db()
    .select({
      buId: businessUnits.id,
      code: departments.code,
      name: departments.name,
      colorToken: departments.colorToken,
      color: departments.color,
      icon: departments.icon,
      hasTechnicians: departments.hasTechnicians,
      hasComfortAdvisors: departments.hasComfortAdvisors,
      sortOrder: departments.sortOrder,
      active: departments.active,
    })
    .from(businessUnits)
    .leftJoin(departments, eq(departments.code, businessUnits.departmentCode))
    .where(eq(businessUnits.active, true));

  const out = new Map<number, Division>();
  for (const r of rows) {
    if (!r.code) continue; // BU explicitly mapped to null = drop
    out.set(r.buId, {
      code: r.code,
      name: r.name!,
      colorToken: r.colorToken!,
      color: r.color,
      icon: r.icon,
      hasTechnicians: r.hasTechnicians!,
      hasComfortAdvisors: r.hasComfortAdvisors!,
      sortOrder: r.sortOrder!,
      active: r.active!,
    });
  }
  return out;
}

/** Compact `BU id → division code` map — backwards-compat shape for the
 *  existing `loadBuToDeptMap()` consumers in the sync workers. */
export async function getBuToDeptCodeMap(): Promise<Map<number, string | null>> {
  const rows = await db()
    .select({ id: businessUnits.id, departmentCode: businessUnits.departmentCode })
    .from(businessUnits)
    .where(eq(businessUnits.active, true));
  return new Map(rows.map((r) => [r.id, r.departmentCode]));
}

// ─── Business units ─────────────────────────────────────────────────────────

/** All BUs from the DB. Active-only by default. */
export async function getBusinessUnits(includeInactive = false): Promise<BusinessUnit[]> {
  // FIX (§7.4 #3): older code never filtered by `is_active`, so deactivated
  // BUs leaked into the wizard's drag-and-drop list. Default to active-only
  // with an opt-in override.
  const q = db().select().from(businessUnits);
  const rows = includeInactive ? await q : await q.where(eq(businessUnits.active, true));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    departmentCode: r.departmentCode,
    active: r.active,
  }));
}

/**
 * Upsert a batch of BUs (typically from a fresh "fetch from ST" pull) and
 * soft-delete any DB rows whose `id` is not in the incoming set.
 *
 * FIX (§7.4 #4): older code did the upsert but left stale rows flagged
 * active forever — a BU deleted in ST would still show up as a live
 * mapping. The sweep below keeps the DB honest.
 */
export async function saveBusinessUnits(
  units: Array<{ id: number; name: string; departmentCode?: string | null }>,
): Promise<{ upserted: number; deactivated: number }> {
  if (units.length === 0) return { upserted: 0, deactivated: 0 };
  const database = db();
  let upserted = 0;
  for (const u of units) {
    await database
      .insert(businessUnits)
      .values({
        id: u.id,
        name: u.name,
        departmentCode: u.departmentCode ?? null,
        active: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: businessUnits.id,
        set: {
          name: u.name,
          // Only overwrite mapping if caller passed one — preserves prior
          // assignments when the wizard later resyncs from ST.
          ...(u.departmentCode !== undefined ? { departmentCode: u.departmentCode } : {}),
          active: true,
          updatedAt: new Date(),
        },
      });
    upserted++;
  }
  const incomingIds = units.map((u) => u.id);
  const deactivated = await database
    .update(businessUnits)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(businessUnits.active, true),
        // Exclude what we just upserted; everything else gets soft-deleted.
        sql`${businessUnits.id} NOT IN (${sql.join(
          incomingIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    )
    .returning({ id: businessUnits.id });
  return { upserted, deactivated: deactivated.length };
}

// ─── Google locations ───────────────────────────────────────────────────────

export async function getGoogleLocations(includeInactive = false): Promise<GoogleLocation[]> {
  const q = db().select().from(googleLocations).orderBy(googleLocations.id);
  const rows = includeInactive ? await q : await q.where(eq(googleLocations.isActive, true));
  return rows;
}

export async function saveGoogleLocations(
  locations: Array<{ name: string; accountId: string; locationId: string; slug: string }>,
): Promise<{ upserted: number }> {
  if (locations.length === 0) return { upserted: 0 };
  let upserted = 0;
  for (const loc of locations) {
    await db()
      .insert(googleLocations)
      .values({
        name: loc.name,
        accountId: loc.accountId,
        locationId: loc.locationId,
        slug: loc.slug,
        isActive: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: googleLocations.slug,
        set: {
          name: loc.name,
          accountId: loc.accountId,
          locationId: loc.locationId,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    upserted++;
  }
  return { upserted };
}

// ─── Divisions write (wizard step 3) ────────────────────────────────────────

export async function saveDivisions(
  divisions: Array<{
    code: string;
    name: string;
    color: string;
    icon?: string | null;
    hasTechnicians?: boolean;
    hasComfortAdvisors?: boolean;
    sortOrder?: number;
  }>,
): Promise<{ upserted: number }> {
  if (divisions.length === 0) return { upserted: 0 };
  let upserted = 0;
  for (const d of divisions) {
    await db()
      .insert(departments)
      .values({
        code: d.code,
        name: d.name,
        // colorToken is the CSS var; layout.tsx binds `--d-${code}` to the hex
        // at render time. Storing the canonical name keeps the schema NOT NULL.
        colorToken: `--d-${d.code}`,
        color: d.color,
        icon: d.icon ?? null,
        hasTechnicians: d.hasTechnicians ?? true,
        hasComfortAdvisors: d.hasComfortAdvisors ?? false,
        sortOrder: d.sortOrder ?? 0,
        active: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: departments.code,
        set: {
          name: d.name,
          color: d.color,
          icon: d.icon ?? null,
          hasTechnicians: d.hasTechnicians ?? true,
          hasComfortAdvisors: d.hasComfortAdvisors ?? false,
          sortOrder: d.sortOrder ?? 0,
          active: true,
          updatedAt: new Date(),
        },
      });
    upserted++;
  }
  return { upserted };
}

// ─── Technician roles ───────────────────────────────────────────────────────

export type RoleMetric = 'revenue' | 'avgTicket' | 'jobs' | 'closeRate';

export interface TechnicianRole {
  code: string;
  name: string;
  primaryMetric: RoleMetric;
  primaryMetricLabel: string;
  sortOrder: number;
  active: boolean;
}

export async function getTechnicianRoles(includeInactive = false): Promise<TechnicianRole[]> {
  const q = db()
    .select({
      code: technicianRoles.code,
      name: technicianRoles.name,
      primaryMetric: technicianRoles.primaryMetric,
      primaryMetricLabel: technicianRoles.primaryMetricLabel,
      sortOrder: technicianRoles.sortOrder,
      active: technicianRoles.active,
    })
    .from(technicianRoles)
    .orderBy(technicianRoles.sortOrder);
  const rows = includeInactive ? await q : await q.where(eq(technicianRoles.active, true));
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    primaryMetric: r.primaryMetric as RoleMetric,
    primaryMetricLabel: r.primaryMetricLabel,
    sortOrder: r.sortOrder,
    active: r.active,
  }));
}

/**
 * Save the complete list of roles. Upserts everything in `roles` and
 * soft-deletes any existing role whose `code` is not in the new list
 * (matches the BU / google-location pattern).
 */
export async function saveTechnicianRoles(
  roles: Array<{
    code: string;
    name: string;
    primaryMetric: RoleMetric;
    primaryMetricLabel: string;
    sortOrder: number;
  }>,
): Promise<{ upserted: number; deactivated: number }> {
  const database = db();
  let upserted = 0;
  for (const r of roles) {
    await database
      .insert(technicianRoles)
      .values({
        code: r.code,
        name: r.name,
        primaryMetric: r.primaryMetric,
        primaryMetricLabel: r.primaryMetricLabel,
        sortOrder: r.sortOrder,
        active: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: technicianRoles.code,
        set: {
          name: r.name,
          primaryMetric: r.primaryMetric,
          primaryMetricLabel: r.primaryMetricLabel,
          sortOrder: r.sortOrder,
          active: true,
          updatedAt: new Date(),
        },
      });
    upserted++;
  }
  let deactivated = 0;
  if (roles.length > 0) {
    const incomingCodes = roles.map((r) => r.code);
    const rows = await database
      .update(technicianRoles)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(technicianRoles.active, true),
          sql`${technicianRoles.code} NOT IN (${sql.join(
            incomingCodes.map((c) => sql`${c}`),
            sql`, `,
          )})`,
        ),
      )
      .returning({ code: technicianRoles.code });
    deactivated = rows.length;
  }
  return { upserted, deactivated };
}

// ─── Employees (role overrides) ─────────────────────────────────────────────

export interface EmployeeRow {
  id: number;
  serviceTitanId: number | null;
  name: string;
  roleCode: string | null;
  roleLocked: boolean;
  departmentCode: string | null;
  active: boolean;
}

export async function getEmployees(includeInactive = false): Promise<EmployeeRow[]> {
  const q = db()
    .select({
      id: employees.id,
      serviceTitanId: employees.serviceTitanId,
      name: employees.name,
      roleCode: employees.roleCode,
      roleLocked: employees.roleLocked,
      departmentCode: employees.departmentCode,
      active: employees.active,
    })
    .from(employees)
    .orderBy(employees.name);
  const rows = includeInactive ? await q : await q.where(eq(employees.active, true));
  return rows;
}

/**
 * Bulk-update role assignments + lock flags. Each entry can either lock
 * a specific role onto the employee or release them back to sync-driven
 * auto-bucketing.
 */
export async function setEmployeeRoles(
  updates: Array<{ id: number; roleCode: string | null; roleLocked: boolean }>,
): Promise<{ updated: number }> {
  let updated = 0;
  for (const u of updates) {
    await db()
      .update(employees)
      .set({
        // Don't clobber the original sync-derived role when the admin
        // unlocks — keep whatever's there; the next sync repopulates it.
        ...(u.roleLocked ? { roleCode: u.roleCode } : {}),
        roleLocked: u.roleLocked,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, u.id));
    updated++;
  }
  return { updated };
}

// ─── Technician report configuration ────────────────────────────────────────

export type TechnicianReportKpiField =
  | 'employeeId'
  | 'employeeName'
  | 'completedJobs'
  | 'completedRevenue'
  | 'opportunity'
  | 'salesOpportunity'
  | 'closedOpportunities'
  | 'closeRate'
  | 'totalSales'
  | 'totalJobAverage'
  | 'optionsPerOpportunity'
  | 'membershipsSold'
  | 'leadsSet'
  | 'totalLeadSales'
  | 'technicianBusinessUnit'
  | 'technicianTrade';

export type TechnicianReportColumnMapping = Partial<Record<TechnicianReportKpiField, string>>;

export interface TechnicianReportConfig {
  id: string;
  label: string;
  roleCode: string;
  departmentCode: string;
  categoryId: string;
  reportId: string;
  active: boolean;
  columnMapping: TechnicianReportColumnMapping;
}

const TECHNICIAN_REPORT_CONFIG_KEY = 'technician_report_configs';

function parseTechnicianReportConfigs(value: unknown): TechnicianReportConfig[] {
  if (!value) return [];
  const parsed = typeof value === 'string' ? safeJson(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const obj = r as Record<string, unknown>;
      const reportId = String(obj.reportId ?? '').trim();
      const categoryId = String(obj.categoryId ?? '').trim();
      const roleCode = String(obj.roleCode ?? '').trim();
      const departmentCode = String(obj.departmentCode ?? '').trim();
      if (!reportId || !categoryId || !roleCode || !departmentCode) return null;
      const label = String(obj.label ?? `${roleCode} ${departmentCode}`).trim();
      const mapping =
        obj.columnMapping && typeof obj.columnMapping === 'object'
          ? (obj.columnMapping as TechnicianReportColumnMapping)
          : {};
      return {
        id: String(obj.id ?? `${roleCode}:${departmentCode}:${reportId}`).trim(),
        label,
        roleCode,
        departmentCode,
        categoryId,
        reportId,
        active: obj.active !== false,
        columnMapping: mapping,
      } satisfies TechnicianReportConfig;
    })
    .filter((r): r is TechnicianReportConfig => r != null);
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function getTechnicianReportConfigs(): Promise<TechnicianReportConfig[]> {
  const raw = await getConfig(TECHNICIAN_REPORT_CONFIG_KEY);
  return parseTechnicianReportConfigs(raw);
}

export async function saveTechnicianReportConfigs(
  configs: TechnicianReportConfig[],
  opts: { updatedBy?: string } = {},
): Promise<void> {
  await db()
    .insert(companyConfig)
    .values({
      configKey: TECHNICIAN_REPORT_CONFIG_KEY,
      configValue: JSON.stringify(configs),
      configType: 'json',
      isSensitive: false,
      updatedBy: opts.updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: companyConfig.configKey,
      set: {
        configValue: JSON.stringify(configs),
        configType: 'json',
        isSensitive: false,
        updatedAt: new Date(),
        ...(opts.updatedBy ? { updatedBy: opts.updatedBy } : {}),
      },
    });
  invalidateConfigCache();
}

// ─── Setup state ────────────────────────────────────────────────────────────

export async function isSetupCompleted(): Promise<boolean> {
  const v = await getConfig('setup_completed');
  return v === 'true';
}

export async function getSetupStep(): Promise<number> {
  const v = await getConfig('setup_step');
  return v ? Number(v) : 1;
}

export async function setSetupStep(step: number): Promise<void> {
  await setConfig('setup_step', step, { type: 'number' });
}

export async function markSetupCompleted(): Promise<void> {
  await setConfig('setup_completed', true, { type: 'boolean' });
}

export async function logSetupStep(
  step: number,
  stepName: string,
  status: 'started' | 'completed' | 'failed' | 'skipped',
  details?: Record<string, unknown>,
): Promise<void> {
  await db().insert(setupLog).values({
    step,
    stepName,
    status,
    details: details ?? null,
  });
}

// ─── Cred helpers for sync workers ──────────────────────────────────────────

export interface ServiceTitanCreds {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  appKey: string;
}

/** Returns null if any of the four creds is missing — caller decides whether
 *  to throw (production sync) or skip (setup wizard not done yet). */
export async function getServiceTitanCreds(): Promise<ServiceTitanCreds | null> {
  const [tenantId, clientId, clientSecret, appKey] = await Promise.all([
    getConfig('st_tenant_id'),
    getConfig('st_client_id'),
    getConfig('st_client_secret'),
    getConfig('st_app_key'),
  ]);
  if (!tenantId || !clientId || !clientSecret || !appKey) return null;
  return { tenantId, clientId, clientSecret, appKey };
}

export interface GoogleCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export async function getGoogleCreds(): Promise<GoogleCreds | null> {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getConfig('google_client_id'),
    getConfig('google_client_secret'),
    getConfig('google_refresh_token'),
  ]);
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

// ─── Misc ───────────────────────────────────────────────────────────────────

/** Read-back helper for diagnostics — does the given BU id exist? */
export async function isKnownBusinessUnit(id: number): Promise<boolean> {
  const rows = await db()
    .select({ id: businessUnits.id })
    .from(businessUnits)
    .where(and(eq(businessUnits.id, id), eq(businessUnits.active, true)))
    .limit(1);
  return rows.length > 0;
}

// `inArray` is exported for tests / wizard helpers that build dynamic queries.
export { inArray };
