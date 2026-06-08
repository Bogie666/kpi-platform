import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getServiceTitanCreds } from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUTH_URL = 'https://auth.servicetitan.io/connect/token';
const API_BASE = 'https://api.servicetitan.io';

/**
 * GET /api/setup/st-business-units
 *
 * Server-side fetch of the tenant's full BU list using credentials
 * already saved into company_config (from Step 2). Used by Step 3 to
 * populate the drag-into-division UI.
 *
 * Optional body: { tenantId, clientId, clientSecret, appKey } to fetch
 * with creds the user hasn't yet persisted (lets Step 3 preview before
 * the user clicks Save on Step 2). POST with overrides; GET uses
 * whatever is in the DB.
 */
async function handler(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  let creds: { tenantId: string; clientId: string; clientSecret: string; appKey: string } | null;
  if (req.method === 'POST') {
    try {
      const b = (await req.json()) as {
        tenantId?: string;
        clientId?: string;
        clientSecret?: string;
        appKey?: string;
      };
      if (b.tenantId && b.clientId && b.clientSecret && b.appKey) {
        creds = {
          tenantId: b.tenantId,
          clientId: b.clientId,
          clientSecret: b.clientSecret,
          appKey: b.appKey,
        };
      } else {
        creds = await getServiceTitanCreds();
      }
    } catch {
      creds = await getServiceTitanCreds();
    }
  } else {
    creds = await getServiceTitanCreds();
  }

  if (!creds) {
    return NextResponse.json(
      { ok: false, error: 'ServiceTitan credentials not configured' },
      { status: 400 },
    );
  }

  // Token.
  const tokRes = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });
  if (!tokRes.ok) {
    return NextResponse.json(
      { ok: false, error: `ST auth failed: ${tokRes.status}` },
      { status: 200 },
    );
  }
  const { access_token } = (await tokRes.json()) as { access_token: string };

  // Page through BUs. ST returns at most 200 per page on this endpoint.
  // ST's settings/v2 BU shape exposes both `name` (display) and
  // `officialName` (invoice/legal). Most tenants use `name`, but a few
  // configurations only fill `officialName` — prefer whichever is set
  // so we never surface a blank label in the wizard.
  type StBu = {
    id: number;
    name?: string | null;
    officialName?: string | null;
    active?: boolean;
  };
  const all: Array<{ id: number; name: string; active?: boolean }> = [];
  let page = 1;
  while (true) {
    const url = `${API_BASE}/settings/v2/tenant/${encodeURIComponent(
      creds.tenantId,
    )}/business-units?page=${page}&pageSize=200`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${access_token}`, 'ST-App-Key': creds.appKey },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `BU fetch failed page ${page}: ${res.status}` },
        { status: 200 },
      );
    }
    const body = (await res.json()) as { data?: StBu[]; hasMore?: boolean };
    if (body.data?.length) {
      for (const bu of body.data) {
        if (bu.active === false) continue;
        const label =
          (bu.name && bu.name.trim()) ||
          (bu.officialName && bu.officialName.trim()) ||
          `Business Unit #${bu.id}`;
        all.push({ id: bu.id, name: label, active: bu.active });
      }
    }
    if (!body.hasMore) break;
    page++;
    if (page > 50) break; // safety
  }

  return NextResponse.json({ ok: true, businessUnits: all });
}

export const GET = handler;
export const POST = handler;
