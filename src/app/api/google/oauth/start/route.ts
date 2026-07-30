import { NextResponse, type NextRequest } from 'next/server';
import { buildGoogleOAuthUrl, oauthConfigured } from '@/lib/sync/google/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/google/oauth/start
 * Kicks off the shared-app Google OAuth consent flow. Admin-gated by the
 * edge middleware. Redirects the browser to Google's consent screen.
 */
export async function GET(req: NextRequest) {
  if (!oauthConfigured()) {
    return NextResponse.json(
      {
        error:
          'Google OAuth is not configured on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
      },
      { status: 400 },
    );
  }
  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID();
  return NextResponse.redirect(buildGoogleOAuthUrl(origin, state));
}
