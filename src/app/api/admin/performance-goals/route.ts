import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { targets, technicianRoles, employees, departments, technicianPeriod } from '@/db/schema';
import { requireAdminAuth } from '@/lib/admin-auth';
import { validatePerformanceGoalInput, TECHNICIAN_GOAL_METRICS, MEMBERSHIP_GOAL_METRICS } from '@/lib/performance-goals';
import { performanceGoalUpsertSql } from '@/lib/performance-goal-upsert';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const goalDomain = or(and(inArray(targets.scope, ['role', 'employee']), inArray(targets.metric, TECHNICIAN_GOAL_METRICS)), and(eq(targets.scope, 'company'), inArray(targets.metric, MEMBERSHIP_GOAL_METRICS)))!;

/** Existing tenant-local targets table. No secrets in URLs and no fail-open
 * auth: use the same server-injected header/session as all other admin APIs. */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;
  let input: unknown;
  try { input = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const database = db();
  const [roles, people, divisions, reported] = await Promise.all([
    database.select({ code: technicianRoles.code }).from(technicianRoles).where(eq(technicianRoles.active, true)),
    database.select({ id: employees.serviceTitanId }).from(employees).where(eq(employees.active, true)),
    database.select({ code: departments.code }).from(departments).where(eq(departments.active, true)),
    database.selectDistinct({ id: technicianPeriod.employeeId }).from(technicianPeriod).where(sql`NOT EXISTS (SELECT 1 FROM employees e WHERE e.service_titan_id = technician_period.employee_id AND e.active = false)`),
  ]);
  const parsed = validatePerformanceGoalInput(input, {
    roleCodes: roles.map((r) => r.code),
    employeeIds: [...people.flatMap((p) => p.id === null ? [] : [p.id]), ...reported.map(p => Number(p.id))],
    departmentCodes: divisions.map((d) => d.code),
  });
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;
  const technicianGoal = ['role','employee'].includes(body.scope) && TECHNICIAN_GOAL_METRICS.includes(body.metric);
  const membershipGoal = body.scope === 'company' && MEMBERSHIP_GOAL_METRICS.includes(body.metric);
  if (!technicianGoal && !membershipGoal) return NextResponse.json({ error: 'This endpoint only manages technician targets and membership goals, never financial budgets.' }, { status: 400 });
  if (body.id != null) { const existing = await database.select({id: targets.id}).from(targets).where(and(eq(targets.id,body.id),goalDomain)); if (!existing.length) return NextResponse.json({error:'Performance goal not found'}, {status:404}); }
  // batch() is a real Neon transaction; an interactive db.transaction() is
  // not supported by the HTTP driver. Lock before checking conflicts/upserting.
  const result = await database.batch([
    database.execute(sql`LOCK TABLE targets IN SHARE ROW EXCLUSIVE MODE`),
    database.execute(performanceGoalUpsertSql(parsed.value)),
  ]);
  const outcome = result[1].rows[0] as { id: number | null; action: string } | undefined;
  if (outcome?.action === 'conflict') return NextResponse.json({ error: 'Another goal overlaps this metric, scope, and effective window. Edit that goal or choose nonoverlapping dates.' }, { status: 409 });
  if (outcome?.action === 'not_found') return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  if (!outcome?.id) return NextResponse.json({ error: 'Goal could not be saved' }, { status: 500 });
  const [row] = await database.select().from(targets).where(eq(targets.id, outcome.id));
  return NextResponse.json({ ok: true, action: outcome.action, row });
}

/** Optionally filter editor domain; otherwise retain the legacy list API. */
export async function GET(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;
  const rows = await db().select().from(targets).where(goalDomain);
  return NextResponse.json({ ok: true, count: rows.length, rows });
}

export async function DELETE(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;
  const param = req.nextUrl.searchParams.get('id');
  const id = Number(param);
  if (!param || !/^[1-9]\d*$/.test(param) || !Number.isSafeInteger(id)) return NextResponse.json({ error: 'Positive integer id required' }, { status: 400 });
  const database = db();
  // Optional scope prevents a stale new editor from deleting a financial row.
  const scope = req.nextUrl.searchParams.get('scope');
  const deleted = await database.delete(targets).where(and(eq(targets.id, id), goalDomain, scope ? eq(targets.scope, scope) : undefined)).returning();
  if (!deleted.length) return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  return NextResponse.json({ ok: true, deleted });
}

