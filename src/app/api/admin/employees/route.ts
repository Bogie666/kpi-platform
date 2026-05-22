import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  getEmployees,
  getTechnicianRoles,
  setEmployeeRoles,
} from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — list every employee with their current role + lock state, plus
 * the available roles so the UI can render a dropdown without a second
 * fetch.
 */
export async function GET(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  const [people, roles] = await Promise.all([
    getEmployees(true),
    getTechnicianRoles(true),
  ]);
  return NextResponse.json({ employees: people, roles });
}

/**
 * POST — update role + lock for one or more employees. Body:
 *   { updates: [{ id, roleCode|null, roleLocked }] }
 *
 * Locking with a null/empty role is allowed and means "this employee is
 * pinned to no role" (they won't appear on any tab). The sync will skip
 * them as long as roleLocked stays true.
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  type Body = {
    updates?: Array<{ id?: number; roleCode?: string | null; roleLocked?: boolean }>;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const cleaned: Array<{ id: number; roleCode: string | null; roleLocked: boolean }> = [];
  for (const u of body.updates ?? []) {
    if (typeof u.id !== 'number') continue;
    cleaned.push({
      id: u.id,
      roleCode: u.roleCode === '' ? null : (u.roleCode ?? null),
      roleLocked: Boolean(u.roleLocked),
    });
  }
  if (cleaned.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const result = await setEmployeeRoles(cleaned);
  return NextResponse.json({ ok: true, ...result });
}
