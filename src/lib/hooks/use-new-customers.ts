'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope } from '@/lib/types/kpi';
import type { NewCustomersResponse } from '@/app/api/kpi/new-customers/route';
import type { DashboardParams } from '@/lib/state/url-params';

/**
 * New-customer counts for the active period (cur / LY / LY2). Same period
 * shape as useFinancial so the cards stay in sync. Long-ish stale time
 * (2 min) since the underlying ST call is live and the number doesn't
 * change minute-by-minute.
 */
export function useNewCustomers(params: DashboardParams) {
  const q = {
    preset: params.period,
    from: params.from ?? undefined,
    to: params.to ?? undefined,
  };

  return useQuery<NewCustomersResponse>({
    queryKey: ['new-customers', q],
    queryFn: async () => {
      const url = new URL('/api/kpi/new-customers', window.location.origin);
      Object.entries(q).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`New customers fetch failed: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<NewCustomersResponse>;
      return json.data;
    },
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
