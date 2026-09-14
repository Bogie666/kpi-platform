/**
 * Open dispatch hours → jobs you could still book.
 *
 * The Targets page asks a demand question: how many jobs must we book to hit
 * today's revenue number. The Appointments page asks the supply question:
 * how many more jobs will physically fit alongside what's already on the
 * board. Same capacity feed, different arithmetic — this module is the
 * supply half.
 *
 * Call lengths come from targets/compute so both pages size a job the same
 * way. They are planning heuristics, not billing math: a maintenance run is
 * mostly checklist work, a demand call carries a diagnose-and-sell arc.
 * Present the result as an estimate.
 */
import { DEMAND_CALL_HOURS, MAINT_CALL_HOURS } from '@/lib/targets/compute';
import type { SourceClass } from '@/lib/kpi/source-class';

/** Tech-hours one job of this class typically occupies. */
export function callHoursFor(cls: SourceClass): number {
  // Install/sales runs are sized as demand calls, matching compute.ts's
  // dayInstallCallsCapacity.
  return cls === 'maintenance' ? MAINT_CALL_HOURS : DEMAND_CALL_HOURS;
}

/**
 * Whole jobs of `cls` that `openHours` could absorb. Floored — a half-filled
 * slot is not a bookable job, and rounding up would promise capacity that
 * isn't there.
 */
export function bookableJobs(openHours: number, cls: SourceClass): number {
  if (!Number.isFinite(openHours) || openHours <= 0) return 0;
  return Math.floor(openHours / callHoursFor(cls));
}

/** Per-class open hours, as the capacity API reports them. */
export type OpenHoursByClass = Partial<Record<SourceClass, number>>;

/**
 * Bookable jobs per class, plus the total across classes.
 *
 * The total sums the per-class figures rather than dividing total hours by
 * one blended call length: crews aren't interchangeable, so maintenance
 * hours can only absorb maintenance runs. Blending would overstate capacity
 * for any division whose open hours sit mostly with the shorter-call crew.
 */
export function bookableByClass(hours: OpenHoursByClass): {
  byClass: Record<SourceClass, number>;
  total: number;
} {
  const byClass: Record<SourceClass, number> = {
    demand: bookableJobs(hours.demand ?? 0, 'demand'),
    maintenance: bookableJobs(hours.maintenance ?? 0, 'maintenance'),
    install: bookableJobs(hours.install ?? 0, 'install'),
  };
  return { byClass, total: byClass.demand + byClass.maintenance + byClass.install };
}
