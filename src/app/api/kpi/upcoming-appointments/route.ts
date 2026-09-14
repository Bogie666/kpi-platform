/**
 * /api/kpi/upcoming-appointments — quick view of scheduled appointments
 * for the next 7 days, grouped by department → job type. Live-computed
 * from ST on each request (small dataset, a few hundred rows max).
 */
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { businessUnits } from '@/db/schema';
import { collectResource } from '@/lib/sync/servicetitan/raw-client';
import { loadBuToDivision } from '@/lib/sync/servicetitan/bu-map';
import { classifyScheduledWork, type SourceClass } from '@/lib/kpi/source-class';
import { loadBuSourceClasses } from '@/lib/kpi/source-class-config';
import { bookableByClass } from '@/lib/kpi/bookable';
import { fetchCapacityByDay } from '@/lib/sync/servicetitan/capacity';
import type { DeptCapacityAgg } from '@/lib/sync/servicetitan/capacity';
import { getBusinessTz, localDayStartUTC, localTodayISO, shiftISO } from '@/lib/time';
import {
  classTotalsFromDays,
  totalAppointmentsFromDays,
} from '@/lib/kpi/upcoming-appointments';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface StAppointment {
  id: number;
  jobId?: number | null;
  start?: string;
  status?: string;
  active?: boolean;
  unused?: boolean;
}

interface StJob {
  id: number;
  businessUnitId?: number | null;
  jobTypeId?: number | null;
}

interface StJobType {
  id: number;
  name?: string | null;
}

/** A job-type row, tagged with how the work arrived. */
export interface JobTypeCount {
  name: string;
  count: number;
  /** Pre-scheduled maintenance, unplanned demand service, or install/sales. */
  cls: SourceClass;
}

/** Open capacity on one board, in hours and in jobs those hours could take. */
export interface CapacitySlice {
  openHours: number;
  /** Estimated additional jobs the open hours could absorb. */
  bookable: number;
}

/** A day's remaining dispatch capacity, sliced the same ways the page filters. */
export interface DayCapacity extends CapacitySlice {
  /** Total schedulable tech-hours on the board, booked or not. */
  totalHours: number;
  byClass: Record<SourceClass, CapacitySlice>;
  byDept: Array<CapacitySlice & {
    code: string;
    byClass: Record<SourceClass, CapacitySlice>;
  }>;
}

export interface UpcomingAppointmentsResponse {
  /** False when the Capacity API is unreachable (missing Dispatch scope) —
   *  lets the UI hide capacity entirely rather than render a misleading 0. */
  capacityAvailable: boolean;
  /** Number of day-level capacity boards successfully returned. */
  capacityDaysAvailable: number;
  /** Number of day-level capacity boards requested for this window. */
  capacityDaysExpected: number;
  totalAppointments: number;
  /** Week-wide demand vs maintenance vs install split. */
  classTotals: Record<SourceClass, number>;
  todayCount: number;
  tomorrowCount: number;
  windowStart: string;
  windowEnd: string;
  /** Appointments per day across the 7-day window, each with a per-dept
   *  segment breakdown so the chart can render stacked bars. */
  byDay: Array<{
    date: string;
    count: number;
    depts: Array<{
      code: string | null;
      name: string;
      count: number;
    }>;
    topJobTypes: Array<JobTypeCount & { dept: string | null }>;
    /** Null when this day's capacity call failed or returned no board. */
    capacity: DayCapacity | null;
    /** Per-business-unit breakdown for the expansion view, so LEX
     *  Maintenance and LYONS Maintenance show as distinct rows even
     *  though they share the `hvac_maintenance` dept code. */
    byBu: Array<{
      departmentCode: string | null;
      name: string;
      total: number;
      jobTypes: JobTypeCount[];
    }>;
  }>;
  /** Top job types across all depts. `dept` = majority division for the
   *  type — drives per-trade coloring on the TV drill-down panel. */
  topJobTypes: Array<JobTypeCount & { dept: string | null }>;
  groups: Array<{
    departmentCode: string | null;
    departmentName: string | null;
    total: number;
    jobTypes: JobTypeCount[];
  }>;
}

const shiftDate = shiftISO;

