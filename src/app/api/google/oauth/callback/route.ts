import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCode, fetchProfileEmail } from '@/lib/sync/google/oauth';
import { setConfig } from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/google/oauth/callback
 * Google redirects here with ?code=. We exchange it for tokens, then persist
 * the shared client id/secret + the captured refresh_token into company_config
 * so the existing token-manager / reviews-sync pipeline works with no changes.
 * Then bounce back into the setup step with a success flag.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  const back = (suffix: string) => NextResponse.redirect(new URL(`/setup?step=google${suffix}`, origin));

  if (err) return back(`&gconnect=failed&reason=${encodeURIComponent(err)}`);
  if (!code) return back('&gconnect=failed&reason=missing_code');

  try {
    const token = await exchangeCode(origin, code);
    if (!token.refresh_token) {
      // Google only returns a refresh_token on first consent. prompt=consent
      // forces it, but guard anyway.
      return back('&gconnect=failed&reason=no_refresh_token');
    }
    let email: string | undefined;
    try {
      email = await fetchProfileEmail(token.access_token);
    } catch {
      /* non-fatal */
    }

    // Persist creds so the DB stays the single source of truth (token-manager
    // reads all three from company_config).
    const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
    await setConfig('google_client_id', clientId, { isSensitive: true, updatedBy: 'oauth' });
    await setConfig('google_client_secret', clientSecret, { isSensitive: true, updatedBy: 'oauth' });
    await setConfig('google_refresh_token', token.refresh_token, {
      isSensitive: true,
      updatedBy: 'oauth',
    });
    if (email) {
      await setConfig('google_connected_email', email, { updatedBy: 'oauth' });
    }

    return back(`&gconnect=success${email ? `&email=${encodeURIComponent(email)}` : ''}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return back(`&gconnect=failed&reason=${encodeURIComponent(msg)}`);
  }
}
