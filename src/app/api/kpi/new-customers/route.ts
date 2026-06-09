/**
 * GET /api/kpi/new-customers
 *
 * "New customer" = customer record created in the period AND has at least
 * one completed job in the same period.
 *
 * Served from kpi_cache (pre-warmed by the cron) so the dashboard read is
 * instant. On a cache miss it computes live (~15s ST crawl), stores, and
 * returns. `?fresh=1` forces a recompute.
 *
 * Same `?preset=` shape as /api/kpi/financial.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getNewCustomers, type NewCustomersResult } from '@/lib/kpi/new-customers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export type { NewCustomersResult as NewCustomersResponse };

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const force = params.get('fresh') === '1';
  const data = await getNewCustomers(
    { preset: params.get('preset'), from: params.get('from'), to: params.get('to') },
    { force },
  );
  return NextResponse.json({ data });
}
