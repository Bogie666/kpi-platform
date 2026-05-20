/**
 * Admin session helpers — shared `ADMIN_PASSWORD` env var + HMAC-signed
 * cookie. Runs in the Edge runtime (used by middleware.ts) so we stick
 * to Web Crypto rather than node:crypto.
 *
 * Sessions are short-lived (24h). Rotating ADMIN_PASSWORD invalidates
 * every outstanding session automatically because the secret is part
 * of the HMAC key.
 */

export const ADMIN_COOKIE = 'admin_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface SessionPayload {
  iat: number;
  exp: number;
}

function getPasswordOrThrow(): string {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) throw new Error('ADMIN_PASSWORD env var is not set');
  return pwd;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(now = Date.now()): Promise<string> {
  const payload: SessionPayload = { iat: now, exp: now + SESSION_TTL_MS };
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getKey(getPasswordOrThrow());
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  let pwd: string;
  try {
    pwd = getPasswordOrThrow();
  } catch {
    return false;
  }
  try {
    const key = await getKey(pwd);
    const sigBytes = b64urlDecode(sigB64);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      // Copy into a fresh ArrayBuffer-backed view so the type widens away from
      // SharedArrayBuffer — Web Crypto's BufferSource type rejects the latter.
      new Uint8Array(sigBytes).buffer,
      new TextEncoder().encode(payloadB64),
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as SessionPayload;
    return typeof payload.exp === 'number' && payload.exp > now;
  } catch {
    return false;
  }
}

/** Constant-time string compare. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPassword(submitted: string): boolean {
  let pwd: string;
  try {
    pwd = getPasswordOrThrow();
  } catch {
    return false;
  }
  return timingSafeEqual(submitted, pwd);
}

export const ADMIN_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};
