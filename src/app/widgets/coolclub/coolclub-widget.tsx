'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BRAND,
  WIDGET_BASE_STYLES,
  formatCount,
  getWidgetParams,
  initAutoRefresh,
  initIframeResize,
} from '@/lib/widget-utils';

interface MembershipsResp {
  active: number;
  goal: number;
  newMonth: number;
  churnMonth: number;
  netMonth: number;
  history: number[];
}

function sparkline(data: number[], width: number, height: number, color: string): string {
  if (!data || data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * usableW;
    const y = padding + usableH - ((v - min) / range) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1].split(',');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${points.join(' ')}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${color}"/>
  </svg>`;
}

export default function CoolClubWidget() {
  const [data, setData] = useState<MembershipsResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const postHeightRef = useRef<(() => void) | null>(null);

  const params = getWidgetParams({
    theme: 'dark',
    refresh: 300,
    compact: false,
    goal: 0, // 0 → use server-provided goal
  });

  const isDark = params.theme === 'dark';

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/kpi/memberships?preset=mtd');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: MembershipsResp };
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
    const postHeight = initIframeResize('coolclub');
    postHeightRef.current = postHeight;
    return initAutoRefresh(fetchData, params.refresh as number);
  }, [fetchData, params.refresh]);

  useEffect(() => {
    if (postHeightRef.current) setTimeout(postHeightRef.current, 100);
  }, [data]);

  const bg = isDark ? BRAND.navy : 'transparent';
  const textColor = isDark ? '#fff' : BRAND.gray800;
  const mutedColor = isDark ? 'rgba(255,255,255,0.6)' : BRAND.gray400;
  const ringTrack = isDark ? 'rgba(255,255,255,0.12)' : BRAND.gray100;

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

  const goal = (params.goal as number) || data.goal || 10000;
  const pct = Math.min(100, Math.round((data.active / goal) * 100));
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  const compact = params.compact as boolean;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        ${WIDGET_BASE_STYLES}
        body { background: ${bg}; }
        .cc-wrap { display: flex; align-items: center; gap: ${compact ? 14 : 24}px; padding: ${compact ? '12px 14px' : '20px 24px'}; }
        .cc-ring { position: relative; flex-shrink: 0; }
        .cc-ring-text { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .cc-info { flex: 1; min-width: 0; }
        .cc-stat-row { display: flex; gap: 14px; margin-top: 8px; }
        .cc-stat { font-size: 11px; color: ${mutedColor}; }
        .cc-stat-val { font-family: 'Montserrat', sans-serif; font-weight: 700; color: ${textColor}; font-size: 14px; }
      `,
        }}
      />
      <div className="cc-wrap">
        <div className="cc-ring">
          <svg width={130} height={130} viewBox="0 0 130 130">
            <circle cx="65" cy="65" r={radius} fill="none" stroke={ringTrack} strokeWidth="10" />
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke={BRAND.gold}
              strokeWidth="10"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 65 65)"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>
          <div className="cc-ring-text">
            <span className="widget-stat" style={{ fontSize: 26, color: textColor }}>
              {pct}%
            </span>
            <span style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>to goal</span>
          </div>
        </div>
        <div className="cc-info">
          <div style={{ fontSize: 12, color: mutedColor, textTransform: 'uppercase', letterSpacing: 1 }}>
            Cool Club · active members
          </div>
          <div className="widget-stat" style={{ fontSize: compact ? 36 : 44, color: textColor, lineHeight: 1.05 }}>
            {formatCount(data.active)}
          </div>
          <div style={{ fontSize: 12, color: mutedColor }}>
            of {formatCount(goal)} goal
          </div>
          <div className="cc-stat-row">
            <div className="cc-stat">
              New MTD
              <div className="cc-stat-val" style={{ color: BRAND.green }}>
                +{data.newMonth}
              </div>
            </div>
            <div className="cc-stat">
              Churn MTD
              <div className="cc-stat-val" style={{ color: BRAND.red }}>
                −{data.churnMonth}
              </div>
            </div>
            <div className="cc-stat">
              Net
              <div className="cc-stat-val" style={{ color: data.netMonth >= 0 ? BRAND.green : BRAND.red }}>
                {data.netMonth >= 0 ? '+' : ''}
                {data.netMonth}
              </div>
            </div>
          </div>
          {data.history.length >= 2 && !compact && (
            <div
              style={{ marginTop: 10 }}
              dangerouslySetInnerHTML={{
                __html: sparkline(data.history.slice(-12), 220, 36, BRAND.gold),
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
