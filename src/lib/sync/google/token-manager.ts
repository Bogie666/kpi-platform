/**
 * Server-side token manager for Google Business Profile API.
 * Trades a stored refresh token for short-lived access tokens, caches
 * with a 5-minute safety buffer, and re-fetches automatically when the
 * cached token is near expiry.
 *
 * Required env: GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */

export class GoogleTokenManager {
  private refreshToken: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor() {
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!refreshToken) throw new Error('GOOGLE_REFRESH_TOKEN env var required');
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID env var required');
    if (!clientSecret) throw new Error('GOOGLE_CLIENT_SECRET env var required');
    this.refreshToken = refreshToken;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && now < this.expiresAt - 300) return this.accessToken;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
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
