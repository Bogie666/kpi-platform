/**
 * /api/kpi/technicians — reads pre-aggregated rows from
 * `technician_period`, populated from ST's role-specific Tech KPI
 * reports. Handles period comparison (LY / LY2) by reading the same
 * role rows for the shifted windows.
 *
 * Sparklines are disabled in this path (the report is period-aggregated,
 * not daily). If we need them back, layer in a daily sync later and
 * fall back to technician_daily for the sparkline data only.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq, asc } from 'drizzle-orm';

import { db } from '@/db/client';
import { technicianPeriod, technicianRoles, employees } from '@/db/schema';
import { resolvePeriod, type Window } from '@/lib/period';
import type {
  CompareValue,
  Role,
  Technician,
  TechniciansResponse,
} from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

interface TechAgg {
  employeeId: number;
  employeeName: string;
  departmentCode: string | null;
  revenue: number;          // TotalSales (cents)
  opps: number;             // SalesOpportunity
  closed: number;           // ClosedOpportunities
  avgCloseBps: number;
  avgSaleCents: number;     // TotalSales / ClosedOpportunities
  avgTicketCents: number;   // TotalJobAverage
  options: number;          // OptionsPerOpportunity × 100
  jobs: number;             // CompletedJobs
  members: number;          // MembershipsSold
  flips: number;            // LeadsSet
  flipSalesCents: number;   // TotalLeadSales (cents)
}

function aggregateTechRows(rows: Array<typeof technicianPeriod.$inferSelect>): TechAgg[] {
  const byEmp = new Map<number, TechAgg>();
  for (const r of rows) {
    const empId = Number(r.employeeId);
    const revenue = Number(r.totalSalesCents);
    const opps = Number(r.salesOpportunity);
    const closed = Number(r.closedOpportunities);
    const existing = byEmp.get(empId);
    if (existing) {
      existing.revenue += revenue;
      existing.opps += opps;
      existing.closed += closed;
      existing.jobs += Number(r.completedJobs);
      existing.members += Number(r.membershipsSold);
      existing.flips += Number(r.leadsSet);
      existing.flipSalesCents += Number(r.totalLeadSalesCents);
      if (!existing.departmentCode && r.technicianBusinessUnit) existing.departmentCode = r.technicianBusinessUnit;
      if (Number(r.totalJobAverageCents ?? 0) > existing.avgTicketCents) {
        existing.avgTicketCents = Number(r.totalJobAverageCents ?? 0);
      }
      if (Number(r.optionsPerOpportunity ?? 0) > existing.options) {
        existing.options = Number(r.optionsPerOpportunity ?? 0);
      }
    } else {
      byEmp.set(empId, {
        employeeId: empId,
        employeeName: r.employeeName,
        departmentCode: r.technicianBusinessUnit,
        revenue,
        opps,
        closed,
        avgCloseBps: 0,
        avgSaleCents: 0,
        avgTicketCents: Number(r.totalJobAverageCents ?? 0),
        options: Number(r.optionsPerOpportunity ?? 0),
        jobs: Number(r.completedJobs),
        members: Number(r.membershipsSold),
        flips: Number(r.leadsSet),
        flipSalesCents: Number(r.totalLeadSalesCents),
      });
    }
  }
  for (const agg of byEmp.values()) {
    agg.avgSaleCents = agg.closed > 0 ? Math.round(agg.revenue / agg.closed) : 0;
    agg.avgCloseBps = agg.opps > 0 ? Math.round((agg.closed / agg.opps) * 10000) : 0;
  }
  return Array.from(byEmp.values());
}

/**
 * Map role_code → list of technicians. Pulls exactly matching
 * (role, period_start, period_end) rows. Multiple configured report
 * instances can feed one role, so rows are merged by technician.
 */
async function techsForWindow(roleCode: string, window: Window): Promise<TechAgg[]> {
  const database = db();
  const rows = await database
    .select()
    .from(technicianPeriod)
    .where(
      and(
        eq(technicianPeriod.roleCode, roleCode),
        eq(technicianPeriod.periodStart, window.from),
        eq(technicianPeriod.periodEnd, window.to),
      ),
    );
  return aggregateTechRows(rows);
}

/**
 * Combined view across every role for a window.
 */
async function techsForWindowAllRoles(window: Window): Promise<TechAgg[]> {
  const database = db();
  const rows = await database
    .select()
    .from(technicianPeriod)
    .where(
      and(
        eq(technicianPeriod.periodStart, window.from),
        eq(technicianPeriod.periodEnd, window.to),
      ),
    );
  return aggregateTechRows(rows);
}

