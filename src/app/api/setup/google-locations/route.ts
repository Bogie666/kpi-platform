import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { saveGoogleLocations } from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/setup/google-locations
 * Body: { locations: [{ name, accountId, locationId, slug }] }
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  type Body = {
    locations?: Array<{ name: string; accountId: string; locationId: string; slug: string }>;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const locations = body.locations ?? [];
  const result = await saveGoogleLocations(locations);
  return NextResponse.json({ ok: true, ...result });
}
