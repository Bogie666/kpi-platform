/**
 * ServiceTitan OAuth 2.0 client-credentials flow.
 * Returns an access token; caches in module scope for the lifetime of the
 * server function (typically 5-15 min on Vercel serverless).
 *
 * Credentials are sourced from `company_config` (populated by the setup
 * wizard). Per the locked platform decision, the DB is the only source of
 * truth — no env-var fallback in production.
 */
import { getServiceTitanCreds } from '@/lib/config-service';

const DEFAULT_AUTH_URL = 'https://auth.servicetitan.io/connect/token';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // ms timestamp
}

let cached: CachedToken | null = null;

export interface StConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  appKey: string;
  authUrl: string;
  apiBase: string;
}

export async function readStConfig(): Promise<StConfig> {
  const creds = await getServiceTitanCreds();
  if (!creds) {
    throw new Error(
      'ServiceTitan credentials are not configured. Run the setup wizard at /setup.',
    );
  }
  return {
    tenantId: creds.tenantId,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    appKey: creds.appKey,
    // Auth/API base stay on env vars — these are platform-level, never
    // tenant-specific, and overriding them is only useful for ST's sandbox.
    authUrl: process.env.ST_AUTH_URL ?? DEFAULT_AUTH_URL,
    apiBase: process.env.ST_API_URL ?? 'https://api.servicetitan.io',
  };
}

export async function getAccessToken(cfg?: StConfig): Promise<string> {
  const c = cfg ?? (await readStConfig());
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: c.clientId,
    client_secret: c.clientSecret,
  });

  const res = await fetch(c.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ST auth failed: ${res.status} ${res.statusText} ${text.slice(0, 400)}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresInMs = (json.expires_in ?? 900) * 1000;
  cached = {
    accessToken: json.access_token,
    expiresAt: now + expiresInMs,
  };
  return cached.accessToken;
}

/** Reset the cached token — useful after a 401 from the API. */
export function invalidateAccessToken(): void {
  cached = null;
}