function sortByRole(agg: TechAgg[], primary: Role['sortKey']): TechAgg[] {
  const key =
    primary === 'avgTicket' ? 'avgSaleCents' :
    primary === 'jobs' ? 'opps' :
    primary === 'closeRate' ? 'avgCloseBps' :
    'revenue';
  return agg.slice().sort((a, b) =>
    ((b as TechAgg)[key as keyof TechAgg] as number) -
    ((a as TechAgg)[key as keyof TechAgg] as number)
  );
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const roleCode = params.get('role') ?? 'comfort_advisor';

  const database = db();
  const roleRows = await database
    .select()
    .from(technicianRoles)
    .orderBy(asc(technicianRoles.sortOrder));
  const ALL_ROLE: Role = {
    code: 'all',
    name: 'All Technicians',
    primaryMetric: 'Total sales',
    sortKey: 'revenue',
  };
  const realRoles: Role[] = roleRows.map((r) => ({
    code: r.code,
    name: r.name,
    primaryMetric: r.primaryMetricLabel,
    sortKey: r.primaryMetric as Role['sortKey'],
  }));
  // ALL_ROLE is rendered separately by the sub-tab strip, so it gets
  // prepended to the list the API ships.
  const roles: Role[] = [ALL_ROLE, ...realRoles];
  const role = roles.find((r) => r.code === roleCode) ?? roles[0];

  const period = await resolvePeriod({
    preset: params.get('preset'),
    from: params.get('from'),
    to: params.get('to'),
  });

  const fetchWindow = (w: Window) =>
    role.code === 'all' ? techsForWindowAllRoles(w) : techsForWindow(role.code, w);
  const [cur, ly, ly2] = await Promise.all([
    fetchWindow(period.cur),
    fetchWindow(period.ly),
    fetchWindow(period.ly2),
  ]);

  const sorted = sortByRole(cur, role.sortKey);
  const employeeIds = sorted.map((t) => t.employeeId);
  const lyByEmp = new Map(ly.map((r) => [r.employeeId, r]));

  // Photos from employees dimension, keyed by normalized name (the
  // employees row id is an internal serial — it doesn't match the ST
  // TechnicianId we use as employeeId in technician_period). The admin
  // upload UI writes photo_url against normalized_name, so we lookup
  // here the same way.
  const photosByNorm = new Map<string, string | null>();
  if (employeeIds.length) {
    const empRows = await database
      .select({ normalizedName: employees.normalizedName, photoUrl: employees.photoUrl })
      .from(employees);
    for (const e of empRows) photosByNorm.set(e.normalizedName, e.photoUrl);
  }
  void employeeIds;
  const normName = (n: string): string =>
    n
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const technicians: Technician[] = sorted.map((t, i) => {
    const lyRow = lyByEmp.get(t.employeeId);
    const lyPrev = lyRow?.revenue ?? 0;
    const trend: Technician['trend'] = !lyRow
      ? 'flat'
      : t.revenue > lyPrev * 1.05
        ? 'up'
        : t.revenue < lyPrev * 0.95
          ? 'down'
          : 'flat';

    return {
      rank: i + 1,
      employeeId: t.employeeId,
      name: t.employeeName,
      departmentCode: t.departmentCode ?? 'hvac_maint_service',
      photoUrl: photosByNorm.get(normName(t.employeeName)) ?? null,
      revenue: t.revenue,
      ly: lyRow?.revenue,
      closeRate: t.avgCloseBps,
      lyCloseRate: lyRow?.avgCloseBps,
      opps: t.opps,
      lyOpps: lyRow?.opps,
      avgSale: t.avgSaleCents,
      lyAvgSale: lyRow?.avgSaleCents,
      avgTicket: t.avgTicketCents,
      lyAvgTicket: lyRow?.avgTicketCents,
      options: t.options,
      lyOptions: lyRow?.options,
      jobs: t.jobs,
      lyJobs: lyRow?.jobs,
      members: t.members,
      lyMembers: lyRow?.members,
      flips: t.flips,
      lyFlips: lyRow?.flips,
      flipSales: t.flipSalesCents,
      lyFlipSales: lyRow?.flipSalesCents,
      trend,
      // Sparklines require daily data; reports only give us aggregates.
      // Empty arrays keep the UI happy — the chart just renders flat.
      spark: [],
      lySpark: [],
    };
  });

  const sum = (arr: TechAgg[], pick: (a: TechAgg) => number) =>
    arr.reduce((s, a) => s + pick(a), 0);
  const avg = (arr: TechAgg[], pick: (a: TechAgg) => number) =>
    arr.length === 0 ? 0 : Math.round(arr.reduce((s, a) => s + pick(a), 0) / arr.length);

  // Team-level means use SUM(num)/SUM(denom) so volume is weighted, not
  // mean-of-ratios.
  const teamAvgSale = (rows: TechAgg[]) => {
    const totalRev = sum(rows, (a) => a.revenue);
    const totalClosed = sum(rows, (a) => a.closed);
    return totalClosed > 0 ? Math.round(totalRev / totalClosed) : 0;
  };
  const teamAvgTicket = (rows: TechAgg[]) => {
    const totalRev = sum(rows, (a) => a.revenue);
    const totalJobs = sum(rows, (a) => a.jobs);
    return totalJobs > 0 ? Math.round(totalRev / totalJobs) : 0;
  };

  const team: TechniciansResponse['team'] = {
    revenue: compareValue(
      sum(cur, (a) => a.revenue),
      sum(ly, (a) => a.revenue),
      sum(ly2, (a) => a.revenue),
      'cents',
    ),
    closeRate: compareValue(
      avg(cur, (a) => a.avgCloseBps),
      avg(ly, (a) => a.avgCloseBps),
      avg(ly2, (a) => a.avgCloseBps),
      'bps',
    ),
    avgSale: compareValue(
      teamAvgSale(cur),
      teamAvgSale(ly),
      teamAvgSale(ly2),
      'cents',
    ),
    avgTicket: compareValue(
      teamAvgTicket(cur),
      teamAvgTicket(ly),
      teamAvgTicket(ly2),
      'cents',
    ),
    oppsDone: compareValue(
      sum(cur, (a) => a.opps),
      sum(ly, (a) => a.opps),
      sum(ly2, (a) => a.opps),
      'count',
    ),
    jobsDone: compareValue(
      sum(cur, (a) => a.jobs),
      sum(ly, (a) => a.jobs),
      sum(ly2, (a) => a.jobs),
      'count',
    ),
  };

  // Attach the trailing-12-month revenue trend (this year + LY overlay) from
  // the monthly snapshot rows in technician_period. No-op until the monthly
  // backfill has run; the stats card shows an empty-state in the meantime.
  await attachMonthlyTrend(database, roleCode, technicians);

  const body: TechniciansResponse = {
    role,
    roles,
    team,
    technicians,
    meta: {
      period: period.preset ? period.preset.toUpperCase() : 'Custom',
      asOf: new Date().toISOString(),
      from: period.cur.from,
      to: period.cur.to,
    },
  };

  return NextResponse.json({ data: body });
}

