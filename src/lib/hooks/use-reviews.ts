'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope } from '@/lib/types/kpi';
import type { ReviewsResponse } from '@/app/api/kpi/reviews/route';

export type { ReviewsResponse };

export function useReviews() {
  return useQuery<ReviewsResponse>({
    queryKey: ['reviews'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/reviews');
      if (!res.ok) throw new Error(`reviews: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<ReviewsResponse>;
      return json.data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  });
}
