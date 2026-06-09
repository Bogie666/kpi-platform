'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope } from '@/lib/types/kpi';
import type { PipelineRevenueResponse } from '@/app/api/kpi/pipeline-revenue/route';

/**
 * Pipeline revenue — expected $ from scheduled-but-not-yet-completed work
 * with won estimates, defaulting to today → EOM (CT-local). Pairs with
 * MTD actual revenue to project month-end totals. Pass `endDate` to
 * override (e.g. quarter-end forecast).
 *
 * Long stale time (5 min) since the underlying data doesn't churn
 * minute-to-minute and the endpoint hits ST live.
 */
export function usePipelineRevenue(opts: { endDate?: string } = {}) {
  return useQuery<PipelineRevenueResponse>({
    queryKey: ['pipeline-revenue', opts.endDate ?? 'eom'],
    queryFn: async () => {
      const url = new URL('/api/kpi/pipeline-revenue', window.location.origin);
      if (opts.endDate) url.searchParams.set('endDate', opts.endDate);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Pipeline revenue fetch failed: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<PipelineRevenueResponse>;
      return json.data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
