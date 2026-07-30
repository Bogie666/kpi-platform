/**
 * Auth middleware — gates the dashboard and admin surfaces behind a session
 * cookie.
 *
 * Public (always allowed, no auth check):
 *   /tv/*, /widgets/*, /api/kpi/*, /api/sync/*, /api/auth/*, /api/config, /login
 *
 * Admin-only (session whose email is in ADMIN_EMAILS, OR CRON_SECRET on the API):
 *   /admin/*, /setup/*, /api/admin/*, /api/setup/*
 *
 * Logged-in-only (any valid session):
 *   everything else (the main dashboard + /api/tools/*)
 *
 * Admin status is derived from the ADMIN_EMAILS env on each request. For
 * admin API paths reached with a valid admin session (not a CRON bearer),
 * the middleware injects `Authorization: Bearer <CRON_SECRET>` on the
 * forwarded request so the existing route handlers — which gate on
 * CRON_SECRET — authorize without per-route changes.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, isAdmin, verifySession } from '@/lib/auth';

const PUBLIC_PREFIXES = [
  '/tv',
  '/widgets',
  '/api/kpi',
  '/api/sync',
  '/api/auth',
  '/api/config',
  '/login',
];

function isPublic(pathname: string): boolean {
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

function isAdminPath(pathname: string): boolean {
  return (
    pathname === '/admin' || pathname.startsWith('/admin/') ||
    pathname === '/setup' || pathname.startsWith('/setup/') ||
    pathname === '/api/admin' || pathname.startsWith('/api/admin/') ||
    pathname === '/api/setup' || pathname.startsWith('/api/setup/') ||
    pathname === '/api/google' || pathname.startsWith('/api/google/')
  );
}

function hasCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

function unauthorizedResponse(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

function forbiddenResponse(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  return NextResponse.redirect(url);
}

/** Forward the request with the CRON_SECRET bearer injected so downstream
 *  admin route handlers (which gate on CRON_SECRET) authorize a session admin. */
function forwardAsAdmin(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.set('authorization', `Bearer ${secret}`);
  return NextResponse.next({ request: { headers } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const adminPath = isAdminPath(pathname);

  // CRON_SECRET bypass — only for API admin/setup paths (cron jobs + bootstrap).
  if (adminPath && pathname.startsWith('/api/') && hasCronSecret(req)) {
    return NextResponse.next();
  }

  // Session check.
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) return unauthorizedResponse(req);

  if (adminPath) {
    if (!isAdmin(session.sub)) return forbiddenResponse(req);
    // Valid admin session on an admin API path: inject CRON bearer so the
    // existing route handlers authorize without per-route rewrites.
    if (pathname.startsWith('/api/')) return forwardAsAdmin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*$).*)',
  ],
};
