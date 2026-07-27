export interface ServiceTitanReportField {
  name: string;
  label?: string;
  dataType?: string;
}

export interface ServiceTitanReportPage {
  fields: ServiceTitanReportField[];
  data: unknown[][];
  hasMore?: boolean;
  totalCount?: number | null;
}

export interface RevenueBusinessUnit {
  id: number;
  name: string;
  departmentCode: string | null;
}

export interface CompletedRevenueRow {
  businessUnitId: number;
  departmentCode: string;
  reportDate: string;
  totalRevenueCents: number;
}

export interface ParsedCompletedRevenueReport {
  rows: CompletedRevenueRow[];
  rowsFetched: number;
  mappedTotalRevenueCents: number;
  completedRevenueCents: number;
  nonJobRevenueCents: number;
  adjustmentRevenueCents: number;
  excludedRevenueCents: number;
  unmappedRevenueBusinessUnits: string[];
}

export interface CompletedJobRevenueWeight {
  businessUnitId: number;
  reportDate: string;
  weightCents: number;
}

/**
 * Spread each BU's authoritative report total across calendar days using the
 * completed jobs' values as weights. The output always sums back to the exact
 * report cents for every BU. If a BU has revenue but no positive job weights
 * (for example pure non-job revenue), its amount lands on the window end.
 */
export function allocateRevenueByCompletedJobWeights(
  authoritativeRows: CompletedRevenueRow[],
  days: string[],
  weights: CompletedJobRevenueWeight[],
): CompletedRevenueRow[] {
  if (days.length === 0) return [];
  const daySet = new Set(days);
  const weightsByBu = new Map<number, Map<string, number>>();
  for (const w of weights) {
    if (!daySet.has(w.reportDate) || w.weightCents <= 0) continue;
    if (!weightsByBu.has(w.businessUnitId)) weightsByBu.set(w.businessUnitId, new Map());
    const byDay = weightsByBu.get(w.businessUnitId)!;
    byDay.set(w.reportDate, (byDay.get(w.reportDate) ?? 0) + w.weightCents);
  }

  const out: CompletedRevenueRow[] = [];
  for (const authoritative of authoritativeRows) {
    const allocated = new Map(days.map((day) => [day, 0]));
    const byDay = weightsByBu.get(authoritative.businessUnitId);
    const positiveWeights = byDay
      ? Array.from(byDay.entries()).filter(([, weight]) => weight > 0)
      : [];

    if (authoritative.totalRevenueCents !== 0) {
      if (positiveWeights.length === 0) {
        allocated.set(days[days.length - 1], authoritative.totalRevenueCents);
      } else {
        const totalWeight = positiveWeights.reduce((sum, [, weight]) => sum + weight, 0);
        let allocatedTotal = 0;
        let largestDay = positiveWeights[0][0];
        let largestWeight = positiveWeights[0][1];
        for (const [day, weight] of positiveWeights) {
          if (weight > largestWeight) {
            largestDay = day;
            largestWeight = weight;
          }
          const cents = Math.round(
            authoritative.totalRevenueCents * (weight / totalWeight),
          );
          allocated.set(day, cents);
          allocatedTotal += cents;
        }
        // Rounding can leave a few cents. Put the residual on the highest-value
        // completion day so every BU ties exactly to the authoritative report.
        allocated.set(
          largestDay,
          (allocated.get(largestDay) ?? 0) +
            (authoritative.totalRevenueCents - allocatedTotal),
        );
      }
    }

    for (const day of days) {
      out.push({
        businessUnitId: authoritative.businessUnitId,
        departmentCode: authoritative.departmentCode,
        reportDate: day,
        totalRevenueCents: allocated.get(day) ?? 0,
      });
    }
  }
  return out;
}

export function normalizeBusinessUnitName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function toCents(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Parse one day's saved Business Unit Dashboard report.
 *
 * All mapped BUs are emitted, including zero-revenue rows. This is important:
 * an upsert must replace stale invoice-basis values with zero when ST reports
 * no completed-basis revenue for a BU/day.
 */
export function parseCompletedRevenueReport(
  page: ServiceTitanReportPage,
  reportDate: string,
  businessUnitList: RevenueBusinessUnit[],
  excludedBusinessUnitNames: ReadonlySet<string> = new Set(),
): ParsedCompletedRevenueReport {
  const fields = page.fields ?? [];
  const names = fields.map((f) => f.name);
  const nameIdx = names.indexOf('Name');
  const totalIdx = names.indexOf('TotalRevenue');
  const completedIdx = names.indexOf('CompletedRevenue');
  const nonJobIdx = names.indexOf('NonJobRevenue');
  const adjustmentIdx = names.indexOf('AdjustmentRevenue');

  if (nameIdx < 0 || totalIdx < 0) {
    throw new Error(
      `ST report schema changed: required fields missing (received: ${names.join(', ')})`,
    );
  }
  if (!Array.isArray(page.data) || page.data.length === 0) {
    throw new Error('ST completed-revenue report returned no rows');
  }

  const mappedByName = new Map<
    string,
    { id: number; departmentCode: string; totalRevenueCents: number }
  >();
  for (const bu of businessUnitList) {
    if (!bu.departmentCode) continue;
    const key = normalizeBusinessUnitName(bu.name);
    const prior = mappedByName.get(key);
    if (prior && prior.id !== bu.id) {
      throw new Error(`Duplicate normalized business-unit name: ${bu.name}`);
    }
    mappedByName.set(key, {
      id: bu.id,
      departmentCode: bu.departmentCode,
      totalRevenueCents: 0,
    });
  }

  let completedRevenueCents = 0;
  let nonJobRevenueCents = 0;
  let adjustmentRevenueCents = 0;
  let excludedRevenueCents = 0;
  const unmapped = new Set<string>();

  for (const rawRow of page.data) {
    const rawName = rawRow[nameIdx];
    const displayName = rawName == null ? '' : String(rawName);
    const normalizedName = normalizeBusinessUnitName(displayName);
    const totalRevenueCents = toCents(rawRow[totalIdx]);

    if (excludedBusinessUnitNames.has(normalizedName)) {
      excludedRevenueCents += totalRevenueCents;
      continue;
    }

    const mapped = mappedByName.get(normalizedName);
    if (!mapped) {
      if (totalRevenueCents !== 0) unmapped.add(displayName.trim() || '(blank)');
      continue;
    }

    mapped.totalRevenueCents += totalRevenueCents;
    if (completedIdx >= 0) completedRevenueCents += toCents(rawRow[completedIdx]);
    if (nonJobIdx >= 0) nonJobRevenueCents += toCents(rawRow[nonJobIdx]);
    if (adjustmentIdx >= 0) adjustmentRevenueCents += toCents(rawRow[adjustmentIdx]);
  }

  const rows = Array.from(mappedByName.values()).map((bu) => ({
    businessUnitId: bu.id,
    departmentCode: bu.departmentCode,
    reportDate,
    totalRevenueCents: bu.totalRevenueCents,
  }));

  return {
    rows,
    rowsFetched: page.data.length,
    mappedTotalRevenueCents: rows.reduce((sum, row) => sum + row.totalRevenueCents, 0),
    completedRevenueCents,
    nonJobRevenueCents,
    adjustmentRevenueCents,
    excludedRevenueCents,
    unmappedRevenueBusinessUnits: Array.from(unmapped).sort(),
  };
}
