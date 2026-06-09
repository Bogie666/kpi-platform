/**
 * Technician scorecard sync (ServiceTitan saved reports).
 *
 * Report IDs are tenant-specific, so this worker reads report instances from
 * company_config. Each configured report carries its categoryId/reportId,
 * dashboard role/division assignment, and column mapping. That keeps the
 * product plug-and-play while preserving ServiceTitan's own report attribution
 * for sales, opportunities, close rate, memberships, and lead/flip metrics.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { technicianPeriod } from '@/db/schema';
import {
  getTechnicianReportConfigs,
  type TechnicianReportColumnMapping,
  type TechnicianReportConfig,
} from '@/lib/config-service';
import { getAccessToken, readStConfig } from './auth';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const TECHNICIAN_REPORTS_SOURCE = 'st_technician_reports';

export interface SyncWindow {
  from: string;
  to: string;
}

export interface TechnicianReportsSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  perRole: Array<{
    label?: string;
    roleCode: string;
    departmentCode?: string;
    categoryId?: string;
    reportId: string;
    rows: number;
    error?: string;
  }>;
  rowsUpserted: number;
}

interface StReportDataPage {
  fields: Array<{ name: string; label?: string; dataType?: string }>;
  data: unknown[][];
  hasMore: boolean;
  totalCount?: number;
}

export async function runStReport(
  categoryId: string,
  reportId: string,
  parameters: Array<{ name: string; value: unknown }>,
): Promise<StReportDataPage> {
  const cfg = await readStConfig();
  const token = await getAccessToken(cfg);
  const url = `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-category/${categoryId}/reports/${reportId}/data?pageSize=5000`;

  const MAX_ATTEMPTS = 6;
  let attempt = 0;
  while (true) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'ST-App-Key': cfg.appKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parameters }),
    });
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 0);
      const waitMs = Math.min(
        retryAfter > 0 ? retryAfter * 1000 : 15_000 * Math.pow(2, attempt),
        90_000,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      attempt++;
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`run report ${reportId}: ${res.status} ${body.slice(0, 300)}`);
    }
    return (await res.json()) as StReportDataPage;
  }
}

const DEFAULT_MAPPING: Required<TechnicianReportColumnMapping> = {
  employeeId: 'TechnicianId',
  employeeName: 'Name',
  completedJobs: 'CompletedJobs',
  completedRevenue: 'CompletedRevenue',
  opportunity: 'Opportunity',
  salesOpportunity: 'SalesOpportunity',
  closedOpportunities: 'ClosedOpportunities',
  closeRate: 'CloseRate',
  totalSales: 'TotalSales',
  totalJobAverage: 'TotalJobAverage',
  optionsPerOpportunity: 'OptionsPerOpportunity',
  membershipsSold: 'MembershipsSold',
  leadsSet: 'LeadsSet',
  totalLeadSales: 'TotalLeadSales',
  technicianBusinessUnit: 'TechnicianBusinessUnit',
  technicianTrade: 'TechnicianTrade',
};

function fieldIndex(fields: Array<{ name: string; label?: string }>): Map<string, number> {
  const m = new Map<string, number>();
  fields.forEach((f, i) => {
    m.set(f.name, i);
    if (f.label) m.set(f.label, i);
    m.set(norm(f.name), i);
    if (f.label) m.set(norm(f.label), i);
  });
  return m;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function asNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  const cleaned = v.replace(/[$,%\s,]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v != null ? String(v) : '';
}

function ratioToBps(v: unknown): number | null {
  const n = asNumber(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // ST reports commonly return 0.42 for 42%, but mapped exports sometimes
  // return 42 or "42%". Normalize both shapes to basis points.
  return Math.round((n <= 1 ? n : n / 100) * 10000);
}

function optionsToX100(v: unknown): number | null {
  const n = asNumber(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function readMapped(
  row: unknown[],
  index: Map<string, number>,
  mapping: TechnicianReportColumnMapping,
  key: keyof typeof DEFAULT_MAPPING,
): unknown {
  const configured = mapping[key];
  const candidates = [configured, DEFAULT_MAPPING[key]].filter(Boolean) as string[];
  for (const c of candidates) {
    const i = index.get(c) ?? index.get(norm(c));
    if (i != null && i >= 0) return row[i];
  }
  return undefined;
}

function parseRow(
  config: TechnicianReportConfig,
  window: SyncWindow,
  index: Map<string, number>,
  row: unknown[],
): typeof technicianPeriod.$inferInsert | null {
  const empIdRaw = readMapped(row, index, config.columnMapping, 'employeeId');
  const empName = asString(readMapped(row, index, config.columnMapping, 'employeeName')).trim();
  const employeeId = empIdRaw != null && empIdRaw !== '' ? asNumber(empIdRaw) : 0;
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    // If a report only exposes name, create a stable negative pseudo-id from
    // the name so the row can still power the dashboard. Prefer mapping the
    // real TechnicianId during setup whenever available.
    if (!empName) return null;
    let hash = 0;
    for (const ch of empName) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return buildRow(config, window, index, row, -Math.abs(hash || 1), empName);
  }
  return buildRow(config, window, index, row, Math.round(employeeId), empName || `emp#${employeeId}`);
}

function buildRow(
  config: TechnicianReportConfig,
  window: SyncWindow,
  index: Map<string, number>,
  row: unknown[],
  employeeId: number,
  employeeName: string,
): typeof technicianPeriod.$inferInsert {
  const n = (key: keyof typeof DEFAULT_MAPPING) => asNumber(readMapped(row, index, config.columnMapping, key));
  const cents = (key: keyof typeof DEFAULT_MAPPING) => Math.round(n(key) * 100);
  const s = (key: keyof typeof DEFAULT_MAPPING) =>
    asString(readMapped(row, index, config.columnMapping, key)).trim();

  return {
    roleCode: config.roleCode,
    periodStart: window.from,
    periodEnd: window.to,
    employeeId,
    employeeName,
    completedJobs: Math.round(n('completedJobs')),
    completedRevenueCents: cents('completedRevenue'),
    opportunity: Math.round(n('opportunity')),
    salesOpportunity: Math.round(n('salesOpportunity')),
    closedOpportunities: Math.round(n('closedOpportunities')),
    closeRateBps: ratioToBps(readMapped(row, index, config.columnMapping, 'closeRate')),
    totalSalesCents: cents('totalSales'),
    totalJobAverageCents: cents('totalJobAverage'),
    optionsPerOpportunity: optionsToX100(
      readMapped(row, index, config.columnMapping, 'optionsPerOpportunity'),
    ),
    membershipsSold: Math.round(n('membershipsSold')),
    leadsSet: Math.round(n('leadsSet')),
    totalLeadSalesCents: cents('totalLeadSales'),
    technicianBusinessUnit: s('technicianBusinessUnit') || config.departmentCode,
    technicianTrade: s('technicianTrade') || null,
    sourceReportId: config.reportId,
  };
}

function validateConfig(config: TechnicianReportConfig): void {
  if (!config.label) throw new Error('label required');
  if (!config.roleCode) throw new Error('roleCode required');
  if (!config.departmentCode) throw new Error('departmentCode required');
  if (!config.categoryId) throw new Error('categoryId required');
  if (!config.reportId) throw new Error('reportId required');
  const hasIdentity = Boolean(config.columnMapping.employeeId || config.columnMapping.employeeName);
  if (!hasIdentity) throw new Error('map employeeId or employeeName before syncing');
}

export async function syncTechnicianReports(
  window: SyncWindow,
  trigger: SyncTrigger,
): Promise<TechnicianReportsSyncResult> {
  const start = await startSyncRun({
    source: TECHNICIAN_REPORTS_SOURCE,
    trigger,
    reportId: 'technician-reports',
    windowStart: window.from,
    windowEnd: window.to,
  });
  if (start.status === 'skipped') {
    return { runId: null, skipped: start.reason, perRole: [], rowsUpserted: 0 };
  }
  const runId = start.runId;

  try {
    const configs = (await getTechnicianReportConfigs()).filter((c) => c.active);
    if (configs.length === 0) {
      throw new Error('No active technician report configs found. Add reports in setup first.');
    }

    const perRole: TechnicianReportsSyncResult['perRole'] = [];
    let totalUpserted = 0;
    const database = db();

    for (const config of configs) {
      try {
        validateConfig(config);
        const result = await runStReport(config.categoryId, config.reportId, [
          { name: 'From', value: window.from },
          { name: 'To', value: window.to },
        ]);
        const index = fieldIndex(result.fields ?? []);
        const rows: Array<typeof technicianPeriod.$inferInsert> = [];
        for (const raw of result.data ?? []) {
          const parsed = parseRow(config, window, index, raw);
          if (parsed) rows.push(parsed);
        }

        await database
          .delete(technicianPeriod)
          .where(
            and(
              eq(technicianPeriod.roleCode, config.roleCode),
              eq(technicianPeriod.periodStart, window.from),
              eq(technicianPeriod.periodEnd, window.to),
              eq(technicianPeriod.sourceReportId, config.reportId),
            ),
          );

        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          if (batch.length === 0) continue;
          await database
            .insert(technicianPeriod)
            .values(batch)
            .onConflictDoUpdate({
              target: [
                technicianPeriod.roleCode,
                technicianPeriod.periodStart,
                technicianPeriod.periodEnd,
                technicianPeriod.employeeId,
                technicianPeriod.sourceReportId,
              ],
              set: {
                employeeName: sql.raw('excluded.employee_name'),
                completedJobs: sql.raw('excluded.completed_jobs'),
                completedRevenueCents: sql.raw('excluded.completed_revenue_cents'),
                opportunity: sql.raw('excluded.opportunity'),
                salesOpportunity: sql.raw('excluded.sales_opportunity'),
                closedOpportunities: sql.raw('excluded.closed_opportunities'),
                closeRateBps: sql.raw('excluded.close_rate_bps'),
                totalSalesCents: sql.raw('excluded.total_sales_cents'),
                totalJobAverageCents: sql.raw('excluded.total_job_average_cents'),
                optionsPerOpportunity: sql.raw('excluded.options_per_opportunity_x100'),
                membershipsSold: sql.raw('excluded.memberships_sold'),
                leadsSet: sql.raw('excluded.leads_set'),
                totalLeadSalesCents: sql.raw('excluded.total_lead_sales_cents'),
                technicianBusinessUnit: sql.raw('excluded.technician_business_unit'),
                technicianTrade: sql.raw('excluded.technician_trade'),
                syncedAt: new Date(),
              },
            });
          totalUpserted += batch.length;
        }

        perRole.push({
          label: config.label,
          roleCode: config.roleCode,
          departmentCode: config.departmentCode,
          categoryId: config.categoryId,
          reportId: config.reportId,
          rows: rows.length,
        });
      } catch (err) {
        perRole.push({
          label: config.label,
          roleCode: config.roleCode,
          departmentCode: config.departmentCode,
          categoryId: config.categoryId,
          reportId: config.reportId,
          rows: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const rowsFetched = perRole.reduce((s, r) => s + r.rows, 0);
    const errors = perRole.filter((r) => r.error);
    if (rowsFetched === 0 && errors.length > 0) {
      throw new Error(
        `All technician reports failed or returned zero rows: ${errors
          .map((e) => `${e.roleCode}/${e.reportId}: ${e.error}`)
          .join(' | ')}`,
      );
    }

    await finishSyncRunSuccess(runId, {
      rowsFetched,
      rowsUpserted: totalUpserted,
    });

    return { runId, perRole, rowsUpserted: totalUpserted };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
