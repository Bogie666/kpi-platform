/**
 * Source class — how work arrived: pre-scheduled maintenance, unplanned
 * demand service, or an install/sales run.
 *
 * These classifiers were private to `daily-targets.ts`, which needs the
 * split because maintenance volume is largely pre-booked and the actionable
 * number for a day is demand calls. The appointments page wants the same
 * cut, so they live here and both callers share one definition — a second
 * copy would let the two pages disagree about what counts as a demand call.
 *
 * Pure string matching against tenant naming conventions; safe on both
 * client and server.
 */
import type { SourceClass } from '@/lib/targets/compute';

export type { SourceClass };

/** Display order: the demand/maintenance contrast is the point, so it leads. */
export const SOURCE_CLASSES: readonly SourceClass[] = ['demand', 'maintenance', 'install'] as const;

export const SOURCE_CLASS_LABEL: Record<SourceClass, string> = {
  demand: 'Demand',
  maintenance: 'Maintenance',
  install: 'Install / Sales',
};

/** One-line descriptions for the filter cards' tooltips. */
export const SOURCE_CLASS_HINT: Record<SourceClass, string> = {
  demand: 'Unplanned service — break/fix calls booked on demand',
  maintenance: 'Pre-scheduled recurring visits — tune-ups, PSI, ESI, club filters',
  install: 'Replacements, changeouts and sales/estimate runs',
};

/**
 * Semantic colours, deliberately not the per-division `--d-*` palette: class
 * is a different axis from division, and reusing trade colours here would
 * read as "Demand is an HVAC thing". Amber = unplanned, green = planned.
 */
export const SOURCE_CLASS_COLOR: Record<SourceClass, string> = {
  demand: 'var(--warning)',
  maintenance: 'var(--up)',
  install: 'var(--accent)',
};

/**
 * Source class from a BU name. The tenant names maintenance and install/
 * sales BUs explicitly (e.g. "LEX Maintenance", "LEX Sales"); everything
 * else is demand service.
 */
export function classifyBuName(name: string): SourceClass {
  const n = name.toLowerCase();
  if (/maint/.test(n)) return 'maintenance';
  if (/install|sales|replace/.test(n)) return 'install';
  return 'demand';
}

/**
 * Source class from a job-type name. Maintenance covers the pre-scheduled
 * tune-up style visits (HVAC maintenance, PSI plumbing inspections, ESI
 * electrical inspections); install covers replacements and sales/estimate
 * runs; the rest is demand service.
 */
export function classifyJobType(name: string): SourceClass {
  const n = name.toLowerCase();
  if (/maint|tune|psi|esi|inspect|club|filter/.test(n)) return 'maintenance';
  if (/install|replace|change\s?-?out|sales|estimate|quote|consult/.test(n)) return 'install';
  return 'demand';
}

/**
 * Class for one scheduled job. The job type is the stronger signal — it says
 * what the visit *is* — so it wins; the BU's class is the fallback for jobs
 * whose type is missing or unnamed in ServiceTitan. Centralized so the
 * appointments page and the daily-targets schedule classify identically.
 */
export function classifyScheduledWork(args: {
  jobTypeName: string | null | undefined;
  buName: string | null | undefined;
}): SourceClass {
  if (args.jobTypeName) return classifyJobType(args.jobTypeName);
  if (args.buName) return classifyBuName(args.buName);
  return 'demand';
}
