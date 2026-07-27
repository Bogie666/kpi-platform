/**
 * Financial sync — two revenue bases, selected by tenant config.
 *
 * COMPLETED-REVENUE BASIS (preferred, matches ServiceTitan's Modular
 * Dashboard). Enabled when the tenant sets `financial_report_id` in
 * company_config. A saved Business-Unit-Dashboard report is authoritative
 * for each BU and defines:
 *   Total Revenue = Completed Revenue + Non-Job Revenue + Adjustment Revenue
 * One aggregate report call returns exact totals for the window; the Jobs API
 * supplies completion-date/value weights so those exact BU totals can be
 * allocated to daily rows for trends and period filters. Every BU and window
 * still sums exactly to the saved report; the weighting is only the daily
 * distribution mechanism.
 *
 * INVOICE BASIS (fallback). Used when no `financial_report_id` is configured.
 * Sums invoice item totals bucketed by the item's BU and dated by the invoice
 * date, then rolls up into division dept codes via the business_units
 * dimension. This keeps a brand-new tenant's financials working before they
 * wire up a saved report.
 *
 * Config keys (all optional; company_config):
 *   financial_report_id            — saved report id (enables completed basis)
 *   financial_report_category      — report category slug
 *                                    (default 'business-unit-dashboard')
 *   financial_excluded_business_units — JSON array of BU display names to
 *                                    exclude from revenue (e.g. ["Club Payments"])
 *
 * Upsert key for both paths: (business_unit_id, report_date).
 */
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { businessUnits, financialDaily } from '@/db/schema';
import { getAccessToken, readStConfig } from './auth';
import { collectResource } from './raw-client';
import { loadBuToDeptCodeMap } from './bu-map';
import { getConfig, getConfigTyped } from '@/lib/config-service';
import {
  allocateRevenueByCompletedJobWeights,
  normalizeBusinessUnitName,
  parseCompletedRevenueReport,
  type CompletedJobRevenueWeight,
  type RevenueBusinessUnit,
  type ServiceTitanReportPage,
} from './financial-report';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const FINANCIAL_SOURCE = 'st_financial';
export const DEFAULT_FINANCIAL_REPORT_CATEGORY = 'business-unit-dashboard';
const MAX_REPORT_ATTEMPTS = 8;

export interface SyncWindow {
  from: string;
  to: string;
}

/** Result shape is a superset covering both sync paths; `basis` says which ran. */
export interface SyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  basis: 'completed' | 'invoices';
  rowsUpserted: number;
  // completed-basis fields
  reportRowsFetched?: number;
  jobsFetched?: number;
  daysSynced?: number;
  totalRevenueCents?: number;
  completedRevenueCents?: number;
  nonJobRevenueCents?: number;
  adjustmentRevenueCents?: number;
  excludedRevenueCents?: number;
  unmappedRevenueBusinessUnits?: string[];
  // invoice-basis fields
  invoicesFetched?: number;
  itemsProcessed?: number;
  itemsDropped?: number;
  unmappedBusinessUnitIds?: number[];
}

// ─────────────────────────── shared helpers ───────────────────────────

