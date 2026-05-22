'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/primitives/button';

/**
 * Reusable "Sync now" trigger. Used at the end of the setup wizard and
 * on the admin home. Stays disabled while a sync is running and shows
 * the elapsed time so the user has feedback while waiting (the first
 * sync on a fresh tenant can take several minutes).
 */
export function SyncNowButton({
  label = 'Sync now',
  size = 'md',
  variant = 'default',
  onDone,
}: {
  label?: string;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'default' | 'ghost';
  onDone?: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function trigger() {
    setRunning(true);
    setMsg('Syncing — this can take several minutes…');
    setErr(null);
    const started = Date.now();
    try {
      const res = await fetch('/api/admin/sync-now', { method: 'POST' });
      const j = (await res.json()) as { ok?: boolean; error?: string; durationMs?: number };
      const secs = Math.round((Date.now() - started) / 1000);
      if (!j.ok) {
        setErr(j.error ?? `Failed (${res.status})`);
        setMsg(null);
      } else {
        setMsg(`Sync completed in ${secs}s.`);
        onDone?.();
      }
    } catch (err) {
      setErr(err instanceof Error ? err.message : String(err));
      setMsg(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 items-start">
      <Button variant={variant} size={size} disabled={running} onClick={trigger}>
        <RefreshCw className={running ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
        {running ? 'Syncing…' : label}
      </Button>
      {msg && <div className="text-[11px] text-muted">{msg}</div>}
      {err && <div className="text-[11px] text-down">{err}</div>}
    </div>
  );
}
