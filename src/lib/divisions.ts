/**
 * Division display model — merges and name overrides applied at *query time*.
 *
 * Why query-time rather than a data migration: the business-unit sync
 * overwrites `business_units.department_code` from ServiceTitan on every run,
 * so any manual remap there would be clobbered. Applying merges when we read
 * the warehouse keeps them stable, covers historical rows automatically, and
 * is reversible.
 *
 * PLATFORM NOTE: unlike the single-tenant LEX build (which hardcoded its
 * merges here), the platform ships with NO merges by default — every
 * division the setup wizard creates renders as its own row. Tenants that
 * want roll-ups (e.g. fold an Install division into its Service division)
 * define them in company_config under the `division_merges` /
 * `division_name_overrides` JSON keys; loadDivisionModel() hydrates this
 * module's maps at request time. Until configured, every helper below is an
 * identity function, which is the correct generic behavior.
 *
 * Pure data + helpers — safe to import from both client and server.
 */

/** Source division code → surviving (merged-into) division code. */
export const DIVISION_MERGES: Record<string, string> = {};

/** Display-name overrides for surviving divisions after a merge. */
export const DIVISION_NAME_OVERRIDES: Record<string, string> = {};

/**
 * Legacy → canonical department-code remap for `estimate_analysis`.
 *
 * A tenant whose ServiceTitan estimate-analysis vocabulary changed at some
 * point carries pre-cutover rows with legacy department codes that no longer
 * exist in the `departments` table, so Analyze silently drops them from the
 * per-department rollup. Normalizing at query time is reversible, covers
 * history, and needs no destructive backfill.
 *
 * PLATFORM NOTE: empty by default (identity) — a fresh tenant has no legacy
 * vocabulary. Tenants that need it set `legacy_department_codes` in
 * company_config as {"legacy_code": "canonical_code", ...};
 * loadDivisionModel() hydrates this map at request time.
 */
export const LEGACY_DEPARTMENT_CODES: Record<string, string> = {};

/**
 * Hydrate the merge/override maps from tenant config (server-side only).
 * Call once per request before using the helpers when tenant merges matter.
 */
export function applyDivisionModel(model: {
  merges?: Record<string, string>;
  nameOverrides?: Record<string, string>;
  legacyCodes?: Record<string, string>;
}): void {
  for (const k of Object.keys(DIVISION_MERGES)) delete DIVISION_MERGES[k];
  for (const k of Object.keys(DIVISION_NAME_OVERRIDES)) delete DIVISION_NAME_OVERRIDES[k];
  for (const k of Object.keys(LEGACY_DEPARTMENT_CODES)) delete LEGACY_DEPARTMENT_CODES[k];
  Object.assign(DIVISION_MERGES, model.merges ?? {});
  Object.assign(DIVISION_NAME_OVERRIDES, model.nameOverrides ?? {});
  Object.assign(LEGACY_DEPARTMENT_CODES, model.legacyCodes ?? {});
}

/** Collapse a division code to its surviving code (identity if not merged). */
export function mergeDivisionCode(code: string): string {
  return DIVISION_MERGES[code] ?? code;
}

/** True for codes that have been merged away and should not render as rows. */
export function isMergedAwayDivision(code: string): boolean {
  return code in DIVISION_MERGES;
}

/** Display name for a division, honoring overrides. */
export function divisionDisplayName(code: string, fallback: string): string {
  return DIVISION_NAME_OVERRIDES[code] ?? fallback;
}

/**
 * Full normalization for a raw estimate department code: legacy vocabulary
 * first (LEGACY_DEPARTMENT_CODES), then the display merges. Returns null for
 * empty/unknown codes. With no legacy codes configured this is just
 * mergeDivisionCode() — the correct generic default.
 */
export function normalizeDepartmentCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const canonical = LEGACY_DEPARTMENT_CODES[code] ?? code;
  return mergeDivisionCode(canonical);
}
