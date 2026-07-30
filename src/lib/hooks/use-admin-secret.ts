'use client';

import { useCallback } from 'react';

/**
 * Admin auth is now enforced by the edge middleware via the session cookie
 * (email must be in ADMIN_EMAILS). For admin API calls, the middleware
 * injects the server-side CRON_SECRET bearer on the forwarded request, so
 * the client no longer needs to hold or send any secret.
 *
 * This hook is kept as a thin shim so existing admin components compile
 * unchanged: `secret` is a non-empty sentinel (keeps `enabled: !!secret`
 * query guards firing) and `authHeaders` passes headers through untouched.
 */
export function useAdminSecret() {
  const set = useCallback((_v: string) => {}, []);
  const clear = useCallback(() => {}, []);
  const authHeaders = useCallback(
    (base: HeadersInit = {}) => new Headers(base),
    [],
  );
  return { secret: 'session', loaded: true, set, clear, authHeaders };
}
