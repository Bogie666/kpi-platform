import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { departments } from '@/db/schema';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getDivisions, getTechnicianRoles } from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — divisions (with their current default role) + available roles. */
export async function GET(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  const [divisions, roles] = await Promise.all([
    db()
      .select({
        code: departments.code,
        name: departments.name,
        defaultRoleCode: departments.defaultRoleCode,
        active: departments.active,
        sortOrder: departments.sortOrder,
      })
      .from(departments)
      .orderBy(departments.sortOrder),
    getTechnicianRoles(true),
  ]);
  // Silence: getDivisions is exported and could be used here, but the
  // sort-order + defaultRoleCode shape we need isn't in the helper; we
  // query departments directly. Keeping the import avoids drift if the
  // helper ever picks up new behavior we want.
  void getDivisions;
  return NextResponse.json({ divisions, roles });
}

/**
 * POST — bulk-update each division's default role.
 * Body: { updates: [{ divisionCode, defaultRoleCode|null }] }
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  type Body = {
    updates?: Array<{ divisionCode?: string; defaultRoleCode?: string | null }>;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let updated = 0;
  for (const u of body.updates ?? []) {
    const code = u.divisionCode?.trim();
    if (!code) continue;
    const role = u.defaultRoleCode == null || u.defaultRoleCode === '' ? null : u.defaultRoleCode;
    await db()
      .update(departments)
      .set({ defaultRoleCode: role, updatedAt: new Date() })
      .where(eq(departments.code, code));
    updated++;
  }
  return NextResponse.json({ ok: true, updated });
}
