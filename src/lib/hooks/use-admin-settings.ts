'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface PacingSettingsDto {
  workdayHours: number;
  startHour: number;
}

export function usePacingSettings() {
  return useQuery<PacingSettingsDto>({
    queryKey: ['admin-settings-pacing'],
    queryFn: async () => {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error(`Settings fetch failed: ${res.status}`);
      const json = (await res.json()) as { pacing: PacingSettingsDto };
      return json.pacing;
    },
    staleTime: 10_000,
  });
}

export function usePacingSettingsUpdate() {
  const qc = useQueryClient();
  return useMutation<PacingSettingsDto, Error, PacingSettingsDto>({
    mutationFn: async (pacing) => {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pacing }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Save failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as { pacing: PacingSettingsDto };
      return json.pacing;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings-pacing'] }),
  });
}
