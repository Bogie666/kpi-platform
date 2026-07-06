/**
 * Manual Daily Targets email trigger — admin-only (session-gated by the
 * auth middleware via ADMIN_EMAILS; CRON_SECRET bearer also passes for
 * parity with other /api/admin routes).
 *
 * Visiting this URL while logged in sends the morning emails immediately,
 * bypassing the workday/time gates (it's an explicit human action):
 *
 *   /api/admin/daily-targets-email            — real send to configured lists
 *   /api/admin/daily-targets-email?dry=1      — render + report, no send
 *   /api/admin/daily-targets-email?to=a@b.com — send all audiences to one address
 *
 * A real send (no ?dry, no ?to) records the once-per-day marker so the
 * morning cron won't double-send the same day.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { db } from '@/db/client';
import { kpiCache } from '@/db/schema';
import { sendDailyTargetsEmails } from '@/lib/email/daily-targets-email';
import { localTodayISO } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const dryRun = params.get('dry') === '1';
  const toOverride = params.get('to')?.split(',').map((s) => s.trim()).filter(Boolean);

  const outcome = await sendDailyTargetsEmails({ toOverride, dryRun });

  const sentAny = outcome.results.some((r) => r.status === 'sent');
  if (!dryRun && !toOverride && sentAny) {
    const today = localTodayISO();
    await db()
      .insert(kpiCache)
      .values({ cacheKey: `daily-targets-email:${today}`, payload: outcome, computedAt: new Date() })
      .onConflictDoUpdate({
        target: kpiCache.cacheKey,
        set: { payload: outcome, computedAt: new Date() },
      });
  }

  return NextResponse.json({ dryRun, triggeredBy: 'admin', ...outcome });
}
