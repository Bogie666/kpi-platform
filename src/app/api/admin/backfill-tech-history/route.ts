/**
 * Admin-only — backfill monthly snapshots of the role KPI reports into
 * technician_period, which powers the technician stats card's trend chart
 * (this year vs last year revenue per tech).
 *
 *   /api/admin/backfill-tech-history             — 24 months, skip existing
 *   /api/admin/backfill-tech-history?months=13   — fewer months
 *   /api/admin/backfill-tech-history?force=1      — recompute existing months
 *
 * Idempotent and resumable: if it time-budgets out it returns done:false and
 * nextMonth — just call it again and it picks up where it left off (already
 * filled months are skipped).
 *
 * Auth: session-gated to admins by the auth middleware (and CRON_SECRET bearer
 * passes too, like other /api/admin routes).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { backfillTechMonthlyHistory } from '@/lib/sync/servicetitan/technician-reports';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const months = Math.min(Math.max(Number(params.get('months') ?? 24), 1), 36);
  const force = params.get('force') === '1';

  const result = await backfillTechMonthlyHistory({
    months,
    force,
    timeBudgetMs: 240_000,
  });
  return NextResponse.json({ months, force, ...result });
}
