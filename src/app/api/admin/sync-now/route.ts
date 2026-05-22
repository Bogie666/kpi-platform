import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Match the tick endpoint's max duration — full sync can run ~10 min on a
// freshly-onboarded tenant pulling its first window of data.
export const maxDuration = 800;

/**
 * Admin-triggered manual sync. Forwards to /api/sync/tick (the existing
 * cron-driven path) with the CRON_SECRET so we get all the same staleness
 * checks and locking the cron path does — no duplicated logic.
 *
 * Auth: this route is admin-gated (cookie OR Bearer CRON_SECRET); the
 * forwarded request uses CRON_SECRET to pass the tick endpoint's check.
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET env var is not configured on the server' },
      { status: 500 },
    );
  }

  const url = new URL('/api/sync/tick', req.url);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `tick returned ${res.status}`, detail: parsed },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      result: parsed,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      },
      { status: 200 },
    );
  }
}
