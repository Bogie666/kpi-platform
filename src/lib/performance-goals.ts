/** Canonical targets use integer cents, basis points (100 bps = 1%), or counts.
 * Performance goals are separate from financial budget/pacing calculations.
 */
export const PERFORMANCE_METRICS = {
  revenue: { label: 'Total sales (ServiceTitan TotalSales, not invoice Revenue)', unit: 'cents', kind: 'flow' },
  close_rate: { label: 'Close rate (ClosedOpportunities / SalesOpportunity)', unit: 'bps', kind: 'rate' },
  avg_ticket: { label: 'Average ticket (ServiceTitan TotalJobAverage)', unit: 'cents', kind: 'rate' },
  jobs: { label: 'Completed jobs', unit: 'count', kind: 'flow' },
  opportunities: { label: 'Sales opportunities', unit: 'count', kind: 'flow' },
  memberships_sold: { label: 'Memberships sold by technician', unit: 'count', kind: 'flow' },
  active_memberships: { label: 'Active memberships (stock at period end)', unit: 'count', kind: 'stock' },
  new_memberships: { label: 'New memberships (starts during period)', unit: 'count', kind: 'flow' },
  // Preserve the existing general targets editor vocabulary. New membership
  // editors never create this ambiguous legacy metric.
  memberships: { label: 'Memberships (legacy)', unit: 'count', kind: 'flow' },
} as const;
export type PerformanceMetric = keyof typeof PERFORMANCE_METRICS;
export const TECHNICIAN_GOAL_METRICS: PerformanceMetric[] = ['revenue', 'close_rate', 'avg_ticket', 'jobs', 'opportunities', 'memberships_sold'];
export const MEMBERSHIP_GOAL_METRICS: PerformanceMetric[] = ['active_memberships', 'new_memberships'];
export interface PerformanceTargetRow {
  id: number;
  metric: string;
  scope: string;
  scopeValue: string | null;
  effectiveFrom: string;
  effectiveTo: string;
  targetValue: number;
  unit: string;
  updatedAt: Date | string;
}
export interface PerformanceGoal {
  value: number;
  fullValue: number;
  effectiveFrom: string;
  effectiveTo: string;
  sourceScope: string;
  sourceLabel: string;
}
export interface GoalScope { scope: string; scopeValue: string | null }
const DAY = 86_400_000;
export function validGoalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function goalWindowsOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}
function dayCount(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1;
}
function metricInfo(metric: string) {
  return Object.prototype.hasOwnProperty.call(PERFORMANCE_METRICS, metric)
    ? PERFORMANCE_METRICS[metric as PerformanceMetric] : null;
}
/**
 * Pick the first specificity with an applicable target. Within that scope,
 * latest effective start wins, then latest update, then highest id. This also
 * makes legacy overlapping/duplicate data deterministic, independent of SQL order.
 * A result always describes ONE configured window, not an invented combination
 * of role and employee goals. Consumers must show its effective window and must
 * not calculate whole-period attainment when that window only partially covers
 * the actuals window. Flow values are prorated by inclusive UTC calendar days;
 * rates and stocks retain their full value. Stock goals must apply at period end.
 */
export function resolvePerformanceGoal(
  rows: readonly PerformanceTargetRow[], metric: string, from: string, to: string,
  scopes: Array<{ scope: string; scopeValue: string | null }>,
): PerformanceGoal | null {
  const info = metricInfo(metric);
  if (!info || !validGoalDate(from) || !validGoalDate(to) || from > to) return null;
  for (const scope of scopes) {
    const candidates = rows.filter((row) => row.metric === metric && row.scope === scope.scope &&
      row.scopeValue === scope.scopeValue && row.unit === info.unit &&
      Number.isSafeInteger(row.targetValue) && row.targetValue >= 0 &&
      (info.unit !== 'bps' || row.targetValue <= 10000) &&
      validGoalDate(row.effectiveFrom) && validGoalDate(row.effectiveTo) && row.effectiveFrom <= row.effectiveTo &&
      goalWindowsOverlap(from, to, row.effectiveFrom, row.effectiveTo) &&
      (info.kind !== 'stock' || (row.effectiveFrom <= to && to <= row.effectiveTo)));
    candidates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) ||
      ((new Date(b.updatedAt).getTime() || 0) - (new Date(a.updatedAt).getTime() || 0)) || b.id - a.id);
    const row = candidates[0];
    if (!row) continue;
    const overlapFrom = from > row.effectiveFrom ? from : row.effectiveFrom;
    const overlapTo = to < row.effectiveTo ? to : row.effectiveTo;
    const value = info.kind === 'flow'
      ? row.targetValue * dayCount(overlapFrom, overlapTo) / dayCount(row.effectiveFrom, row.effectiveTo)
      : row.targetValue;
    return {
      value, fullValue: row.targetValue, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
      sourceScope: row.scope,
      sourceLabel: row.scope === 'company' ? 'Company-wide' : `${row.scope === 'employee' ? 'Employee override' : row.scope === 'role' ? 'Role default' : 'Department'}: ${row.scopeValue}`,
    };
  }
  return null;
}
export function performanceGoalAttainment(actual: number, goal: number | null | undefined): number | null {
  return goal != null && goal > 0 && Number.isFinite(actual) && Number.isFinite(goal) ? actual / goal * 100 : null;
}
export interface GoalInput {
  id?: number;
  metric: PerformanceMetric;
  scope: 'company' | 'department' | 'role' | 'employee';
  scopeValue: string | null;
  effectiveFrom: string;
  effectiveTo: string;
  targetValue: number;
  unit: 'cents' | 'bps' | 'count';
  notes?: string | null;
}
export interface GoalValidationContext { roleCodes: string[]; employeeIds: number[]; departmentCodes: string[] }
/** Pure validation shared by the API and independent tests. Scope lists MUST
 * come from this deployment's database, never a client supplied roster. */
