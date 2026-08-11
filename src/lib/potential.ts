/**
 * Potential-revenue (unsold estimates) math — pure, no DB — extracted from
 * the financial route so the de-dup and exclusion rules are unit-testable.
 *
 * Deliberate framing: this is *face value* — "money left on the table" for
 * the team to chase — not a close-rate-discounted forecast. The number is
 * kept honest structurally instead:
 *
 *   - One row per (job, division): good/better/best options on the same job
 *     collapse to the MINIMUM subtotal — the conservative floor, since a
 *     buyer who buys at all most likely picks the cheapest tier offered.
 *   - Jobs where ANY option was already won are excluded entirely. The sale
 *     is already in revenue; the losing sibling options aren't potential,
 *     they're phantom pipeline that double-counts against actuals.
 *   - Split by age: hot = created within `hotDays`, warm = older (the
 *     caller bounds the window at 30 days in the query).
 */

export interface UnsoldEstimateRow {
  estimateId: string;
  jobId: number | null;
  /** YYYY-MM-DD (may be a full ISO timestamp — only the date part is used). */
  createdOn: string;
  subtotalCents: number;
  /** Division code, already merged/canonicalized by the caller. Null = unmapped. */
  departmentCode: string | null;
}

export interface PotentialResult {
  totalCents: number;
  hotCents: number;
  warmCents: number;
  /** Distinct (job, division) opportunities contributing to the total. */
  jobCount: number;
  /** dept code → hot/warm cents. Unmapped-dept rows count in totals only. */
  byDept: Map<string, { hot: number; warm: number }>;
  /** Distinct jobs dropped because an option on them already sold. */
  soldJobsExcluded: number;
}

export function computePotential(
  rows: UnsoldEstimateRow[],
  /** Jobs with a won estimate — every unsold option on these is excluded. */
  wonJobIds: ReadonlySet<number>,
  /** ISO date boundary: created strictly after this is "hot". */
  hotAfter: string,
): PotentialResult {
  // Collapse to one entry per (job-or-estimate, dept), keeping the MIN
  // subtotal across options and the earliest createdOn for age bucketing.
  const perJob = new Map<string, { dept: string | null; created: string; minCents: number }>();
  const excludedJobs = new Set<number>();
  for (const r of rows) {
    if (r.jobId != null && wonJobIds.has(r.jobId)) {
      excludedJobs.add(r.jobId);
      continue;
    }
    const key = `${r.jobId ?? `est:${r.estimateId}`}|${r.departmentCode ?? ''}`;
    const existing = perJob.get(key);
    if (existing) {
      if (r.subtotalCents < existing.minCents) existing.minCents = r.subtotalCents;
      if (r.createdOn < existing.created) existing.created = r.createdOn;
    } else {
      perJob.set(key, {
        dept: r.departmentCode,
        created: r.createdOn,
        minCents: r.subtotalCents,
      });
    }
  }

  const byDept = new Map<string, { hot: number; warm: number }>();
  let hotCents = 0;
  let warmCents = 0;
  let jobCount = 0;
  for (const v of perJob.values()) {
    const isHot = v.created > hotAfter;
    jobCount += 1;
    if (isHot) hotCents += v.minCents;
    else warmCents += v.minCents;
    if (v.dept) {
      const prior = byDept.get(v.dept) ?? { hot: 0, warm: 0 };
      if (isHot) prior.hot += v.minCents;
      else prior.warm += v.minCents;
      byDept.set(v.dept, prior);
    }
  }

  return {
    totalCents: hotCents + warmCents,
    hotCents,
    warmCents,
    jobCount,
    byDept,
    soldJobsExcluded: excludedJobs.size,
  };
}
