import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  getConfig,
  getGoogleLocations,
  saveGoogleLocations,
  setManyConfig,
} from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRED_KEYS = ['google_client_id', 'google_client_secret', 'google_refresh_token'] as const;

/**
 * GET — current Google integration state. Credentials themselves are
 * never returned in plain text (they're sensitive); we just report
 * whether each one is set, so the admin form can prefill empty inputs
 * with a "(currently set)" hint without re-leaking the secrets.
 */
export async function GET(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  const [clientId, clientSecret, refreshToken, locations] = await Promise.all([
    getConfig('google_client_id'),
    getConfig('google_client_secret'),
    getConfig('google_refresh_token'),
    getGoogleLocations(true),
  ]);

  return NextResponse.json({
    hasCreds: {
      google_client_id: Boolean(clientId),
      google_client_secret: Boolean(clientSecret),
      google_refresh_token: Boolean(refreshToken),
    },
    locations: locations.map((l) => ({
      name: l.name,
      accountId: l.accountId,
      locationId: l.locationId,
      slug: l.slug,
    })),
  });
}

/**
 * POST — update creds + locations together. Empty cred fields are
 * ignored (so the admin can leave a value alone while only editing
 * locations); explicit values overwrite. Locations are replaced
 * wholesale — anything not in the payload is soft-deleted by
 * saveGoogleLocations' upsert flow.
 *
 * Does NOT touch `setup_completed` or `setup_step` — this is a
 * post-setup edit, not a wizard transition.
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  type Body = {
    creds?: Partial<Record<(typeof CRED_KEYS)[number], string>>;
    locations?: Array<{ name: string; accountId: string; locationId: string; slug: string }>;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const entries: Array<{ key: string; value: string }> = [];
  for (const key of CRED_KEYS) {
    const v = body.creds?.[key];
    if (typeof v === 'string' && v.trim() !== '') entries.push({ key, value: v.trim() });
  }
  if (entries.length > 0) await setManyConfig(entries, { updatedBy: 'admin' });

  let locationsResult = { upserted: 0 };
  if (Array.isArray(body.locations)) {
    const cleaned = body.locations.filter(
      (l) => l.slug?.trim() && l.accountId?.trim() && l.locationId?.trim(),
    );
    locationsResult = await saveGoogleLocations(cleaned);
  }

  return NextResponse.json({ ok: true, credsUpdated: entries.length, locations: locationsResult });
}
