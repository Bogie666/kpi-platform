'use client';

import { useReviews } from '@/lib/hooks/use-reviews';
import { TvHeader } from './tv-header';

const STAR = (filled: boolean) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? '#FBBC04' : 'rgba(255,255,255,0.18)'} aria-hidden>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

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

const AVATAR_COLORS = [
  'var(--d-hvac_service)',
  'var(--d-hvac_sales)',
  'var(--d-plumbing)',
  'var(--d-commercial)',
  'var(--d-hvac_maintenance)',
  'var(--d-electrical)',
  'var(--d-etx)',
];
function initialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function ReviewsScene() {
  const { data } = useReviews();

  if (!data) {
    return <TvHeader eyebrow="Customer Reviews" title="Loading…" />;
  }
  if (data.total === 0) {
    return (
      <div className="flex flex-col h-full gap-6">
        <TvHeader eyebrow="Customer Reviews" title="No reviews synced yet" />
      </div>
    );
  }

  const totalDist =
    data.ratingDist[1] + data.ratingDist[2] + data.ratingDist[3] + data.ratingDist[4] + data.ratingDist[5];
  // Show 6 most recent reviews — fits two rows on a 1080p TV.
  const top = data.recent.slice(0, 6);

  return (
    <div className="flex flex-col h-full gap-6">
      <TvHeader
        eyebrow="Google reviews · all locations"
        title="What customers are saying"
        right={`${data.total.toLocaleString('en-US')} reviews`}
      />

      {/* Hero strip: huge avg + stars + label, plus star distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-10 items-center">
        <div className="flex items-center gap-6">
          <div
            className="font-mono tabular-nums font-semibold leading-none"
            style={{ fontSize: 'clamp(96px, 11vw, 160px)' }}
          >
            {data.avgRating.toFixed(1)}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i}>{STAR(i <= Math.round(data.avgRating))}</span>
              ))}
            </div>
            <span className="text-[14px] uppercase tracking-[0.12em] text-accent font-semibold">
              {ratingLabel(data.avgRating)}
            </span>
          </div>
        </div>

        {/* Star distribution bars */}
        <div className="flex flex-col gap-2 max-w-[640px]">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = data.ratingDist[stars as 1 | 2 | 3 | 4 | 5];
            const pct = totalDist > 0 ? (count / totalDist) * 100 : 0;
            return (
              <div
                key={stars}
                className="grid items-center gap-3"
                style={{ gridTemplateColumns: '40px 1fr 80px' }}
              >
                <div className="flex items-center gap-1 text-[14px] font-mono tabular-nums text-muted">
                  <span>{stars}</span>
                  <span>{STAR(true)}</span>
                </div>
                <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-[width] duration-700 ease-out"
                    style={{ width: `${pct}%`, opacity: 0.45 + (stars - 1) * 0.13 }}
                  />
                </div>
                <span className="text-[14px] text-muted font-mono tabular-nums text-right">
                  {count.toLocaleString('en-US')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent reviews — 3 cols × 2 rows */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-hidden">
        {top.map((r) => (
          <article
            key={r.id}
            className="flex flex-col gap-2.5 p-4 rounded-panel border border-border bg-surface overflow-hidden"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-10 w-10 rounded-full grid place-items-center text-[14px] font-mono font-semibold text-bg shrink-0"
                style={{ background: initialsColor(r.name) }}
                aria-hidden
              >
                {(r.name[0] ?? '?').toUpperCase()}
              </span>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[15px] font-semibold truncate">{r.name}</span>
                <span className="text-[11px] text-muted">
                  {relativeDate(r.date)} · {r.locationName}
                </span>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i}>{STAR(i <= r.rating)}</span>
                ))}
              </div>
            </div>
            <p className="text-[13px] text-muted leading-relaxed line-clamp-5 flex-1">
              {r.text || <span className="italic">No review text</span>}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
