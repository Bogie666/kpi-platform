import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getAccessToken, readStConfig } from '@/lib/sync/servicetitan/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;
  let body: { categoryId?: string; reportId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const categoryId = body.categoryId?.trim();
  const reportId = body.reportId?.trim();
  if (!categoryId || !reportId) {
    return NextResponse.json({ ok: false, error: 'Report category ID and report ID are required' }, { status: 400 });
  }
  try {
    const cfg = await readStConfig();
    const token = await getAccessToken(cfg);
    const res = await fetch(
      `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-category/${encodeURIComponent(categoryId)}/reports/${encodeURIComponent(reportId)}/data?page=1&pageSize=3`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'ST-App-Key': cfg.appKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parameters: [] }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Report test failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const result = (await res.json()) as { fields?: Array<{ name: string; label?: string; dataType?: string }>; data?: unknown[][] };
    return NextResponse.json({ ok: true, fields: result.fields ?? [], rows: result.data?.length ?? 0 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
