import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { discoverGbpLocations } from '@/lib/sync/google/oauth';
import { getTokenManager } from '@/lib/sync/google/token-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/setup/google-discover
 * Uses the stored refresh token (via the token manager) to list every GBP
 * account + location the connected Google user manages, so the admin can
 * pick locations from a list instead of hand-entering account/location IDs.
 */
export async function GET(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  try {
    const token = await getTokenManager().getAccessToken();
    const locations = await discoverGbpLocations(token);
    return NextResponse.json({ ok: true, locations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