export function validatePerformanceGoalInput(input: unknown, context: GoalValidationContext): { value: GoalInput } | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Expected a goal object' };
  const body = input as Record<string, unknown>;
  const info = typeof body.metric === 'string' ? metricInfo(body.metric) : null;
  if (!info) return { error: 'Unsupported goal metric' };
  if (!['company', 'department', 'role', 'employee'].includes(String(body.scope))) return { error: 'Invalid scope' };
  const scopeValue = body.scopeValue ?? null;
  if (body.scope === 'company' && scopeValue !== null) return { error: 'Company scope requires a null scopeValue' };
  if (body.scope !== 'company' && (typeof scopeValue !== 'string' || !scopeValue.trim())) return { error: 'This scope requires a scopeValue' };
  if (MEMBERSHIP_GOAL_METRICS.includes(body.metric as PerformanceMetric) && body.scope !== 'company') return { error: 'Membership stock and new-start goals require company scope' };
  if ((body.scope === 'role' || body.scope === 'employee') && !TECHNICIAN_GOAL_METRICS.includes(body.metric as PerformanceMetric)) return { error: 'Metric is not a technician goal' };
  if (body.scope === 'role' && !context.roleCodes.includes(scopeValue as string)) return { error: 'Unknown or inactive technician role' };
  if (body.scope === 'employee' && (typeof scopeValue !== 'string' || !/^[1-9]\d*$/.test(scopeValue) || !Number.isSafeInteger(Number(scopeValue)) || !context.employeeIds.includes(Number(scopeValue)))) return { error: 'Unknown or ineligible ServiceTitan technician id' };
  if (body.scope === 'department' && !context.departmentCodes.includes(scopeValue as string)) return { error: 'Unknown or inactive department' };
  if (!validGoalDate(body.effectiveFrom) || !validGoalDate(body.effectiveTo) || body.effectiveFrom > body.effectiveTo) return { error: 'Use valid effective dates with start on or before end' };
  if (body.unit !== info.unit) return { error: `Metric requires ${info.unit}` };
  if (typeof body.targetValue !== 'number' || !Number.isSafeInteger(body.targetValue) || body.targetValue < 0) return { error: 'Goal must be a nonnegative safe integer in canonical units' };
  if (info.unit === 'bps' && body.targetValue > 10000) return { error: 'Close rate must be between 0% and 100%' };
  if (body.id !== undefined && (typeof body.id !== 'number' || !Number.isSafeInteger(body.id) || body.id <= 0)) return { error: 'Invalid target id' };
  if (body.notes !== undefined && body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 2000)) return { error: 'Notes must be text of at most 2000 characters' };
  return { value: { ...body, scopeValue } as unknown as GoalInput };
}
/** Exact key upserts and a date-window edit of the same id exclude their own
 * row; all other inclusive overlaps for the same metric/scope are conflicts. */
export function conflictingPerformanceGoals(rows: readonly PerformanceTargetRow[], input: GoalInput): PerformanceTargetRow[] {
  return rows.filter((row) => row.id !== input.id && row.metric === input.metric && row.scope === input.scope &&
    row.scopeValue === input.scopeValue &&
    !(input.id === undefined && row.effectiveFrom === input.effectiveFrom && row.effectiveTo === input.effectiveTo) &&
    goalWindowsOverlap(row.effectiveFrom, row.effectiveTo, input.effectiveFrom, input.effectiveTo));
}
/** Convert dollars / displayed percent to canonical units without accepting
 * empty text, exponent notation, fractional counts, or extra precision. */
export function goalInputToCanonical(text: string, unit: GoalInput['unit']): number | null {
  if (!(unit === 'count' ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/).test(text)) return null;
  const value = Math.round(Number(text) * (unit === 'count' ? 1 : 100));
  return Number.isSafeInteger(value) && (unit !== 'bps' || value <= 10000) ? value : null;
}
export function formatPerformanceGoal(value: number, unit: string): string {
  if (unit === 'cents') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
  if (unit === 'bps') return `${(value / 100).toFixed(2)}%`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
