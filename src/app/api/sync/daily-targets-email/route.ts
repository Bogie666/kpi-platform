/**
 * Morning Daily Targets email — cron entry point.
 *
 * Vercel cron fires hourly at :45 from 11:45–14:45 UTC on weekdays
 * (vercel.json) to cover DST and a range of tenant-configured local send
 * hours; the
 * route itself decides whether this is a sending morning:
 *   - must be a working day (weekday minus company holidays),
 *   - business-local time must be past the configured send-after minute
 *     (default 7:40 AM local; earlier ticks are ignored),
 *   - at most one send per day (kpi_cache marker).
 *
 * Auth: CRON_SECRET as Bearer header or ?secret= (same contract as
 * /api/sync/tick). Lives under /api/sync so the auth middleware lets the
 * cron through without a session.
 *
 * Manual testing:
 *   ?force=1            — bypass the workday/time/dedupe gates
 *   ?dry=1              — render + report, no SendGrid call
 *   ?to=me@example.com  — send every audience's email to this address only
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { kpiCache } from '@/db/schema';
import { sendDailyTargetsEmails } from '@/lib/email/daily-targets-email';
import { isWorkday } from '@/lib/targets/calendar';
import { getBusinessTz, localTodayISO } from '@/lib/time';
import { getConfigTyped } from '@/lib/config-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Default local send time. Tenants can override with the
// `daily_targets_email_send_after_minutes` config key (minutes past midnight,
// business-local). The Vercel cron fires hourly across the morning window so
// whatever local hour a tenant sets still gets caught; this gate + the
// once-per-day marker pick the right tick.
const DEFAULT_SEND_AFTER_MINUTES = 7 * 60 + 40; // 7:40 AM local

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return bearer === secret || req.nextUrl.searchParams.get('secret') === secret;
}

function localMinutesNow(tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return (h % 24) * 60 + m;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const force = params.get('force') === '1';
  const dryRun = params.get('dry') === '1';
  const toOverride = params.get('to')?.split(',').map((s) => s.trim()).filter(Boolean);

  const today = await localTodayISO();
  const tz = await getBusinessTz();
  const markerKey = `daily-targets-email:${today}`;
  const database = db();

  if (!force) {
    if (!isWorkday(today)) {
      return NextResponse.json({ skipped: 'not a working day', date: today });
    }
    const configuredMin = await getConfigTyped<number>('daily_targets_email_send_after_minutes');
    const sendAfterMinutes =
      typeof configuredMin === 'number' && Number.isFinite(configuredMin)
        ? configuredMin
        : DEFAULT_SEND_AFTER_MINUTES;
    if (localMinutesNow(tz) < sendAfterMinutes) {
      return NextResponse.json({ skipped: 'before send window', date: today });
    }
    const marker = await database
      .select({ computedAt: kpiCache.computedAt })
      .from(kpiCache)
      .where(eq(kpiCache.cacheKey, markerKey))
      .limit(1);
    if (marker[0]) {
      return NextResponse.json({ skipped: 'already sent', date: today, sentAt: marker[0].computedAt });
    }
  }

  const outcome = await sendDailyTargetsEmails({ toOverride, dryRun });

  // Only mark the day done on a real (non-test) run that sent something.
  const sentAny = outcome.results.some((r) => r.status === 'sent');
  if (!dryRun && !toOverride && sentAny) {
    await database
      .insert(kpiCache)
      .values({ cacheKey: markerKey, payload: outcome, computedAt: new Date() })
      .onConflictDoUpdate({
        target: kpiCache.cacheKey,
        set: { payload: outcome, computedAt: new Date() },
      });
  }

  return NextResponse.json({ dryRun, ...outcome });
}
