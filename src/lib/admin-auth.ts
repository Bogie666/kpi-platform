/**
 * Server-side auth check for `/api/admin/*` routes.
 *
 * Accepts EITHER the legacy `Authorization: Bearer <CRON_SECRET>` header
 * (used by the existing AdminAuthGate / cron tick) OR the new
 * `admin_session` cookie set by the wizard login flow. Both pathways
 * remain valid so cron jobs and pasted-secret admins keep working.
 *
 * Returns null on success, a `Response` on failure (so callers can `return`
 * it directly to short-circuit the route).
 */
import { type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifySession } from './admin-session';

export async function requireAdminAuth(req: Request | NextRequest): Promise<Response | null> {
  // Header path — preserves existing CRON_SECRET semantics.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth && auth === `Bearer ${cronSecret}`) return null;
  }

  // Cookie path — set by /api/admin/login after a successful ADMIN_PASSWORD.
  // NextRequest exposes cookies via .cookies; plain Request doesn't, so we
  // fall back to parsing the header.
  let cookieValue: string | undefined;
  if ('cookies' in req && typeof (req as NextRequest).cookies?.get === 'function') {
    cookieValue = (req as NextRequest).cookies.get(ADMIN_COOKIE)?.value;
  } else {
    const raw = req.headers.get('cookie') ?? '';
    cookieValue = parseCookie(raw, ADMIN_COOKIE);
  }
  if (await verifySession(cookieValue)) return null;

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

function parseCookie(header: string, name: string): string | undefined {
  if (!header) return undefined;
  const pairs = header.split(/;\s*/);
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    if (p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return undefined;
}
