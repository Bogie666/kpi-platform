import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUTH_URL = 'https://auth.servicetitan.io/connect/token';
const API_BASE = 'https://api.servicetitan.io';

/**
 * POST /api/setup/test-st
 * Body: { tenantId, clientId, clientSecret, appKey }
 *
 * Runs the same OAuth flow as src/lib/sync/servicetitan/auth.ts plus a
 * follow-up GET against /settings/v2/.../business-units to confirm the
 * `appKey` is good — auth-server-only creds will pass step 1 but fail
 * step 2 with a 401 on the resource API.
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  type Body = {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    appKey?: string;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const tenantId = body.tenantId?.trim();
  const clientId = body.clientId?.trim();
  const clientSecret = body.clientSecret?.trim();
  const appKey = body.appKey?.trim();
  if (!tenantId || !clientId || !clientSecret || !appKey) {
    return NextResponse.json(
      { ok: false, error: 'All four credentials are required' },
      { status: 400 },
    );
  }

  // 1. OAuth client-credentials token.
  let accessToken: string;
  try {
    const tokRes = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokRes.ok) {
      const text = await tokRes.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: `Auth failed (${tokRes.status}): ${text.slice(0, 300)}` },
        { status: 200 },
      );
    }
    const tok = (await tokRes.json()) as { access_token?: string };
    if (!tok.access_token) {
      return NextResponse.json(
        { ok: false, error: 'Auth response missing access_token' },
        { status: 200 },
      );
    }
    accessToken = tok.access_token;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Auth network error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 200 },
    );
  }

  // 2. Probe the BUs endpoint to verify appKey + tenantId.
  try {
    const probe = await fetch(
      `${API_BASE}/settings/v2/tenant/${encodeURIComponent(tenantId)}/business-units?page=1&pageSize=1`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
          'ST-App-Key': appKey,
        },
      },
    );
    if (!probe.ok) {
      const text = await probe.text().catch(() => '');
      return NextResponse.json(
        {
          ok: false,
          error: `Business-units probe failed (${probe.status}): ${text.slice(0, 300)}`,
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Probe network error: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 200 },
    );
  }
}
