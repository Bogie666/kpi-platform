/**
 * POST /api/auth/logout — clear the session cookie.
 *
 * GET is allowed for convenience (browser link). Returns 200 either way;
 * non-authenticated callers get the same response.
 */
import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function handle() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export const POST = handle;
export const GET = handle;
