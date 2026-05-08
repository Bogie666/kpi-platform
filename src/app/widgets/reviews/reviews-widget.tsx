'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BRAND,
  WIDGET_BASE_STYLES,
  getWidgetParams,
  initAutoRefresh,
  initIframeResize,
  matchesLocation,
} from '@/lib/widget-utils';

interface Review {
  id: string;
  name: string;
  rating: number;
  text: string;
  date: string;
  locationId: string;
  locationName: string;
}

interface ByLocation {
  id: string;
  name: string;
  count: number;
  avgRating: number;
  reportedTotal: number | null;
}

interface ReviewsResp {
  total: number;
  avgRating: number;
  recent: Review[];
  byLocation: ByLocation[];
}

const STAR = (filled: boolean, size = 14) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? BRAND.gold : '#E0E0E0'}" style="flex-shrink:0"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`;

function ratingLabel(avg: number): string {
  if (avg >= 4.8) return 'OUTSTANDING';
  if (avg >= 4.5) return 'EXCELLENT';
  if (avg >= 4.0) return 'GREAT';
  if (avg >= 3.5) return 'GOOD';
  return 'AVERAGE';
}

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function avatarColor(name: string): string {
  const palette = ['#E91E63', '#009688', '#2196F3', '#FF5722', '#9C27B0', '#4CAF50', '#FF9800', '#3F51B5'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

export default function ReviewsWidget() {
  const [data, setData] = useState<ReviewsResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef<number | null>(null);
  const postHeightRef = useRef<(() => void) | null>(null);

  const params = getWidgetParams({
    theme: 'light',
    refresh: 300,
    compact: false,
    location: 'lex',
    minRating: 4,
    maxReviews: 16,
    autoScroll: true,
    speed: 5000,
  });

  const isDark = params.theme === 'dark';

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/kpi/reviews');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: ReviewsResp };
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const postHeight = initIframeResize('reviews');
    postHeightRef.current = postHeight;
    return initAutoRefresh(fetchData, params.refresh as number);
  }, [fetchData, params.refresh]);

  useEffect(() => {
    if (postHeightRef.current) setTimeout(postHeightRef.current, 100);
  }, [data, expanded]);

  // Auto-scroll carousel.
  useEffect(() => {
    if (!params.autoScroll || !carouselRef.current) return;
    const el = carouselRef.current;
    autoScrollRef.current = window.setInterval(() => {
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 10) el.scrollTo({ left: 0, behavior: 'smooth' });
      else el.scrollBy({ left: 280, behavior: 'smooth' });
    }, params.speed as number);
    return () => {
      if (autoScrollRef.current) window.clearInterval(autoScrollRef.current);
    };
  }, [data, params.autoScroll, params.speed]);

  const bg = isDark ? BRAND.navy : 'transparent';
  const textColor = isDark ? '#fff' : BRAND.gray800;
  const mutedColor = isDark ? 'rgba(255,255,255,0.6)' : BRAND.gray400;
  const cardBg = isDark ? 'rgba(255,255,255,0.08)' : '#fff';
  const cardBorder = isDark ? 'rgba(255,255,255,0.12)' : BRAND.gray100;

  if (error && !data) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: WIDGET_BASE_STYLES }} />
        <div style={{ padding: 30, textAlign: 'center', color: mutedColor, fontSize: 13 }}>
          {error}
        </div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: WIDGET_BASE_STYLES }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: `3px solid ${BRAND.gray100}`,
              borderTopColor: BRAND.sky,
              borderRadius: '50%',
              animation: 'lex-spin 0.8s linear infinite',
            }}
          />
        </div>
      </>
    );
  }

  const filtered = data.recent
    .filter((r) => matchesLocation(r.locationId, params.location as string))
    .filter((r) => r.rating >= (params.minRating as number))
    .slice(0, params.maxReviews as number);

  const locStats = data.byLocation.find((l) => l.id === (params.location as string));
  const locAvg = locStats ? locStats.avgRating : data.avgRating;
  const locTotal = locStats ? locStats.reportedTotal ?? locStats.count : data.total;
  const compact = params.compact as boolean;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        ${WIDGET_BASE_STYLES}
        body { background: ${bg}; }
        .rev-container { display: flex; gap: 20px; padding: 16px; align-items: stretch; }
        .rev-summary { min-width: 180px; max-width: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 16px; }
        .rev-carousel-wrap { flex: 1; overflow: hidden; min-width: 0; }
        .rev-carousel { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding: 4px 0; }
        .rev-carousel::-webkit-scrollbar { display: none; }
        .rev-card { flex: 0 0 260px; scroll-snap-align: start; background: ${cardBg}; border: 1px solid ${cardBorder}; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
        .rev-text { font-size: 13px; line-height: 1.5; color: ${textColor}; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
        .rev-text.expanded { -webkit-line-clamp: unset; }
        .rev-more { color: ${BRAND.sky}; cursor: pointer; font-size: 12px; font-weight: 600; border: none; background: none; padding: 0; }
        @media (max-width: 599px) {
          .rev-container { flex-direction: column; }
          .rev-summary { max-width: none; flex-direction: row; gap: 16px; padding: 12px 16px; }
        }
        ${compact ? '.rev-summary { display: none !important; }' : ''}
      `,
        }}
      />
      <div className="rev-container">
        <div className="rev-summary">
          <div className="widget-stat" style={{ fontSize: 42, color: textColor, lineHeight: 1.1 }}>
            {locAvg.toFixed(1)}
          </div>
          <div
            style={{ display: 'flex', gap: 2, justifyContent: 'center', margin: '6px 0' }}
            dangerouslySetInnerHTML={{
              __html: [1, 2, 3, 4, 5].map((i) => STAR(i <= Math.round(locAvg))).join(''),
            }}
          />
          <div style={{ fontSize: 11, color: mutedColor, marginBottom: 4 }}>
            {locTotal.toLocaleString('en-US')} reviews
          </div>
          <div className="widget-heading" style={{ fontSize: 11, color: BRAND.gold, letterSpacing: 1.5 }}>
            {ratingLabel(locAvg)}
          </div>
        </div>
        <div className="rev-carousel-wrap">
          <div
            className="rev-carousel"
            ref={carouselRef}
            onMouseEnter={() => {
              if (autoScrollRef.current) {
                window.clearInterval(autoScrollRef.current);
                autoScrollRef.current = null;
              }
            }}
            onMouseLeave={() => {
              if (!params.autoScroll) return;
              if (autoScrollRef.current) window.clearInterval(autoScrollRef.current);
              autoScrollRef.current = window.setInterval(() => {
                const el = carouselRef.current;
                if (!el) return;
                const max = el.scrollWidth - el.clientWidth;
                if (el.scrollLeft >= max - 10) el.scrollTo({ left: 0, behavior: 'smooth' });
                else el.scrollBy({ left: 280, behavior: 'smooth' });
              }, params.speed as number);
            }}
          >
            {filtered.map((r) => {
              const isExpanded = expanded.has(r.id);
              return (
                <div key={r.id} className="rev-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: avatarColor(r.name),
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {r.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: textColor,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {r.name}
                      </div>
                      <div style={{ fontSize: 11, color: mutedColor }}>{relativeDate(r.date)}</div>
                    </div>
                  </div>
                  <div
                    style={{ display: 'flex', gap: 1 }}
                    dangerouslySetInnerHTML={{
                      __html: [1, 2, 3, 4, 5].map((i) => STAR(i <= r.rating, 14)).join(''),
                    }}
                  />
                  <div className={`rev-text ${isExpanded ? 'expanded' : ''}`}>
                    {r.text || 'No review text provided.'}
                  </div>
                  {r.text && r.text.length > 150 && (
                    <button
                      type="button"
                      className="rev-more"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        })
                      }
                    >
                      {isExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 20, color: mutedColor, fontSize: 13 }}>
                No reviews to show — adjust minRating or location params.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
