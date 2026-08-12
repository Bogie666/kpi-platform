/**
 * Pure helpers for the live ServiceTitan pipeline-revenue calculation.
 *
 * Pipeline is intentionally a forward-looking, month-end measure: from the
 * tenant-local current day through the end of that same local calendar month.
 */

/** Last local calendar day of the month containing `today` (YYYY-MM-DD). */
export function endOfMonthISO(today: string): string {
  const [year, month] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Pipeline is always the tenant-local current day through current month end. */
export function pipelineWindow(today: string): { start: string; end: string } {
  return { start: today, end: endOfMonthISO(today) };
}

/** ST job lifecycle states included by the report-aligned pipeline metric. */
export function isPipelineJobStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? '').replace(/[\s_-]/g, '').toLowerCase();
  return normalized === 'scheduled' || normalized === 'inprogress';
}

/** Convert ServiceTitan's Job.total (dollars) to integer cents. */
export function jobTotalCents(total: number | string | null | undefined): number | null {
  if (total === null || total === undefined || total === '') return null;
  const dollars = typeof total === 'number' ? total : Number(total);
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : null;
}
