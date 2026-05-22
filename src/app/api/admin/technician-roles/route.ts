import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  getTechnicianRoles,
  saveTechnicianRoles,
  type RoleMetric,
} from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_METRICS: RoleMetric[] = ['revenue', 'avgTicket', 'jobs', 'closeRate'];

export async function GET(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;
  const roles = await getTechnicianRoles(true);
  return NextResponse.json({ roles });
}

/**
 * POST — replace the entire role list. Anything not in the payload is
 * soft-deleted (so its tab disappears from the dashboard). Codes are
 * the primary key and are case-insensitive-ish — we normalize to
 * lowercase + underscores like the divisions step does.
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  type Body = {
    roles?: Array<{
      code?: string;
      name?: string;
      primaryMetric?: string;
      primaryMetricLabel?: string;
      sortOrder?: number;
    }>;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const cleaned: Array<{
    code: string;
    name: string;
    primaryMetric: RoleMetric;
    primaryMetricLabel: string;
    sortOrder: number;
  }> = [];
  const seenCodes = new Set<string>();
  for (const r of body.roles ?? []) {
    const code = (r.code ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const name = (r.name ?? '').trim();
    if (!code || !name) continue;
    if (seenCodes.has(code)) {
      return NextResponse.json(
        { error: `Duplicate role code: ${code}` },
        { status: 400 },
      );
    }
    seenCodes.add(code);
    const metric = VALID_METRICS.includes(r.primaryMetric as RoleMetric)
      ? (r.primaryMetric as RoleMetric)
      : 'revenue';
    cleaned.push({
      code,
      name,
      primaryMetric: metric,
      primaryMetricLabel: (r.primaryMetricLabel ?? 'Closed revenue').trim(),
      sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 0,
    });
  }

  const result = await saveTechnicianRoles(cleaned);
  return NextResponse.json({ ok: true, ...result });
}
