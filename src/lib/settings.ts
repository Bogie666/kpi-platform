/**
 * Typed accessors over the app_settings key/value table.
 *
 * Pacing settings shape the intraday "Today · Daily pace" math on the
 * financial screen: the day target is spread over `workdayHours` starting at
 * `startHour` (business-local). Missing/invalid rows fall back to defaults so
 * the dashboard never breaks on a fresh DB.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { appSettings } from '@/db/schema';
import {
  DEFAULT_WORKDAY_HOURS,
  DEFAULT_WORKDAY_START_HOUR,
} from '@/lib/targets/intraday';

export const PACING_SETTINGS_KEY = 'pacing';

export interface PacingSettings {
  /** Length of the working day in hours, e.g. 10 for 8:00a–6:00p. */
  workdayHours: number;
  /** Workday start as an hour-of-day (business-local). 8 → 8:00 AM, 7.5 → 7:30. */
  startHour: number;
}

export const DEFAULT_PACING_SETTINGS: PacingSettings = {
  workdayHours: DEFAULT_WORKDAY_HOURS,
  startHour: DEFAULT_WORKDAY_START_HOUR,
};

function coerceNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Validate + clamp an arbitrary payload into a safe PacingSettings. */
export function sanitizePacingSettings(raw: unknown): PacingSettings {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const hours = coerceNumber(obj.workdayHours);
  const start = coerceNumber(obj.startHour);
  return {
    workdayHours:
      hours != null && hours > 0 && hours <= 24
        ? hours
        : DEFAULT_PACING_SETTINGS.workdayHours,
    startHour:
      start != null && start >= 0 && start < 24
        ? start
        : DEFAULT_PACING_SETTINGS.startHour,
  };
}

/** Read pacing settings, falling back to defaults on any miss or error. */
export async function getPacingSettings(): Promise<PacingSettings> {
  try {
    const rows = await db()
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, PACING_SETTINGS_KEY))
      .limit(1);
    if (!rows.length) return DEFAULT_PACING_SETTINGS;
    return sanitizePacingSettings(rows[0].value);
  } catch {
    // Table may not exist yet on an un-migrated DB — pacing still works on
    // defaults rather than 500ing the whole financial endpoint.
    return DEFAULT_PACING_SETTINGS;
  }
}
