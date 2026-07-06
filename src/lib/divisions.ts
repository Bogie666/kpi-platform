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
 * Hydrate the merge/override maps from tenant config (server-side only).
 * Call once per request before using the helpers when tenant merges matter.
 */
export function applyDivisionModel(model: {
  merges?: Record<string, string>;
  nameOverrides?: Record<string, string>;
}): void {
  for (const k of Object.keys(DIVISION_MERGES)) delete DIVISION_MERGES[k];
  for (const k of Object.keys(DIVISION_NAME_OVERRIDES)) delete DIVISION_NAME_OVERRIDES[k];
  Object.assign(DIVISION_MERGES, model.merges ?? {});
  Object.assign(DIVISION_NAME_OVERRIDES, model.nameOverrides ?? {});
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
