import { NextResponse, type NextRequest } from 'next/server';
import { like } from 'drizzle-orm';
import { db } from '@/db/client';
import { kpiCache, targets } from '@/db/schema';
import { resolvePeriod } from '@/lib/period';
import { getBusinessTz } from '@/lib/time';
import { eventsInWindow, localDate, membershipSnapshotAsOf, parseMembershipHealth, shiftMembershipDate, type MembershipHealth } from '@/lib/membership-health';
import { resolvePerformanceGoal } from '@/lib/performance-goals';
import type { MembershipsResponse } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';
const COLORS = ['--d-hvac_service', '--d-hvac_sales', '--d-plumbing', '--d-commercial', '--d-hvac_maintenance'];

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const period = await resolvePeriod({ preset: params.get('preset'), from: params.get('from'), to: params.get('to') });
  const timezone = await getBusinessTz();
  const today = localDate(new Date(), timezone);
  const database = db();
  // A missing kpi_cache table is a schema failure, not a zero-valued KPI.
  // Propagate database/API errors. Parent deployment applies migration 0004.
  const [cached, goalRows] = await Promise.all([
    database.select().from(kpiCache).where(like(kpiCache.cacheKey, 'membership_health:%')),
    database.select().from(targets),
  ]);
  const snapshots = cached.map((row) => parseMembershipHealth(row.payload)).filter((snapshot): snapshot is MembershipHealth => snapshot !== null);
  // Stock and risk always describe one complete latest observed snapshot.
  // Never combine each plan's last nonzero row or infer past Active statuses.
  const current = membershipSnapshotAsOf(snapshots, today);
  const events = eventsInWindow(current, period.cur.from, period.cur.to);
  const weeklyTo = period.cur.to;
  const weeklyFrom = shiftMembershipDate(weeklyTo, -6);
  const week = eventsInWindow(current, weeklyFrom, weeklyTo);
  const comparison = (from: string, to: string) => {
    const snapshot = membershipSnapshotAsOf(snapshots, to);
    const counts = eventsInWindow(current, from, to);
    if (!snapshot || !counts) return undefined;
    return { active: snapshot.active, newMonth: counts.starts, churnMonth: counts.cancellations, netMonth: counts.starts - counts.cancellations - counts.expirations };
  };
  const months = monthKeysBefore(period.cur.to, 12);
  const historical = (month: string): number | null => {
    const inMonth = snapshots.filter((snapshot) => snapshot.snapshotDate.startsWith(month) && snapshot.snapshotDate <= period.cur.to);
    return inMonth.sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate))[0]?.active ?? null;
  };
  const companyScopes = [{ scope: 'company' as const, scopeValue: null }];
  const stockDate = current?.snapshotDate ?? today;
  const activeGoal = resolvePerformanceGoal(goalRows, 'active_memberships', stockDate, stockDate, companyScopes);
  const startsGoal = resolvePerformanceGoal(goalRows, 'new_memberships', period.cur.from, period.cur.to, companyScopes);
  const lySnapshot = membershipSnapshotAsOf(snapshots, period.ly.to);
  const lyByName = new Map(lySnapshot?.plans.map((plan) => [plan.name, plan.active]) ?? []);
  const body: MembershipsResponse = {
    active: current?.active ?? null,
    goal: activeGoal?.value ?? null,
    newGoal: startsGoal?.value ?? null,
    newMonth: events?.starts ?? null,
    churnMonth: events?.cancellations ?? null,
    expirations: events?.expirations ?? null,
    netMonth: events ? events.starts - events.cancellations - events.expirations : null,
    newWeek: week?.starts ?? null,
    suspended: current?.suspended ?? null,
    ly: comparison(period.ly.from, period.ly.to),
    ly2: comparison(period.ly2.from, period.ly2.to),
    history: months.map(historical),
    historyLabels: months,
    lyHistory: monthKeysBefore(period.ly.to, 12).map(historical),
    breakdown: current?.plans.map((plan, index) => {
      const planEvents = eventsInWindow({ snapshotDate: current.snapshotDate, events: plan.events }, period.cur.from, period.cur.to);
      return { tier: plan.name, count: plan.active, lyCount: lyByName.get(plan.name), colorToken: COLORS[index % COLORS.length], endDatePastDue: plan.endDatePastDue, endDate0To7: plan.endDate0To7, endDate8To30: plan.endDate8To30, endDate31To60: plan.endDate31To60, endDateOver60: plan.endDateOver60, noEndDate: plan.noEndDate, expiringUnder30: plan.expiringUnder30, suspended: plan.suspended, starts: planEvents?.starts ?? null, cancellations: planEvents?.cancellations ?? null, expirations: planEvents?.expirations ?? null };
    }) ?? [],
    health: current ? {
      endDatePastDue: current.endDatePastDue,
      endDate0To7: current.endDate0To7,
      endDate8To30: current.endDate8To30,
      endDate31To60: current.endDate31To60,
      endDateOver60: current.endDateOver60,
      noEndDate: current.noEndDate,
      expiringUnder30: current.expiringUnder30,
      expiringUnder30Pct: current.active > 0 ? current.expiringUnder30 / current.active * 100 : null,
      missingStartDate: current.missingStartDate,
      missingCancellationDate: current.missingCancellationDate,
      missingExpirationDate: current.missingExpirationDate,
    } : null,
    goalDetails: { active: activeGoal, starts: startsGoal },
    meta: { period: period.preset?.toUpperCase() ?? 'Custom', asOf: current?.fetchedAt ?? new Date().toISOString(), from: period.cur.from, to: period.cur.to, snapshotDate: current?.snapshotDate ?? null, timezone, weeklyFrom, weeklyTo, scope: 'company' },
  };
  return NextResponse.json({ data: body });
}
function monthKeysBefore(to: string, count: number): string[] {
  const [year, month] = to.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, month - count + index, 1)).toISOString().slice(0, 7));
}
