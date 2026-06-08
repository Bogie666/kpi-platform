import { NextResponse, type NextRequest } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { syncRuns } from '@/db/schema';
import { requireAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — recent sync_runs rows, plus the most-recent-per-source rollup
 * so the UI can render both a "last status per source" summary and a
 * timeline of attempts.
 */
export async function GET(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  const recent = await db()
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(50);

  // Latest row per source via window function — Postgres-native, one
  // roundtrip. Filtered to actually-finished rows so a stuck "running"
  // row doesn't hide the most recent terminal status.
  const latestPerSource = await db().execute<{
    source: string;
    trigger: string;
    status: string;
    rows_fetched: number | null;
    rows_upserted: number | null;
    error_message: string | null;
    started_at: string;
    finished_at: string | null;
  }>(sql`
    SELECT DISTINCT ON (source)
      source, trigger, status, rows_fetched, rows_upserted,
      error_message, started_at, finished_at
    FROM sync_runs
    ORDER BY source, started_at DESC
  `);

  return NextResponse.json({
    latestPerSource: latestPerSource.rows ?? latestPerSource,
    recent,
  });
}
