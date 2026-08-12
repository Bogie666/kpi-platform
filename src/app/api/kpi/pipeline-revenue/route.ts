/**
 * GET /api/kpi/pipeline-revenue
 *
 * Report-aligned live ServiceTitan pipeline revenue (ST Operations report
 * 403662055): Job date type with Appointment Date, tenant-local today through
 * the current local month end, subtotal/income summed from Job.total.
 *
 * A job is included exactly once when it is Scheduled or InProgress and has an
 * active appointment beginning inside that window. Appointment time establishes
 * membership in the report window; Job.total supplies the dollars. Division is
 * resolved through the tenant's configured business-unit → division mapping.
 */
import { NextResponse } from 'next/server';
import { collectResource } from '@/lib/sync/servicetitan/raw-client';
import { loadBuToDeptCodeMap } from '@/lib/sync/servicetitan/bu-map';
import { getBusinessTz, localDayStartUTC, localTodayISO, shiftISO } from '@/lib/time';
import {
  isPipelineJobStatus,
  jobTotalCents,
  pipelineWindow,
} from '@/lib/pipeline-revenue';

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
  jobStatus?: string | null;
  total?: number | string | null;
}

export interface PipelineRevenueResponse {
  asOf: string;
  /** Tenant-local inclusive report window. */
  windowStart: string;
  windowEnd: string;
  /** Total of live ServiceTitan Job.total values, in cents. */
  totalCents: number;
  /** Active appointments whose starts fall in the report window. */
  appointmentsConsidered: number;
  /** Unique Scheduled/InProgress jobs with a valid Job.total and BU mapping. */
  jobsWithEstimate: number;
  /** Per-division Job.total rollup in cents. */
  byDivision: Record<string, number>;
}

function emptyResponse(today: string, windowEnd: string, appointmentsConsidered = 0): PipelineRevenueResponse {
  return {
    asOf: new Date().toISOString(),
    windowStart: today,
    windowEnd,
    totalCents: 0,
    appointmentsConsidered,
    jobsWithEstimate: 0,
    byDivision: {},
  };
}

export async function GET() {
  const [tz, today] = await Promise.all([getBusinessTz(), localTodayISO()]);
  const { start: windowStart, end: windowEnd } = pipelineWindow(today);

  // ST's upper bound is exclusive. Build both bounds at tenant-local midnight
  // so DST and non-Chicago tenant configurations remain correct.
  const appointments = await collectResource<StAppointment>({
    path: '/jpm/v2/tenant/{tenant}/appointments',
    query: {
      startsOnOrAfter: localDayStartUTC(windowStart, 0, tz),
      startsBefore: localDayStartUTC(shiftISO(windowEnd, 1), 0, tz),
    },
  });
  const activeAppointments = appointments.filter((appointment) =>
    appointment.active !== false && appointment.unused !== true && appointment.jobId != null,
  );
  const jobIds = Array.from(new Set(activeAppointments.map((appointment) => appointment.jobId!)));

  if (jobIds.length === 0) {
    return NextResponse.json({ data: emptyResponse(windowStart, windowEnd, activeAppointments.length) });
  }

  // Pull the live jobs referenced by in-window appointments. Chunking keeps
  // the ids query safely below ST URL limits.
  const jobs: StJob[] = [];
  const chunkSize = 50;
  for (let index = 0; index < jobIds.length; index += chunkSize) {
    const ids = jobIds.slice(index, index + chunkSize);
    jobs.push(
      ...(await collectResource<StJob>({
        path: '/jpm/v2/tenant/{tenant}/jobs',
        query: { ids: ids.join(',') },
        pageSize: Math.max(ids.length + 10, 50),
      })),
    );
  }

  const buToDivision = await loadBuToDeptCodeMap();
  let totalCents = 0;
  // Retain the response field name for dashboard compatibility; it now counts
  // report-qualified live jobs, not estimate-analysis matches.
  let jobsWithEstimate = 0;
  const byDivision: Record<string, number> = {};
  const seenJobIds = new Set<number>();

  for (const job of jobs) {
    // A job may have multiple qualifying appointments, but it is one report
    // row/value. Ignore any unexpected duplicate job records defensively.
    if (seenJobIds.has(job.id)) continue;
    seenJobIds.add(job.id);
    if (!isPipelineJobStatus(job.jobStatus)) continue;

    const cents = jobTotalCents(job.total);
    if (cents === null || cents <= 0) continue;
    const division = job.businessUnitId == null ? null : buToDivision.get(job.businessUnitId);
    if (!division) continue;

    totalCents += cents;
    jobsWithEstimate += 1;
    byDivision[division] = (byDivision[division] ?? 0) + cents;
  }

  return NextResponse.json({
    data: {
      asOf: new Date().toISOString(),
      windowStart,
      windowEnd,
      totalCents,
      appointmentsConsidered: activeAppointments.length,
      jobsWithEstimate,
      byDivision,
    } satisfies PipelineRevenueResponse,
  });
}
