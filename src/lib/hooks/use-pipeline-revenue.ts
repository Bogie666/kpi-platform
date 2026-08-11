'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope } from '@/lib/types/kpi';
import type { PipelineRevenueResponse } from '@/app/api/kpi/pipeline-revenue/route';

/**
 * Pipeline revenue — expected $ from WON (sold) estimates on scheduled-but-
 * not-yet-completed work, dated within the selected period's budget window
 * (the period extended to its calendar month/quarter/year end). Pairs with
 * actual revenue so actual + pipeline = a clean period-end projection.
 *
 * Follows the dashboard period selector: pass the current preset (and any
 * explicit from/to) so the pipeline window tracks the view. Long stale time
 * (5 min) since the underlying data doesn't churn minute-to-minute and the
 * endpoint hits ST live.
 */
export function usePipelineRevenue(
  opts: { period?: string; from?: string | null; to?: string | null } = {},
) {
  return useQuery<PipelineRevenueResponse>({
    queryKey: ['pipeline-revenue', opts.period ?? 'mtd', opts.from ?? null, opts.to ?? null],
    queryFn: async () => {
      const url = new URL('/api/kpi/pipeline-revenue', window.location.origin);
      if (opts.period) url.searchParams.set('preset', opts.period);
      if (opts.from) url.searchParams.set('from', opts.from);
      if (opts.to) url.searchParams.set('to', opts.to);
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