function toCents(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysIn(window: SyncWindow): string[] {
  const out: string[] = [];
  const start = new Date(`${window.from}T00:00:00Z`);
  const end = new Date(`${window.to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error(`Invalid financial sync window: ${window.from}..${window.to}`);
  }
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function purgeSeedRowsForWindow(window: SyncWindow): Promise<number> {
  const res = await db()
    .delete(financialDaily)
    .where(
      and(
        eq(financialDaily.sourceReportId, 'seed'),
        gte(financialDaily.reportDate, window.from),
        lte(financialDaily.reportDate, window.to),
      ),
    )
    .returning({ id: financialDaily.id });
  return res.length;
}

/**
 * Read the tenant's financial config. `reportId` null means "no saved report
 * configured" → the caller falls back to invoice basis.
 */
async function readFinancialConfig(): Promise<{
  reportId: string | null;
  category: string;
  excludedNames: ReadonlySet<string>;
}> {
  const [reportIdRaw, categoryRaw, excludedRaw] = await Promise.all([
    getConfig('financial_report_id'),
    getConfig('financial_report_category'),
    getConfigTyped<string[]>('financial_excluded_business_units'),
  ]);
  const reportId = reportIdRaw && reportIdRaw.trim() ? reportIdRaw.trim() : null;
  const category = categoryRaw && categoryRaw.trim() ? categoryRaw.trim() : DEFAULT_FINANCIAL_REPORT_CATEGORY;
  const excludedNames = new Set(
    (Array.isArray(excludedRaw) ? excludedRaw : [])
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((n) => normalizeBusinessUnitName(n)),
  );
  return { reportId, category, excludedNames };
}

// ─────────────────────── completed-revenue basis ───────────────────────

interface StCompletedJob {
  id: number;
  completedOn?: string | null;
  businessUnitId?: number | null;
  total?: string | number | null;
}

async function runCompletedRevenueReport(
  window: SyncWindow,
  reportId: string,
  category: string,
): Promise<ServiceTitanReportPage> {
  const cfg = await readStConfig();
  const url = `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-category/${category}/reports/${reportId}/data?pageSize=5000`;

  for (let attempt = 0; attempt < MAX_REPORT_ATTEMPTS; attempt++) {
    const token = await getAccessToken(cfg);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'ST-App-Key': cfg.appKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parameters: [
          { name: 'From', value: window.from },
          { name: 'To', value: window.to },
        ],
      }),
    });

    if (res.status === 429 && attempt < MAX_REPORT_ATTEMPTS - 1) {
      const retryAfterSec = Number(res.headers.get('retry-after') ?? 0);
      const fallbackSec = Math.min(15 * 2 ** attempt, 90);
      await sleep((retryAfterSec > 0 ? retryAfterSec + 1 : fallbackSec) * 1000);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `ST completed-revenue report ${reportId} failed for ` +
          `${window.from}..${window.to}: ${res.status} ${body.slice(0, 300)}`,
      );
    }

    const page = (await res.json()) as ServiceTitanReportPage;
    if (page.hasMore) {
      throw new Error(
        `ST report ${reportId} exceeded pageSize=5000; ` +
          'pagination is required before this result can be trusted',
      );
    }
    return page;
  }

  throw new Error('ST completed-revenue report retries exhausted');
}

async function loadCompletedJobs(window: SyncWindow): Promise<StCompletedJob[]> {
  return collectResource<StCompletedJob>({
    path: '/jpm/v2/tenant/{tenant}/jobs',
    query: {
      completedOnOrAfter: `${window.from}T00:00:00Z`,
      // ST ignores completedOnOrBefore; completedBefore is exclusive.
      completedBefore: `${shiftDate(window.to, 1)}T00:00:00Z`,
      jobStatus: 'Completed',
    },
  });
}

async function loadRevenueBusinessUnits(): Promise<RevenueBusinessUnit[]> {
  return db()
    .select({
      id: businessUnits.id,
      name: businessUnits.name,
      departmentCode: businessUnits.departmentCode,
    })
    .from(businessUnits);
}

async function syncFinancialCompletedBasis(
  window: SyncWindow,
  runId: number,
  reportId: string,
  category: string,
  excludedNames: ReadonlySet<string>,
): Promise<SyncResult> {
  const [businessUnitList, reportPage, completedJobs] = await Promise.all([
    loadRevenueBusinessUnits(),
    runCompletedRevenueReport(window, reportId, category),
    loadCompletedJobs(window),
  ]);
  const days = daysIn(window);
  const authoritative = parseCompletedRevenueReport(
    reportPage,
    window.to,
    businessUnitList,
    excludedNames,
  );

  const mappedBuIds = new Set(
    businessUnitList.filter((bu) => bu.departmentCode).map((bu) => bu.id),
  );
  const weights: CompletedJobRevenueWeight[] = [];
  for (const job of completedJobs) {
    if (!job.businessUnitId || !mappedBuIds.has(job.businessUnitId) || !job.completedOn) {
      continue;
    }
    const reportDate = job.completedOn.slice(0, 10);
    if (reportDate < window.from || reportDate > window.to) continue;
    weights.push({
      businessUnitId: job.businessUnitId,
      reportDate,
      // Negative/zero jobs cannot be proportional weights. Adjustments and
      // non-job revenue are included in the authoritative BU total instead.
      weightCents: Math.max(0, toCents(job.total)),
    });
  }

  const allocatedRows = allocateRevenueByCompletedJobWeights(
    authoritative.rows,
    days,
    weights,
  );
  const rows = allocatedRows.map((row) => ({
    ...row,
    sourceReportId: reportId,
  }));

  // Defense-in-depth: never write an allocation that fails the exact tie-out.
  const allocatedTotal = rows.reduce((sum, row) => sum + row.totalRevenueCents, 0);
  if (allocatedTotal !== authoritative.mappedTotalRevenueCents) {
    throw new Error(
      `Completed-revenue allocation mismatch: report=${authoritative.mappedTotalRevenueCents} ` +
        `allocated=${allocatedTotal}`,
    );
  }

  let rowsUpserted = 0;
  if (rows.length > 0) {
    const database = db();
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      await database
        .insert(financialDaily)
        .values(batch)
        .onConflictDoUpdate({
          target: [financialDaily.businessUnitId, financialDaily.reportDate],
          set: {
            departmentCode: sql.raw('excluded.department_code'),
            totalRevenueCents: sql.raw('excluded.total_revenue_cents'),
            sourceReportId: sql.raw('excluded.source_report_id'),
            syncedAt: new Date(),
          },
        });
      rowsUpserted += batch.length;
    }
    await purgeSeedRowsForWindow(window);
  }

  await finishSyncRunSuccess(runId, {
    rowsFetched: authoritative.rowsFetched + completedJobs.length,
    rowsUpserted,
  });

  return {
    runId,
    basis: 'completed',
    rowsUpserted,
    reportRowsFetched: authoritative.rowsFetched,
    jobsFetched: completedJobs.length,
    daysSynced: days.length,
    totalRevenueCents: authoritative.mappedTotalRevenueCents,
    completedRevenueCents: authoritative.completedRevenueCents,
    nonJobRevenueCents: authoritative.nonJobRevenueCents,
    adjustmentRevenueCents: authoritative.adjustmentRevenueCents,
    excludedRevenueCents: authoritative.excludedRevenueCents,
    unmappedRevenueBusinessUnits: authoritative.unmappedRevenueBusinessUnits,
  };
}

// ─────────────────────────── invoice basis ────────────────────────────

interface StInvoiceItem {
  id: number;
  skuName?: string;
  type?: string;
  total: string | number | null;
  businessUnit?: { id: number; name?: string } | null;
  generalLedgerAccount?: { id: number; name?: string; type?: string } | null;
}

interface StInvoice {
  id: number;
  invoicedOn?: string | null;
  invoiceDate?: string | null;
  status?: string;
  adjustmentToId?: number | null;
  items?: StInvoiceItem[];
  businessUnit?: { id: number; name?: string } | null;
  total?: string | number | null;
}

function dateOf(inv: StInvoice): string | null {
  const raw = inv.invoicedOn ?? inv.invoiceDate;
  if (!raw) return null;
  return raw.slice(0, 10);
}

/**
 * Decide whether a line item counts as "income" for Total Revenue. The GL
 * account type tells us; if it's missing (older items), fall back to counting
 * most line types as income, which matches the Reports API behavior.
 */
function isIncomeItem(item: StInvoiceItem): boolean {
  const glType = item.generalLedgerAccount?.type?.toLowerCase();
  if (glType === 'income') return true;
  if (glType && glType !== 'income') return false;
  return true;
}

async function syncFinancialInvoices(
  window: SyncWindow,
  runId: number,
): Promise<SyncResult> {
  const unmappedBuIds = new Set<number>();
  let invoicesFetched = 0;
  let itemsProcessed = 0;
  let itemsDropped = 0;

  const buToDept = await loadBuToDeptCodeMap();

  const invoices = await collectResource<StInvoice>({
    path: '/accounting/v2/tenant/{tenant}/invoices',
    query: {
      invoicedOnOrAfter: `${window.from}T00:00:00Z`,
      invoicedOnOrBefore: `${window.to}T23:59:59Z`,
      includeTotal: true,
    },
  });
  invoicesFetched = invoices.length;

  const agg = new Map<
    string,
    { buId: number; dept: string; date: string; totalCents: number }
  >();
  for (const inv of invoices) {
    const date = dateOf(inv);
    if (!date) continue;
    for (const item of inv.items ?? []) {
      itemsProcessed++;
      if (!isIncomeItem(item)) {
        itemsDropped++;
        continue;
      }
      const buId = item.businessUnit?.id ?? inv.businessUnit?.id;
      if (!buId) {
        itemsDropped++;
        continue;
      }
      if (!buToDept.has(buId)) {
        itemsDropped++;
        unmappedBuIds.add(buId);
        continue;
      }
      const dept = buToDept.get(buId);
      if (!dept) {
        itemsDropped++;
        continue;
      }
      const cents = toCents(item.total);
      const key = `${buId}|${date}`;
      const prior = agg.get(key);
      if (prior) prior.totalCents += cents;
      else agg.set(key, { buId, dept, date, totalCents: cents });
    }
  }

  const rows = Array.from(agg.values()).map((r) => ({
    departmentCode: r.dept,
    businessUnitId: r.buId,
    reportDate: r.date,
    totalRevenueCents: r.totalCents,
    jobs: 0,
    opportunities: 0,
    sourceReportId: 'st_invoices',
  }));

  let upserted = 0;
  if (rows.length > 0) {
    const database = db();
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      await database
        .insert(financialDaily)
        .values(batch)
        .onConflictDoUpdate({
          target: [financialDaily.businessUnitId, financialDaily.reportDate],
          set: {
            departmentCode: sql.raw(`excluded.department_code`),
            totalRevenueCents: sql.raw(`excluded.total_revenue_cents`),
            sourceReportId: sql.raw(`excluded.source_report_id`),
            syncedAt: new Date(),
          },
        });
      upserted += batch.length;
    }
    await purgeSeedRowsForWindow(window);
  }

  await finishSyncRunSuccess(runId, {
    rowsFetched: invoicesFetched,
    rowsUpserted: upserted,
  });

  return {
    runId,
    basis: 'invoices',
    rowsUpserted: upserted,
    invoicesFetched,
    itemsProcessed,
    itemsDropped,
    unmappedBusinessUnitIds: Array.from(unmappedBuIds).slice(0, 40),
  };
}

// ─────────────────────────── entry point ──────────────────────────────

export async function syncFinancial(
  window: SyncWindow,
  trigger: SyncTrigger,
): Promise<SyncResult> {
  const { reportId, category, excludedNames } = await readFinancialConfig();

  const start = await startSyncRun({
    source: FINANCIAL_SOURCE,
    trigger,
    reportId: reportId ?? 'invoices',
    windowStart: window.from,
    windowEnd: window.to,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      basis: reportId ? 'completed' : 'invoices',
      rowsUpserted: 0,
    };
  }
  const runId = start.runId;

  try {
    if (reportId) {
      return await syncFinancialCompletedBasis(
        window,
        runId,
        reportId,
        category,
        excludedNames,
      );
    }
    return await syncFinancialInvoices(window, runId);
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}

// Silence unused-import warning in build paths that don't reach the table fn.
void inArray;
