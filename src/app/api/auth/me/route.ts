/**
 * GET /api/auth/me
 *
 * Returns the current session, or null if not signed in. Used by client
 * components to render "logged in as <email>" + the logout button.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE, isAdmin, verifySession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      email: session.sub,
      name: session.name ?? null,
      isAdmin: isAdmin(session.sub),
    },
  });
}
