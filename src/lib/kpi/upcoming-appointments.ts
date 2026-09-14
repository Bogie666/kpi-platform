import type { SourceClass } from '@/lib/kpi/source-class';

/** A minimal shape shared by appointment day buckets and total reconciliation. */
export interface AppointmentDayCount {
  count: number;
}

/**
 * Derive the appointment headline from the same day buckets shown in the UI.
 *
 * ServiceTitan can return active appointments that cannot be rendered because
 * they have no start, no job ID, or no matching job. Counting raw API rows made
 * the headline exceed every visible breakdown (issue #70).
 */
export function totalAppointmentsFromDays(days: readonly AppointmentDayCount[]): number {
  return days.reduce((total, day) => total + day.count, 0);
}

/** Day bucket seen as its per-BU, per-job-type rows. */
export interface AppointmentClassDay {
  byBu: ReadonlyArray<{
    jobTypes: ReadonlyArray<{ count: number; cls: SourceClass }>;
  }>;
}

/**
 * Derive the demand/maintenance/install split from the same rendered day
 * buckets as `totalAppointmentsFromDays`.
 *
 * Deriving rather than tallying during the ingest loop is the point: it makes
 * the split reconcile with the headline by construction, so the class totals
 * can't drift above the visible breakdowns the way the raw headline did in
 * issue #70.
 */
export function classTotalsFromDays(
  days: readonly AppointmentClassDay[],
): Record<SourceClass, number> {
  const totals: Record<SourceClass, number> = { demand: 0, maintenance: 0, install: 0 };
  for (const day of days) {
    for (const bu of day.byBu) {
      for (const t of bu.jobTypes) totals[t.cls] += t.count;
    }
  }
  return totals;
}
