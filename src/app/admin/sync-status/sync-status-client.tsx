'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { SectionHead } from '@/components/primitives/section-head';
import { SyncNowButton } from '@/components/admin/sync-now-button';
import { cn } from '@/lib/cn';

interface Run {
  source: string;
  trigger: string;
  status: string;
  rowsFetched?: number | null;
  rowsUpserted?: number | null;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  // raw API uses snake_case on the rollup query
  rows_fetched?: number | null;
  rows_upserted?: number | null;
  error_message?: string | null;
  started_at?: string;
  finished_at?: string | null;
}

interface Payload {
  latestPerSource: Run[];
  recent: Run[];
}

export function SyncStatusClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch('/api/admin/sync-status');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = (await res.json()) as Payload;
      setData(j);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const latest = data?.latestPerSource ?? [];
  const recent = data?.recent ?? [];

  return (
    <div className="flex flex-col gap-6">
      <SectionHead eyebrow="Admin" title="Sync status" />

      <Panel eyebrow="Trigger" title="Run a sync now">
        <p className="text-[13px] text-muted leading-relaxed max-w-2xl mb-3">
          Forces every source that's due. Cron runs the same path every 15 min,
          so usually you don't need this — but it's handy for debugging or to
          warm up a fresh tenant.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <SyncNowButton variant="primary" onDone={() => void load()} />
          <Button onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh status
          </Button>
        </div>
      </Panel>

      {error && (
        <div className="text-[12px] text-down bg-down-bg border border-down/30 rounded-btn px-3 py-2">
          {error}
        </div>
      )}

      <Panel eyebrow="By source" title="Last run per source">
        {latest.length === 0 ? (
          <div className="text-[13px] text-muted">
            No sync has ever run. Click <strong className="text-text">Sync now</strong> above.
          </div>
        ) : (
          <div className="border border-border rounded-panel overflow-hidden">
            <div
              className="grid text-[11px] uppercase text-muted bg-surface-2 px-3 py-2 gap-3"
              style={{ gridTemplateColumns: '1fr 100px 90px 110px 1fr 140px' }}
            >
              <div>Source</div>
              <div>Status</div>
              <div>Rows</div>
              <div>Trigger</div>
              <div>Error</div>
              <div>When</div>
            </div>
            {latest.map((r, i) => {
              const status = r.status;
              const error = r.error_message ?? r.errorMessage ?? '';
              const fetched = r.rows_fetched ?? r.rowsFetched ?? null;
              const upserted = r.rows_upserted ?? r.rowsUpserted ?? null;
              const startedAt = r.started_at ?? r.startedAt;
              return (
                <RunRow
                  key={`${r.source}-${i}`}
                  source={r.source}
                  status={status}
                  fetched={fetched}
                  upserted={upserted}
                  trigger={r.trigger}
                  error={error}
                  startedAt={startedAt}
                />
              );
            })}
          </div>
        )}
      </Panel>

      <Panel eyebrow="Timeline" title="Last 50 runs">
        {recent.length === 0 ? (
          <div className="text-[13px] text-muted">No runs yet.</div>
        ) : (
          <div className="border border-border rounded-panel overflow-hidden">
            <div
              className="grid text-[11px] uppercase text-muted bg-surface-2 px-3 py-2 gap-3"
              style={{ gridTemplateColumns: '1fr 100px 90px 110px 1fr 140px' }}
            >
              <div>Source</div>
              <div>Status</div>
              <div>Rows</div>
              <div>Trigger</div>
              <div>Error</div>
              <div>When</div>
            </div>
            {recent.map((r, i) => (
              <RunRow
                key={i}
                source={r.source}
                status={r.status}
                fetched={r.rowsFetched ?? null}
                upserted={r.rowsUpserted ?? null}
                trigger={r.trigger}
                error={r.errorMessage ?? ''}
                startedAt={r.startedAt}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function RunRow({
  source,
  status,
  fetched,
  upserted,
  trigger,
  error,
  startedAt,
}: {
  source: string;
  status: string;
  fetched: number | null;
  upserted: number | null;
  trigger: string;
  error: string;
  startedAt: string;
}) {
  const Icon =
    status === 'success' ? CheckCircle2 : status === 'error' ? AlertTriangle : Clock;
  const cls =
    status === 'success' ? 'text-up' : status === 'error' ? 'text-down' : 'text-muted';
  const when = formatWhen(startedAt);
  return (
    <div
      className="grid items-start px-3 py-2 gap-3 text-[13px] border-t border-border"
      style={{ gridTemplateColumns: '1fr 100px 90px 110px 1fr 140px' }}
    >
      <div className="font-mono text-[12px]">{source}</div>
      <div className={cn('flex items-center gap-1.5', cls)}>
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[12px] capitalize">{status}</span>
      </div>
      <div className="text-[12px] text-muted font-mono tabular-nums">
        {fetched == null ? '—' : `${fetched}/${upserted ?? 0}`}
      </div>
      <div className="text-[12px] text-muted">{trigger}</div>
      <div
        className="text-[11px] text-down break-words leading-snug"
        title={error || undefined}
      >
        {error ? error.slice(0, 200) : ''}
      </div>
      <div className="text-[11px] text-muted">{when}</div>
    </div>
  );
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMin = Math.round((now - d.getTime()) / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)}h ago`;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
