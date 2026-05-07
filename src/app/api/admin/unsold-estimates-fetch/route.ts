/**
 * /api/admin/unsold-estimates-fetch — runs ST report 399168856 for an
 * arbitrary date window and returns the rows in the shape the Unsold
 * Estimate Processor tool expects (snake_case keys, dollar amounts).
 *
 * Replaces the old kpi-dashboard's Cloud Function admin-api call.
 *
 *   POST /api/admin/unsold-estimates-fetch
 *     body: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 *     returns: { data: Array<{
 *       opportunity_number, customer_name, location_phone,
 *       customer_email, business_unit, email_sent,
 *       estimate_created_by, creation_date, follow_up_date,
 *       number_of_follow_ups, estimate_age_days,
 *       estimates_subtotal_cents, estimates_discount_total_cents
 *     }> }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAccessToken, readStConfig } from '@/lib/sync/servicetitan/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const REPORT_ID = '399168856';
const REPORT_CATEGORY = 'operations';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

interface StReportPage {
  fields: Array<{ name: string }>;
  data: unknown[][];
  hasMore: boolean;
}

async function runStReport(
  parameters: Array<{ name: string; value: unknown }>,
  page = 1,
): Promise<StReportPage> {
  const cfg = readStConfig();
  const token = await getAccessToken();
  const url = `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-category/${REPORT_CATEGORY}/reports/${REPORT_ID}/data?page=${page}&pageSize=5000`;

  const MAX = 6;
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
    if (res.status === 429 && attempt < MAX) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 0);
      const wait = Math.min(retryAfter > 0 ? retryAfter * 1000 : 15_000 * 2 ** attempt, 90_000);
      await new Promise((r) => setTimeout(r, wait));
      attempt++;
      continue;
    }
    if (!res.ok) {
      throw new Error(`run report ${REPORT_ID}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as StReportPage;
  }
}

function pick(row: unknown[], fields: string[], names: string[]): unknown {
  for (const n of names) {
    const i = fields.indexOf(n);
    if (i >= 0) return row[i];
  }
  return undefined;
}

function asString(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'string' ? v : String(v);
}
function asNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asISODate(v: unknown): string {
  const s = asString(v).trim();
  if (!s) return '';
  return s.slice(0, 10);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { startDate?: string; endDate?: string };
  try {
    body = (await req.json()) as { startDate?: string; endDate?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const { startDate, endDate } = body;
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  // Pull every page of the report for the requested window.
  const allRows: unknown[][] = [];
  let fields: string[] = [];
  let page = 1;
  while (true) {
    const result = await runStReport(
      [
        { name: 'DateType', value: 3 }, // Creation Date
        { name: 'From', value: startDate },
        { name: 'To', value: endDate },
      ],
      page,
    );
    if (page === 1) fields = (result.fields ?? []).map((f) => f.name);
    for (const r of result.data ?? []) allRows.push(r);
    if (!result.hasMore) break;
    page++;
    if (page > 100) break;
  }

  // Filter to "unsold" (anything not Sold/Dismissed) and remap.
  const out: Array<Record<string, unknown>> = [];
  for (const r of allRows) {
    const status = asString(pick(r, fields, ['OpportunityStatus', 'EstimateStatus']))
      .toLowerCase()
      .trim();
    if (status === 'sold' || status === 'won' || status === 'dismissed' || status === 'declined') {
      continue;
    }
    out.push({
      opportunity_number: asString(pick(r, fields, ['OpportunityId', 'EstimateId'])),
      estimate_id: asString(pick(r, fields, ['EstimateId'])),
      customer_name: asString(pick(r, fields, ['CustomerName'])).trim(),
      location_phone: asString(pick(r, fields, ['LocationPhone'])).trim(),
      customer_email: asString(pick(r, fields, ['CustomerEmail'])).trim(),
      business_unit: asString(pick(r, fields, ['BusinessUnit'])).trim(),
      email_sent: pick(r, fields, ['EmailSent']),
      opportunity_status: asString(pick(r, fields, ['OpportunityStatus'])).trim(),
      estimate_status: asString(pick(r, fields, ['EstimateStatus'])).trim(),
      estimates_subtotal_cents: asNumber(pick(r, fields, ['Subtotal'])),
      estimates_discount_total_cents: asNumber(pick(r, fields, ['DiscountTotal'])),
      estimate_created_by: asString(pick(r, fields, ['EstimateCreatedBy', 'SoldBy'])).trim(),
      creation_date: asISODate(pick(r, fields, ['CreationDate'])),
      follow_up_date: asISODate(pick(r, fields, ['FollowUpDate'])),
      last_follow_up_date: asISODate(pick(r, fields, ['LastFollowUpDate'])),
      number_of_follow_ups: asNumber(pick(r, fields, ['NumberOfFollowUps'])),
      estimate_age_days: asNumber(pick(r, fields, ['EstimateAge'])),
    });
  }

  return NextResponse.json({ data: out, count: out.length });
}
