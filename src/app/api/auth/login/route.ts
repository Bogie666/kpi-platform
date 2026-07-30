/**
 * POST /api/auth/login
 *
 * Body: { email, password } JSON. On success, sets the session cookie and
 * returns { ok: true, email, name, isAdmin }. On bad credentials, returns
 * 401 with a generic message — no user enumeration via timing or wording.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { AUTH_COOKIE, isAdmin, sessionCookieOptions, signSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  let body: LoginBody = {};
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const rows = await db().select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  // Always run bcrypt.compare even if user wasn't found — defends against
  // timing-based user enumeration. The dummy hash is a real bcrypt output
  // so the timing matches; the result is discarded.
  const dummyHash =
    '$2a$12$abcdefghijklmnopqrstuuMHRyCexBnfvDtxjZjyQv2VEPYRLLgK6';
  const hash = user?.passwordHash ?? dummyHash;
  const ok = await bcrypt.compare(password, hash);

  if (!user || !user.active || !ok) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }

  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const token = await signSession({ sub: user.email, name: user.name ?? undefined });
  const res = NextResponse.json({
    ok: true,
    email: user.email,
    name: user.name,
    isAdmin: isAdmin(user.email),
  });
  res.cookies.set(AUTH_COOKIE, token, sessionCookieOptions());
  return res;
}
