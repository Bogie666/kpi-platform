'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope } from '@/lib/types/kpi';
import type { PipelineRevenueResponse } from '@/app/api/kpi/pipeline-revenue/route';

/**
 * Pipeline revenue — live ServiceTitan Job.total for Scheduled/InProgress
 * jobs with an active appointment starting today through the tenant-local
 * current month end. It intentionally does not follow the dashboard period
 * selector: this mirrors the Operations report's forward-looking pipeline.
 *
 * Long stale time (5 min) since the endpoint reads live ServiceTitan data.
 */
export function usePipelineRevenue() {
  return useQuery<PipelineRevenueResponse>({
    queryKey: ['pipeline-revenue'],
    queryFn: async () => {
      const url = new URL('/api/kpi/pipeline-revenue', window.location.origin);
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