export async function GET() {
  const tz = await getBusinessTz();
  const today = await localTodayISO();
  const windowEnd = shiftDate(today, 7);

  // 1. Pull appointments scheduled to start in the next 7 days (CT-local).
  const appts = await collectResource<StAppointment>({
    path: '/jpm/v2/tenant/{tenant}/appointments',
    query: {
      startsOnOrAfter: localDayStartUTC(today, 0, tz),
      startsBefore: localDayStartUTC(today, 7, tz),
    },
  });

  // Filter to active, non-canceled appointments. ST emits a few lifecycle
  // states; we keep Scheduled/Dispatched/InProgress and drop Canceled/Done.
  const active = appts.filter((a) => {
    if (a.active === false || a.unused === true) return false;
    const status = (a.status ?? '').toLowerCase();
    return status !== 'canceled' && status !== 'done';
  });

  const jobIds = Array.from(
    new Set(active.map((a) => a.jobId).filter((id): id is number => id != null)),
  );

  // 2. Pull job type dimension (small set, ~82 rows) and BU → division map.
  const [types, divisionByBu, buNameRows] = await Promise.all([
    collectResource<StJobType>({
      path: '/jpm/v2/tenant/{tenant}/job-types',
      query: {},
    }),
    loadBuToDivision(),
    db()
      .select({ id: businessUnits.id, name: businessUnits.name })
      .from(businessUnits),
  ]);
  const typeNames = new Map<number, string>();
  for (const t of types) {
    typeNames.set(t.id, (t.name ?? `type#${t.id}`).trim());
  }

  // Local shape mirrors the prior inline map ({ code, name }) so downstream
  // consumers (the grouping loop below) don't need to change.
  const buNameById = new Map(buNameRows.map((r) => [r.id, r.name]));
  const buToDept = new Map<number, { code: string | null; name: string; divName: string | null }>();
  for (const [id, name] of buNameById) {
    const div = divisionByBu.get(id);
    buToDept.set(id, { code: div?.code ?? null, name, divName: div?.name ?? null });
  }
  const divisionNameByCode = new Map<string, string>();
  for (const div of divisionByBu.values()) {
    if (div.code && div.name) divisionNameByCode.set(div.code, div.name);
  }

  // Remaining dispatch capacity for each day in the window. Raw division
  // codes on purpose: this page groups by businessUnits.departmentCode
  // rather than the merged budget divisions, so capacity has to key the
  // same way or it would land on rows the rail never shows.
  const buSourceClasses = await loadBuSourceClasses(buNameRows);
  const windowDays = Array.from({ length: 7 }, (_, i) => shiftDate(today, i));
  const capacityByDay = await fetchCapacityByDay({
    days: windowDays,
    buToDept: new Map(
      buNameRows.map((b) => [b.id, divisionByBu.get(b.id)?.code ?? null]),
    ),
    buToClass: buSourceClasses,
  });

  // 3. Pull just the jobs we need, in chunks. ST supports `ids` filter
  // on /jpm/v2/jobs; batch to keep URL length safe.
  const jobById = new Map<number, StJob>();
  const CHUNK = 50;
  for (let i = 0; i < jobIds.length; i += CHUNK) {
    const chunk = jobIds.slice(i, i + CHUNK);
    const page = await collectResource<StJob>({
      path: '/jpm/v2/tenant/{tenant}/jobs',
      query: { ids: chunk.join(',') },
      pageSize: Math.max(chunk.length + 10, 50),
    });
    for (const j of page) jobById.set(j.id, j);
  }

  // 4. Aggregate: dept → jobType → count, plus per-day and type totals.
  type DeptAgg = {
    departmentCode: string | null;
    departmentName: string | null;
    total: number;
    byType: Map<string, number>;
  };
  const byDept = new Map<string, DeptAgg>();
  // Per-day: total count, count by dept, count by job type, and a
  // finer-grained per-BU map used by the expansion view.
  type BuDaily = {
    departmentCode: string | null;
    name: string;
    total: number;
    types: Map<string, number>;
  };
  type DailyBreakdown = {
    total: number;
    depts: Map<string, { code: string | null; name: string; count: number }>;
    types: Map<string, number>;
    bus: Map<string, BuDaily>;
  };
  const perDay = new Map<string, DailyBreakdown>();
  const typeTotals = new Map<string, number>();
  // Division votes per job-type name. A type effectively belongs to one
  // division; majority vote absorbs the odd cross-booked job.
  const typeDeptVotes = new Map<string, Map<string, number>>();
  // Source-class votes per job-type name. A named type classifies the same
  // way every time, so this only actually votes for jobs whose type is
  // missing in ST — those fall back to their BU's class, and two BUs can
  // disagree. Majority keeps the result independent of iteration order.
  const typeClassVotes = new Map<string, Map<SourceClass, number>>();
  const tomorrow = shiftDate(today, 1);

  for (const a of active) {
    if (!a.jobId || !a.start) continue;
    const job = jobById.get(a.jobId);
    if (!job) continue;
    const bu = job.businessUnitId ? buToDept.get(job.businessUnitId) : null;
    const deptKey = bu?.code ?? '__uncategorized__';
    const buName = bu?.name ?? 'Uncategorized';
    // Division buckets aggregate every BU sharing the code, so they must
    // carry the division's display name — labeling them with the first
    // BU seen made the bar read "LEX Maintenance: 67" for the whole
    // division while the per-BU dropdown showed LEX alone at 26.
    const deptName = bu?.divName ?? buName;
    const buKey = job.businessUnitId != null ? `bu:${job.businessUnitId}` : '__uncategorized__';
    const rawTypeName = job.jobTypeId ? typeNames.get(job.jobTypeId) ?? null : null;
    const typeName =
      rawTypeName ?? (job.jobTypeId ? `type#${job.jobTypeId}` : 'Unknown type');
    const cls = classifyScheduledWork({ jobTypeName: rawTypeName, buName });
    const classVotes = typeClassVotes.get(typeName) ?? new Map<SourceClass, number>();
    classVotes.set(cls, (classVotes.get(cls) ?? 0) + 1);
    typeClassVotes.set(typeName, classVotes);

    const entry = byDept.get(deptKey) ?? {
      departmentCode: bu?.code ?? null,
      departmentName: deptName,
      total: 0,
      byType: new Map(),
    };
    entry.total += 1;
    entry.byType.set(typeName, (entry.byType.get(typeName) ?? 0) + 1);
    byDept.set(deptKey, entry);

    // Bucket by local-CT date, not UTC. An 11pm-CT appointment is 04:00Z
    // the next day — slicing the UTC string puts it on the wrong bucket.
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(a.start));
    const daily = perDay.get(day) ?? {
      total: 0,
      depts: new Map(),
      types: new Map(),
      bus: new Map(),
    };
    daily.total += 1;
    const dailyDept = daily.depts.get(deptKey) ?? {
      code: bu?.code ?? null,
      name: deptName,
      count: 0,
    };
    dailyDept.count += 1;
    daily.depts.set(deptKey, dailyDept);
    daily.types.set(typeName, (daily.types.get(typeName) ?? 0) + 1);
    const dailyBu = daily.bus.get(buKey) ?? {
      departmentCode: bu?.code ?? null,
      name: buName,
      total: 0,
      types: new Map(),
    };
    dailyBu.total += 1;
    dailyBu.types.set(typeName, (dailyBu.types.get(typeName) ?? 0) + 1);
    daily.bus.set(buKey, dailyBu);
    perDay.set(day, daily);

    typeTotals.set(typeName, (typeTotals.get(typeName) ?? 0) + 1);
    if (bu?.code) {
      const votes = typeDeptVotes.get(typeName) ?? new Map<string, number>();
      votes.set(bu.code, (votes.get(bu.code) ?? 0) + 1);
      typeDeptVotes.set(typeName, votes);
    }
  }

  /** Reshape a capacity aggregate into hours-plus-bookable-jobs slices. */
  function toSlices(agg: DeptCapacityAgg) {
    const hours = {
      demand: agg.byClass.demand?.openHours ?? 0,
      maintenance: agg.byClass.maintenance?.openHours ?? 0,
      install: agg.byClass.install?.openHours ?? 0,
    };
    const { byClass: jobs, total } = bookableByClass(hours);
    const byClass = {
      demand: { openHours: hours.demand, bookable: jobs.demand },
      maintenance: { openHours: hours.maintenance, bookable: jobs.maintenance },
      install: { openHours: hours.install, bookable: jobs.install },
    };
    // The class split only covers BUs whose name classified; when a board
    // reports hours we couldn't attribute to a crew, fall back to sizing
    // the unattributed remainder as demand calls so the headline doesn't
    // silently under-report what's open.
    const attributed = hours.demand + hours.maintenance + hours.install;
    const unattributed = Math.max(agg.openHours - attributed, 0);
    const { total: unattributedJobs } = bookableByClass({ demand: unattributed });
    return {
      openHours: agg.openHours,
      totalHours: agg.totalHours,
      bookable: total + unattributedJobs,
      byClass,
    };
  }

  /** Winner of a vote map, or `fallback` when nothing was recorded. */
  function majority<T>(votes: Map<T, number> | undefined, fallback: T): T {
    if (!votes) return fallback;
    let best = fallback;
    let bestCount = 0;
    for (const [key, n] of votes) {
      if (n > bestCount) {
        best = key;
        bestCount = n;
      }
    }
    return best;
  }

  const deptForType = (name: string): string | null =>
    majority(typeDeptVotes.get(name), null as string | null);
  const classForType = (name: string): SourceClass =>
    majority<SourceClass>(typeClassVotes.get(name), 'demand');

  // Build a complete per-day list across the full 7-day window (including
  // zero days) so the chart renders consistently. Each day carries its
  // own dept + top-type segmentation.
  const dayCapacity = (iso: string): DayCapacity | null => {
    const snap = capacityByDay.get(iso);
    if (!snap) return null;
    return {
      ...toSlices(snap.total),
      byDept: Array.from(snap.byDept, ([code, agg]) => ({ code, ...toSlices(agg) })).sort(
        (a, b) => b.openHours - a.openHours,
      ),
    };
  };

  const byDayArr = Array.from({ length: 7 }, (_, i) => {
    const d = shiftDate(today, i);
    const daily = perDay.get(d);
    const capacity = dayCapacity(d);
    const deptRows = new Map<
      string,
      { code: string | null; name: string; count: number }
    >();
    for (const row of daily?.depts.values() ?? []) {
      deptRows.set(row.code ?? '__uncategorized__', row);
    }
    // Keep departments with open capacity selectable even when they have no
    // appointments. This is the underbooked-board case the panel must expose.
    for (const row of capacity?.byDept ?? []) {
      if (!deptRows.has(row.code)) {
        deptRows.set(row.code, {
          code: row.code,
          name: divisionNameByCode.get(row.code) ?? row.code,
          count: 0,
        });
      }
    }
    const depts = Array.from(deptRows.values()).sort((a, b) => b.count - a.count);
    if (!daily) {
      return { date: d, count: 0, depts, topJobTypes: [], byBu: [], capacity };
    }
    return {
      date: d,
      count: daily.total,
      capacity,
      depts,
      topJobTypes: Array.from(daily.types.entries())
        .map(([name, count]) => ({
          name,
          count,
          dept: deptForType(name),
          cls: classForType(name),
        }))
        .sort((a, b) => b.count - a.count),
      byBu: Array.from(daily.bus.values())
        .map((b) => ({
          departmentCode: b.departmentCode,
          name: b.name,
          total: b.total,
          jobTypes: Array.from(b.types.entries())
            .map(([name, count]) => ({ name, count, cls: classForType(name) }))
            .sort((a, b) => b.count - a.count),
        }))
        .sort((a, b) => b.total - a.total),
    };
  });

  const groups = Array.from(byDept.values())
    .map((g) => ({
      departmentCode: g.departmentCode,
      departmentName: g.departmentName,
      total: g.total,
      jobTypes: Array.from(g.byType.entries())
        .map(([name, count]) => ({ name, count, cls: classForType(name) }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total);

  const topJobTypes = Array.from(typeTotals.entries())
    .map(([name, count]) => ({
      name,
      count,
      dept: deptForType(name),
      cls: classForType(name),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 9);

  // Issue #70: the raw active list can contain appointments that cannot be
  // joined to a job/day and therefore never appear in any visible breakdown.
  // Derive the headline from those same rendered day buckets so it reconciles.
  const totalAppointments = totalAppointmentsFromDays(byDayArr);
  // Same buckets, same denominator — the split can never exceed the headline.
  const classTotals = classTotalsFromDays(byDayArr);

  const body: UpcomingAppointmentsResponse = {
    totalAppointments,
    capacityAvailable: capacityByDay.size > 0,
    capacityDaysAvailable: capacityByDay.size,
    capacityDaysExpected: windowDays.length,
    classTotals,
    todayCount: perDay.get(today)?.total ?? 0,
    tomorrowCount: perDay.get(tomorrow)?.total ?? 0,
    windowStart: today,
    windowEnd,
    byDay: byDayArr,
    topJobTypes,
    groups,
  };

  return NextResponse.json({ data: body });
}
