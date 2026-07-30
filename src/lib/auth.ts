/**
 * Auth primitives — JWT cookie session for the dashboard.
 *
 * Design:
 *   - Stateless: cookie payload = { sub: email, exp }; no DB lookup per request.
 *   - HMAC-SHA256 via `jose`, signed with AUTH_SECRET (≥32 random chars).
 *   - Cookie is HttpOnly, Secure, SameSite=Lax. Auto-sent with same-origin fetches.
 *   - 30-day session.
 *
 * Admin status is NOT in the JWT — derived from the `ADMIN_EMAILS` env on each
 * check. Lets us promote/demote without re-issuing sessions.
 */
import { jwtVerify, SignJWT } from 'jose';

export const AUTH_COOKIE = 'dashboard_session';
const SESSION_DAYS = 30;

function authSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set to a random string of ≥32 chars. Generate with: openssl rand -base64 48',
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  /** Lowercased email — the canonical user identifier. */
  sub: string;
  /** Display name at session-issue time. Not authoritative for UI; refresh from DB if you need fresh. */
  name?: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(authSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, authSecretKey(), { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}

/** Admin allowlist — comma-separated emails in ADMIN_EMAILS env. Case-insensitive. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? '';
  const allow = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return allow.has(email.toLowerCase());
}

/** Cookie config — applies to the session cookie everywhere we set/clear it. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

/**
 * Shared admin auth gate for /api/admin/* route handlers. Accepts either:
 *   - A valid session cookie whose email is in ADMIN_EMAILS, OR
 *   - The CRON_SECRET via Authorization: Bearer <secret> or ?secret= query.
 *
 * The middleware enforces the same rule at the edge, but each route also
 * calls this for defense-in-depth and so route handlers stay independently
 * runnable (e.g. unit tests bypass middleware).
 */
export async function authorizeAdmin(req: {
  headers: { get(name: string): string | null };
  nextUrl: { searchParams: URLSearchParams };
  cookies: { get(name: string): { value: string } | undefined };
}): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const query = req.nextUrl.searchParams.get('secret');
    if (bearer === cronSecret || query === cronSecret) return true;
  }
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return false;
  const session = await verifySession(token);
  return session != null && isAdmin(session.sub);
}
