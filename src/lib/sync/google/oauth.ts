/**
 * Google OAuth (shared-app model) for the KPI platform.
 *
 * Instead of each tenant creating their own Google Cloud OAuth app and
 * hand-generating a refresh token, we reuse ONE shared OAuth app (client
 * id/secret in env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). The tenant
 * admin just clicks "Sign in with Google" and authorizes; the callback
 * captures a per-tenant refresh_token and stores it (plus the shared
 * client id/secret) into company_config, so the existing token-manager
 * and reviews-sync pipeline keep working unchanged.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/userinfo.email',
];

/** Fixed redirect URI. Must EXACTLY match an Authorized redirect URI on the
 *  shared OAuth client in Google Cloud Console. Falls back to origin-derived
 *  only when the env is unset (local dev). */
export function getRedirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/google/oauth/callback`;
}

export function oauthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildGoogleOAuthUrl(origin: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Missing GOOGLE_CLIENT_ID');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', getRedirectUri(origin));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent'); // force refresh_token every time
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export async function exchangeCode(origin: string, code: string): Promise<TokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth env vars are not configured');
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(origin),
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) throw new Error(json?.error_description || json?.error || 'Token exchange failed');
  return json;
}

async function googleGet(url: string, token: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || json?.error_description || `Google API failed: ${res.status}`);
  }
  return json;
}

export async function fetchProfileEmail(token: string): Promise<string | undefined> {
  const json = await googleGet('https://www.googleapis.com/oauth2/v2/userinfo', token);
  return json?.email as string | undefined;
}

export interface DiscoveredLocation {
  /** Full resource name, e.g. "locations/12345" */
  name: string;
  /** GBP account resource name, e.g. "accounts/98765" */
  accountId: string;
  /** Bare location id (last path segment of name) */
  locationId: string;
  title: string;
  address?: string;
  phone?: string;
  /** Suggested slug from the title */
  slug: string;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'location';
}

/**
 * Discover every GBP account + location the authorized user manages, using
 * a short-lived access token. Paginates fully. Returns a flat location list
 * ready to render as a checkbox picker.
 */
export async function discoverGbpLocations(accessToken: string): Promise<DiscoveredLocation[]> {
  // 1. accounts (paginated)
  const accounts: string[] = [];
  let acctPageToken = '';
  for (let page = 0; page < 50; page += 1) {
    const url = new URL('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
    url.searchParams.set('pageSize', '20');
    if (acctPageToken) url.searchParams.set('pageToken', acctPageToken);
    const j = await googleGet(url.toString(), accessToken);
    for (const a of j.accounts || []) accounts.push(a.name as string);
    acctPageToken = j.nextPageToken || '';
    if (!acctPageToken) break;
  }

  // 2. locations per account (paginated)
  const out: DiscoveredLocation[] = [];
  for (const account of accounts) {
    let locPageToken = '';
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations`,
      );
      url.searchParams.set('readMask', 'name,title,storefrontAddress,phoneNumbers');
      url.searchParams.set('pageSize', '100');
      if (locPageToken) url.searchParams.set('pageToken', locPageToken);
      const j = await googleGet(url.toString(), accessToken);
      for (const l of j.locations || []) {
        const sa = l.storefrontAddress;
        const address = sa
          ? [sa.addressLines?.join(' '), sa.locality, sa.administrativeArea, sa.postalCode]
              .filter(Boolean)
              .join(', ')
          : undefined;
        const locName = l.name as string; // "locations/123"
        const locationId = locName.split('/').pop() || locName;
        const title = (l.title as string) || locName;
        out.push({
          name: locName,
          accountId: account,
          locationId,
          title,
          address,
          phone: l.phoneNumbers?.primaryPhone,
          slug: slugify(title),
        });
      }
      locPageToken = j.nextPageToken || '';
      if (!locPageToken) break;
    }
  }
  return out;
}
