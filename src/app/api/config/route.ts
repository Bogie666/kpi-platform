import { NextResponse } from 'next/server';
import { getDivisions, getPublicConfig, isSetupCompleted } from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/config — public, non-sensitive config payload consumed by the
 * dashboard frontend on mount (company_name, logo, timezone) plus the
 * full division list so client components can render branding without
 * a separate fetch.
 */
export async function GET() {
  const [config, divisions, completed] = await Promise.all([
    getPublicConfig(),
    getDivisions(true),
    isSetupCompleted(),
  ]);
  return NextResponse.json({
    config,
    divisions: divisions.map((d) => ({
      code: d.code,
      name: d.name,
      color: d.color,
      colorToken: d.colorToken,
      icon: d.icon,
      active: d.active,
      sortOrder: d.sortOrder,
    })),
    setupCompleted: completed,
  });
}
