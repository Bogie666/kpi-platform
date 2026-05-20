import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifySession } from '@/lib/admin-session';

/**
 * Edge middleware — two jobs:
 *   1. Gate `/setup/*` and `/admin/*` HTML pages behind the shared
 *      `ADMIN_PASSWORD` cookie session. The login page itself
 *      (`/setup/login`) is excluded so users can reach it without
 *      being already-authenticated.
 *   2. Redirect the dashboard root to `/setup` when the platform
 *      hasn't completed first-run setup yet. We DON'T check
 *      `setup_completed` here (Edge runtime + DB call on every
 *      request would be expensive); instead, the root `/` page
 *      checks it server-side via `isSetupCompleted()`.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths — the wizard login page must be reachable without a session,
  // and we never gate API routes here (each one validates auth itself).
  if (pathname === '/setup/login' || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const requiresAdmin = pathname.startsWith('/setup') || pathname.startsWith('/admin');
  if (!requiresAdmin) return NextResponse.next();

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const ok = await verifySession(cookie);
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/setup/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Matcher only triggers on routes we might want to gate. Excludes _next,
  // static assets, and the favicon so the middleware overhead stays
  // proportional to actual page renders.
  matcher: ['/setup/:path*', '/admin/:path*'],
};
