import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_COOKIE_OPTS, checkPassword, signSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/login
 * Body: { password: string }
 * Sets an HttpOnly cookie on success; returns 401 on bad password.
 */
export async function POST(req: Request) {
  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const submitted = body.password?.trim() ?? '';
  if (!submitted) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD env var is not configured on the server' },
      { status: 500 },
    );
  }
  if (!checkPassword(submitted)) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const token = await signSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTS);
  return res;
}

/** GET — lightweight session check used by AdminAuthGate. */
export async function GET(req: Request) {
  const { verifySession } = await import('@/lib/admin-session');
  const cookieHeader = req.headers.get('cookie') ?? '';
  const match = cookieHeader
    .split(/;\s*/)
    .find((p) => p.startsWith(`${ADMIN_COOKIE}=`));
  const value = match ? decodeURIComponent(match.slice(ADMIN_COOKIE.length + 1)) : undefined;
  const ok = await verifySession(value);
  return NextResponse.json({ ok });
}
