/**
 * Business-local date helpers. "Today" means today in the configured
 * business timezone, not UTC — otherwise `toISOString().slice(0,10)`
 * would roll the date over at 6/7pm local time, marking "tomorrow" as
 * "today" on the appointments page after dinner.
 *
 * The timezone is sourced from `company_config.timezone` (set by the
 * setup wizard). A literal fallback is kept so this module still works
 * before setup runs.
 */
import { getConfig } from '@/lib/config-service';

export const DEFAULT_BUSINESS_TZ = 'America/Chicago';

/** Read the configured business timezone, with fallback. */
export async function getBusinessTz(): Promise<string> {
  const tz = await getConfig('timezone');
  return tz && tz.trim() ? tz : DEFAULT_BUSINESS_TZ;
}

/** Today (YYYY-MM-DD) in the business timezone. */
export async function localTodayISO(now: Date = new Date()): Promise<string> {
  const tz = await getBusinessTz();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // 'en-CA' formats as YYYY-MM-DD already.
  return parts;
}

/** Shift a YYYY-MM-DD string by `days` (positive or negative). */
export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * UTC instant for midnight business-local time of `localDay` (+ optional day
 * shift). ST endpoints accept UTC instants; midnight CT is 05:00/06:00Z
 * depending on DST, so we probe the offset with Intl rather than hardcoding.
 */
export function localDayStartUTC(localDay: string, addDays = 0, tz: string = DEFAULT_BUSINESS_TZ): string {
  const [y, m, d] = localDay.split('-').map(Number);
  const naive = new Date(Date.UTC(y, m - 1, d + addDays, 0, 0, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  });
  const localHour = Number(fmt.format(naive));
  const offsetHours = (24 - localHour) % 24;
  return new Date(naive.getTime() + offsetHours * 3_600_000).toISOString();
}
