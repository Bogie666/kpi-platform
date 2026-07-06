/**
 * Admin-only — consolidate target rows that still live under merged-away
 * division codes (e.g. legacy `sales`, `electrical_install`) onto their
 * survivor code, so a division never has budgets split across two codes.
 *
 * Why this exists: the division merge (src/lib/divisions.ts) collapses codes
 * for display and rollups, but historical `targets` rows were entered under
 * the old codes. The admin picker now writes to the survivor code, so
 * copy-then-edit could leave both a legacy row and a survivor row for the
 * same division/month — and the financial screen (which sums the merge)
 * double-counts them.
 *
 * Rule: for each legacy-coded row, reassign its scopeValue to the survivor.
 * If a survivor row already exists for the same (metric, scope, window), the
 * survivor wins (it's what the admin now edits) and the legacy row is dropped.
 *
 * Safe by default: dry-run unless `?apply=1`. Returns a full report of what
 * would change / changed.
 *
 *   /api/admin/consolidate-target-divisions          → preview
 *   /api/admin/consolidate-target-divisions?apply=1  → execute
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { targets } from '@/db/schema';
import { requireAdminAuth } from '@/lib/admin-auth';
import { isMergedAwayDivision, mergeDivisionCode } from '@/lib/divisions';
import { loadDivisionModel } from '@/lib/config-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth(req);
  if (denied) return denied;
  await loadDivisionModel();
  const apply = req.nextUrl.searchParams.get('apply') === '1';
  const database = db();
  const rows = await database.select().from(targets);

  const keyOf = (metric: string, scope: string, code: string | null, from: string, to: string) =>
    `${metric}|${scope}|${code ?? ''}|${from}|${to}`;
  const present = new Set(
    rows.map((r) => keyOf(r.metric, r.scope, r.scopeValue, r.effectiveFrom, r.effectiveTo)),
  );

  const reassign: Array<{ id: number; from: string; to: string; window: string; value: number }> = [];
  const drop: Array<{ id: number; code: string; window: string; value: number; supersededBy: string }> = [];

  for (const r of rows) {
    if (!r.scopeValue || !isMergedAwayDivision(r.scopeValue)) continue;
    const survivor = mergeDivisionCode(r.scopeValue);
    const survivorKey = keyOf(r.metric, r.scope, survivor, r.effectiveFrom, r.effectiveTo);
    const window = `${r.effectiveFrom}→${r.effectiveTo}`;
    if (present.has(survivorKey)) {
      // Survivor row already exists — it wins; drop the legacy duplicate.
      drop.push({ id: r.id, code: r.scopeValue, window, value: Number(r.targetValue), supersededBy: survivor });
    } else {
      // No survivor yet — reassign this row's code and reserve the key so a
      // second legacy row for the same window collapses instead of duplicating.
      reassign.push({ id: r.id, from: r.scopeValue, to: survivor, window, value: Number(r.targetValue) });
      present.add(survivorKey);
    }
  }

  if (apply) {
    for (const d of drop) {
      await database.delete(targets).where(eq(targets.id, d.id));
    }
    for (const a of reassign) {
      await database
        .update(targets)
        .set({ scopeValue: a.to, updatedAt: new Date() })
        .where(eq(targets.id, a.id));
    }
  }

  return NextResponse.json({
    applied: apply,
    reassignedCount: reassign.length,
    droppedCount: drop.length,
    reassign,
    drop,
    note: apply
      ? 'Done. Legacy target rows consolidated onto survivor division codes.'
      : 'Dry run — add ?apply=1 to execute.',
  });
}
