/**
 * Centralized BU → division lookup.
 *
 * Replaces four identical `loadBuToDeptMap()` copies that used to live in
 * estimates.ts, jobs.ts, financial.ts, and technicians.ts. All callers
 * now import from here, so a future schema change touches one file.
 *
 * Two shapes exposed:
 *   - `loadBuToDeptCodeMap()` — Map<buId, divisionCode|null>. Drop-in
 *     replacement for the old per-file helper.
 *   - `loadBuToDivision()` — Map<buId, Division>. Used by the live
 *     appointments route (needs the human-readable name too).
 */
import {
  getBuToDeptCodeMap,
  getDivisionsByBuId,
  type Division,
} from '@/lib/config-service';

export async function loadBuToDeptCodeMap(): Promise<Map<number, string | null>> {
  return getBuToDeptCodeMap();
}

export async function loadBuToDivision(): Promise<Map<number, Division>> {
  return getDivisionsByBuId();
}
