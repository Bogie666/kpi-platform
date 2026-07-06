'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope } from '@/lib/types/kpi';
import type { DailyTargetsResult } from '@/lib/kpi/daily-targets';

export function useDailyTargets() {
  return useQuery<DailyTargetsResult & { cached: boolean }>({
    queryKey: ['daily-targets'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/daily-targets');
      if (!res.ok) throw new Error(`Daily targets fetch failed: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<DailyTargetsResult & { cached: boolean }>;
      return json.data;
    },
    // The underlying payload is server-cached for ~30 min; poll lightly so
    // a morning tab left open picks up the day rollover.
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: true,
  });
}
