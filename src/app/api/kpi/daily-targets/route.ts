/**
 * GET /api/kpi/daily-targets — today's jobs-needed pacing per division.
 * Heavy lifting (warehouse reads + ST crawl) lives in lib/kpi/daily-targets
 * behind a kpi_cache memo; pass ?refresh=1 to force a recompute.
 */
import { NextResponse } from 'next/server';
import { demoResponse } from '@/lib/demo';
import type { NextRequest } from 'next/server';

import { getDailyTargets } from '@/lib/kpi/daily-targets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const demo = demoResponse('daily-targets', { preset: req.nextUrl.searchParams.get('preset') });
  if (demo) return demo;
  const force = req.nextUrl.searchParams.get('refresh') === '1';
  const data = await getDailyTargets({ force });
  return NextResponse.json({ data });
}
