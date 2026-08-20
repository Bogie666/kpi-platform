import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { localTodayISO, shiftISO } from '@/lib/time';
import { getAccessToken, readStConfig } from '@/lib/sync/servicetitan/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface ReportParameter {
  name: string;
  value: unknown;
}

/**
 * Test an estimate-analysis style report. Mirrors the sync worker's
 * parameters: the report requires DateType + From + To (DateType=3 is
 * "Creation Date" per the report's acceptValues definition: 0=SoldOn,
 * 1=FollowUp, 2=ParentCompletion, 3=CreationDate). Callers may override
 * or extend via `extraParameters`.
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;
  let body: {
    categoryId?: string;
    reportId?: string;
    from?: string;
    to?: string;
    extraParameters?: ReportParameter[];
  };
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

  const to = body.to ?? (await localTodayISO());
  const from = body.from ?? shiftISO(to, -7);

  // Defaults match the sync worker (estimate-analysis-report.ts). Extra
  // parameters from the caller override defaults by name.
  const defaults: ReportParameter[] = [
    { name: 'DateType', value: 3 },
    { name: 'From', value: from },
    { name: 'To', value: to },
  ];
  const extras = Array.isArray(body.extraParameters)
    ? body.extraParameters.filter(
        (p): p is ReportParameter =>
          !!p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim() !== '',
      )
    : [];
  const merged = new Map<string, ReportParameter>();
  for (const p of defaults) merged.set(p.name, p);
  for (const p of extras) merged.set(p.name, { name: p.name, value: p.value });
  const parameters = [...merged.values()];

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
        body: JSON.stringify({ parameters }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Report test failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const result = (await res.json()) as { fields?: Array<{ name: string; label?: string; dataType?: string }>; data?: unknown[][] };
    return NextResponse.json({ ok: true, fields: result.fields ?? [], rows: result.data?.length ?? 0, parametersSent: parameters });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
