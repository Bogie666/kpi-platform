import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { localTodayISO, shiftISO } from '@/lib/time';
import { runStReport } from '@/lib/sync/servicetitan/technician-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  let body: { categoryId?: string; reportId?: string; from?: string; to?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const categoryId = body.categoryId?.trim();
  const reportId = body.reportId?.trim();
  if (!categoryId || !reportId) {
    return NextResponse.json({ ok: false, error: 'categoryId and reportId required' }, { status: 400 });
  }

  const to = body.to ?? (await localTodayISO());
  const from = body.from ?? shiftISO(to, -7);

  try {
    const result = await runStReport(categoryId, reportId, [
      { name: 'From', value: from },
      { name: 'To', value: to },
    ]);
    return NextResponse.json({
      ok: true,
      fields: result.fields ?? [],
      rows: result.data?.length ?? 0,
      sample: (result.data ?? []).slice(0, 3),
      totalCount: result.totalCount,
      hasMore: result.hasMore,
      from,
      to,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
