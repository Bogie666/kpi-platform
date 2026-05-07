'use client';

import { useState } from 'react';
import { useReviews } from '@/lib/hooks/use-reviews';
import { Panel } from '@/components/primitives/panel';
import { Skeleton } from '@/components/primitives/skeleton';
import { Button } from '@/components/primitives/button';
import { fmtAsOf } from '@/lib/format/date';
import { ReviewsAiPanel } from './reviews-ai-panel';

const STAR = (filled: boolean) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? '#FBBC04' : 'var(--surface-2)'} aria-hidden>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ratingLabel(avg: number): string {
  if (avg >= 4.8) return 'Outstanding';
  if (avg >= 4.5) return 'Excellent';
  if (avg >= 4.0) return 'Great';
  if (avg >= 3.5) return 'Good';
  return 'Average';
}

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function initialsColor(name: string): string {
  const colors = [
    'var(--d-hvac_service)',
    'var(--d-hvac_sales)',
    'var(--d-plumbing)',
    'var(--d-commercial)',
    'var(--d-hvac_maintenance)',
    'var(--d-electrical)',
    'var(--d-etx)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function ReviewsPanel() {
  const { data, isLoading, error, refetch } = useReviews();
  const [showAi, setShowAi] = useState(false);

  if (isLoading) {
    return (
      <Panel padding="cozy">
        <Skeleton variant="chart" />
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3">
          <div className="text-panel">Couldn&apos;t load reviews</div>
          <p className="text-[13px] text-muted">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </Panel>
    );
  }
  if (!data) return null;
  if (data.total === 0) {
    return (
      <Panel padding="cozy">
        <div className="flex flex-col items-start gap-3 py-8 max-w-lg">
          <div className="text-panel">No reviews synced yet</div>
          <p className="text-[13px] text-muted leading-relaxed">
            Trigger a manual sync via{' '}
            <code className="font-mono text-[12px]">POST /api/sync/run?source=google-reviews</code>{' '}
            once GOOGLE_REFRESH_TOKEN / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set.
          </p>
          {data.lastSync.error && (
            <p className="text-[12px] text-down">Last sync error: {data.lastSync.error}</p>
          )}
        </div>
      </Panel>
    );
  }

  const totalDist =
    data.ratingDist[1] + data.ratingDist[2] + data.ratingDist[3] + data.ratingDist[4] + data.ratingDist[5];
  const maxTrendCount = Math.max(...data.trend.map((t) => t.count), 1);

  return (
    <div className="flex flex-col gap-6">
      {/* Hero — total + avg + label, with prominent Generate Insights CTA */}
      <Panel
        className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-12"
        padding="cozy"
      >
        <div className="flex flex-col justify-between gap-6 min-h-[180px]">
          <div className="flex flex-col gap-2">
            <span className="text-eyebrow uppercase text-muted">Average rating</span>
            <div className="flex items-end gap-3">
              <div
                className="text-display font-mono tabular-nums"
                style={{ fontSize: 'clamp(56px, 7vw, 96px)' }}
              >
                {data.avgRating.toFixed(1)}
              </div>
              <div className="flex flex-col gap-1 pb-3">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i}>{STAR(i <= Math.round(data.avgRating))}</span>
                  ))}
                </div>
                <span className="text-[12px] text-muted font-mono tabular-nums">
                  {data.total.toLocaleString('en-US')} reviews
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="px-2.5 py-0.5 rounded-pill bg-accent/15 text-accent text-[11px] uppercase tracking-[0.08em] font-medium">
              {ratingLabel(data.avgRating)}
            </span>
            <button
              onClick={() => {
                setShowAi(true);
                requestAnimationFrame(() => {
                  document.getElementById('ai-insights')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
              }}
              className="inline-flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-btn bg-accent text-bg border border-accent hover:opacity-90 transition-opacity"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zm6 10l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zm-13 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
              </svg>
              Generate AI insights
            </button>
            {data.lastSync.at && (
              <span className="text-[11px] text-muted font-mono tabular-nums ml-auto">
                synced {fmtAsOf(data.lastSync.at)}
              </span>
            )}
          </div>
        </div>

        {/* Star distribution */}
        <div className="flex flex-col gap-2.5 justify-center">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = data.ratingDist[stars as 1 | 2 | 3 | 4 | 5];
            const pct = totalDist > 0 ? (count / totalDist) * 100 : 0;
            return (
              <div
                key={stars}
                className="grid items-center gap-3"
                style={{ gridTemplateColumns: '50px 1fr 60px' }}
              >
                <div className="flex items-center gap-1 text-[12px] font-mono tabular-nums text-muted">
                  <span>{stars}</span>
                  <span className="text-[10px]">{STAR(true)}</span>
                </div>
                <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%`, opacity: 0.4 + (stars - 1) * 0.15 }}
                  />
                </div>
                <span className="text-[12px] text-muted font-mono tabular-nums text-right">
                  {count.toLocaleString('en-US')}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* AI Insights — only renders when toggled */}
      {showAi && (
        <div id="ai-insights">
          <Panel
            eyebrow="AI Analysis"
            title="What customers are saying"
            right={
              <Button size="sm" variant="ghost" onClick={() => setShowAi(false)}>
                Hide
              </Button>
            }
            padding="cozy"
          >
            <ReviewsAiPanel locationId="all" />
          </Panel>
        </div>
      )}

      {/* Per-location split + 12-month trend */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1fr_1.4fr]">
        <Panel eyebrow="By location" title="Per-location split">
          <div className="flex flex-col gap-4">
            {data.byLocation.map((l) => {
              const reportedHigher = l.reportedTotal != null && l.reportedTotal > l.count;
              return (
                <div key={l.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-medium truncate">{l.name}</span>
                    <span className="text-[12px] font-mono tabular-nums">
                      {l.avgRating.toFixed(1)} ★
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted font-mono tabular-nums">
                    <span>{l.count.toLocaleString('en-US')} synced</span>
                    {l.reportedTotal != null && (
                      <span className={reportedHigher ? 'text-warning' : ''}>
                        {l.reportedTotal.toLocaleString('en-US')} on Google
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel eyebrow="Last 12 months" title="Reviews per month">
          <div className="flex items-stretch gap-2 h-[220px] pb-1">
            {data.trend.map((t) => {
              const pct = t.count > 0 ? Math.max((t.count / maxTrendCount) * 100, 6) : 0;
              const [, mm] = t.month.split('-').map(Number);
              return (
                <div
                  key={t.month}
                  className="flex flex-col items-center gap-1.5 flex-1 min-w-0"
                  title={`${MONTH_NAMES[mm - 1]}: ${t.count} reviews · ${t.avgRating.toFixed(1)}★`}
                >
                  <div className="text-[11px] font-mono tabular-nums text-text font-semibold">
                    {t.count}
                  </div>
                  {/* Spacer column — bar sits inside, height % is relative
                      to this flex-1 area (not the parent flex row) so the
                      bars scale visibly instead of collapsing to text height. */}
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className="w-full bg-accent rounded-t-[3px] transition-all"
                      style={{
                        height: `${pct}%`,
                        opacity: 0.55 + Math.max(0, t.avgRating - 3) * 0.15,
                      }}
                    />
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-muted">
                    {MONTH_NAMES[mm - 1] ?? ''}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Recent reviews */}
      <Panel eyebrow="Latest" title="Recent reviews">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {data.recent.map((r) => (
            <article
              key={r.id}
              className="flex flex-col gap-2 p-4 rounded-panel border border-border bg-surface"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-8 w-8 rounded-full grid place-items-center text-[12px] font-mono font-semibold text-bg"
                  style={{ background: initialsColor(r.name) }}
                  aria-hidden
                >
                  {(r.name[0] ?? '?').toUpperCase()}
                </span>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[13px] font-medium truncate">{r.name}</span>
                  <span className="text-[11px] text-muted">
                    {relativeDate(r.date)} · {r.locationName}
                  </span>
                </div>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i}>{STAR(i <= r.rating)}</span>
                ))}
              </div>
              <p className="text-[12px] text-muted leading-relaxed line-clamp-5">
                {r.text || <span className="italic">No review text</span>}
              </p>
              {r.reply && (
                <div className="mt-1 pl-3 border-l-2 border-accent/40">
                  <p className="text-[11px] text-muted/80 leading-relaxed line-clamp-3">
                    <span className="font-medium text-accent">Owner reply:</span> {r.reply}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