function compareValue(
  value: number,
  ly: number | undefined,
  ly2: number | undefined,
  unit: CompareValue['unit'],
): CompareValue {
  return { value, ly, ly2, unit };
}

// suppress unused — Window kept for future daily-sparkline layering
void (null as Window | null);

/** Last calendar day of a month (UTC). */
function lastDayOfMonth(year: number, month1: number): string {
  const d = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A technician_period row is a "monthly snapshot" iff it spans exactly one
 *  calendar month (1st → last day). Filters out the dashboard's MTD/YTD/etc.
 *  windows that share the table. */
function isMonthlyBucket(periodStart: string, periodEnd: string): boolean {
  if (!periodStart.endsWith('-01')) return false;
  const [y, m] = periodStart.split('-').map(Number);
  return periodEnd === lastDayOfMonth(y, m);
}

function shiftMonthKey(key: string, deltaMonths: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Build each technician's `spark` (trailing-12-month revenue, this year) and
 * `lySpark` (the same months a year earlier) from monthly snapshot rows.
 * Mutates the passed technicians in place. Months with no data anywhere are
 * dropped from the leading edge so a short history doesn't render as a long
 * flat-zero line; a tech with all-zero values keeps an empty series so the
 * card shows its "trend not available" state instead of a flat line.
 */
async function attachMonthlyTrend(
  database: ReturnType<typeof db>,
  roleCode: string,
  technicians: Technician[],
): Promise<void> {
  if (technicians.length === 0) return;

  const rows = await database
    .select({
      employeeId: technicianPeriod.employeeId,
      periodStart: technicianPeriod.periodStart,
      periodEnd: technicianPeriod.periodEnd,
      totalSalesCents: technicianPeriod.totalSalesCents,
    })
    .from(technicianPeriod)
    .where(eq(technicianPeriod.roleCode, roleCode));

  const revByEmpMonth = new Map<number, Map<string, number>>();
  const monthsWithData = new Set<string>();
  for (const r of rows) {
    if (!isMonthlyBucket(r.periodStart, r.periodEnd)) continue;
    const mk = r.periodStart.slice(0, 7);
    monthsWithData.add(mk);
    let m = revByEmpMonth.get(r.employeeId);
    if (!m) {
      m = new Map();
      revByEmpMonth.set(r.employeeId, m);
    }
    m.set(mk, Number(r.totalSalesCents));
  }
  if (monthsWithData.size === 0) return;

  // Trailing 12 *completed* months, ending at last month — the in-progress
  // current month is excluded so the YoY overlay never compares a partial
  // month against a full one (its pacing lives on the financial hero card).
  const now = new Date();
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const anchorY = anchor.getUTCFullYear();
  const anchorM = anchor.getUTCMonth() + 1;
  const trailing: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(anchorY, anchorM - 1 - i, 1));
    trailing.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const months = trailing.filter((mk) => monthsWithData.has(mk));
  if (months.length < 2) return;

  for (const t of technicians) {
    const byMonth = revByEmpMonth.get(t.employeeId);
    if (!byMonth) continue;
    const spark = months.map((mk) => byMonth.get(mk) ?? 0);
    if (spark.some((v) => v > 0)) {
      t.spark = spark;
      t.sparkMonths = months;
    }
    const lySpark = months.map((mk) => byMonth.get(shiftMonthKey(mk, -12)) ?? 0);
    if (lySpark.some((v) => v > 0)) t.lySpark = lySpark;
  }
}
