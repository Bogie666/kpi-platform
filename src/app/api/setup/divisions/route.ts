import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { saveBusinessUnits, saveDivisions } from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/setup/divisions
 * Body:
 *   {
 *     divisions: [{ code, name, color, icon?, hasTechnicians?, hasComfortAdvisors?, sortOrder? }],
 *     buAssignments: [{ id, name, departmentCode|null }]  // departmentCode=null = drop
 *   }
 *
 * Writes both the division definitions and the BU→division mapping in
 * one atomic-ish operation. BU rows not in the payload get soft-deleted.
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  type Body = {
    divisions?: Array<{
      code: string;
      name: string;
      color: string;
      icon?: string | null;
      hasTechnicians?: boolean;
      hasComfortAdvisors?: boolean;
      sortOrder?: number;
    }>;
    buAssignments?: Array<{ id: number; name: string; departmentCode: string | null }>;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const divisions = body.divisions ?? [];
  const buAssignments = body.buAssignments ?? [];

  const divResult = await saveDivisions(divisions);
  const buResult = await saveBusinessUnits(buAssignments);

  return NextResponse.json({
    ok: true,
    divisions: divResult,
    businessUnits: buResult,
  });
}
