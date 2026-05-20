/**
 * Server-side token manager for Google Business Profile API.
 * Trades a stored refresh token for short-lived access tokens, caches
 * with a 5-minute safety buffer, and re-fetches automatically when the
 * cached token is near expiry.
 *
 * Credentials live in `company_config` (populated by the setup wizard).
 * No env-var fallback in production — DB is the single source of truth.
 */
import { getGoogleCreds } from '@/lib/config-service';

export class GoogleTokenManager {
  private accessToken: string | null = null;
  private expiresAt = 0;

  async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && now < this.expiresAt - 300) return this.accessToken;

    const creds = await getGoogleCreds();
    if (!creds) {
      throw new Error(
        'Google credentials are not configured. Run the setup wizard at /setup.',
      );
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
      }),
    });
    if (!res.ok) throw new Error(`refresh token: ${res.status} ${await res.text()}`);
    const tokens = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = tokens.access_token;
    this.expiresAt = now + tokens.expires_in;
    return this.accessToken;
  }
}

let _tm: GoogleTokenManager | null = null;
export function getTokenManager(): GoogleTokenManager {
  if (!_tm) _tm = new GoogleTokenManager();
  return _tm;
}
