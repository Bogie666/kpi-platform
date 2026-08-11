/**
 * Admin app-settings endpoint — currently just the pacing knobs.
 *
 *   GET  /api/admin/settings           → { ok, pacing: { workdayHours, startHour } }
 *   POST /api/admin/settings
 *     Body: { pacing: { workdayHours: number, startHour: number } }
 *
 * workdayHours: 0 < h ≤ 24 (fractional ok, e.g. 9.5)
 * startHour:    0 ≤ h < 24  (fractional ok, e.g. 7.5 = 7:30 AM, business-local)
 *
 * Gated like the other /api/admin routes (session admin or CRON_SECRET).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { db } from '@/db/client';
import { appSettings } from '@/db/schema';
import { authorizeAdmin } from '@/lib/auth';
import {
  PACING_SETTINGS_KEY,
  getPacingSettings,
  sanitizePacingSettings,
  type PacingSettings,
} from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await authorizeAdmin(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const pacing = await getPacingSettings();
  return NextResponse.json({ ok: true, pacing });
}

export async function POST(req: NextRequest) {
  if (!(await authorizeAdmin(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { pacing?: Partial<PacingSettings> };
  try {
    body = (await req.json()) as { pacing?: Partial<PacingSettings> };
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }
  if (!body.pacing || typeof body.pacing !== 'object') {
    return NextResponse.json({ error: 'missing field: pacing' }, { status: 400 });
  }

  const hours = Number(body.pacing.workdayHours);
  const start = Number(body.pacing.startHour);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return NextResponse.json(
      { error: 'workdayHours must be a number in (0, 24]' },
      { status: 400 },
    );
  }
  if (!Number.isFinite(start) || start < 0 || start >= 24) {
    return NextResponse.json(
      { error: 'startHour must be a number in [0, 24)' },
      { status: 400 },
    );
  }

  const pacing = sanitizePacingSettings({ workdayHours: hours, startHour: start });
  await db()
    .insert(appSettings)
    .values({ key: PACING_SETTINGS_KEY, value: pacing, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: pacing, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true, pacing });
}
