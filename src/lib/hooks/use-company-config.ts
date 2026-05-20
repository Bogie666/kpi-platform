'use client';

import { useQuery } from '@tanstack/react-query';

export interface PublicConfig {
  config: {
    company_name?: string;
    company_logo_url?: string;
    timezone?: string;
    [key: string]: string | number | boolean | unknown | null | undefined;
  };
  divisions: Array<{
    code: string;
    name: string;
    color: string | null;
    colorToken: string;
    icon: string | null;
    active: boolean;
    sortOrder: number;
  }>;
  setupCompleted: boolean;
}

/**
 * Cached fetch of the public, non-sensitive config payload from
 * /api/config. Used by NavBar to render the company name and by the
 * dashboard chrome anywhere it needs branding without re-hitting the DB.
 */
export function useCompanyConfig() {
  return useQuery<PublicConfig>({
    queryKey: ['public-config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error(`config: ${res.status}`);
      return (await res.json()) as PublicConfig;
    },
    staleTime: 60_000,
  });
}
