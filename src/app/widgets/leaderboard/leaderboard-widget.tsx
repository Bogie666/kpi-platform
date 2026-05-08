'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BRAND,
  WIDGET_BASE_STYLES,
  formatRevenue,
  getDepartmentColor,
  getWidgetParams,
  initAutoRefresh,
  initIframeResize,
} from '@/lib/widget-utils';

interface Tech {
  rank: number;
  employeeId: number;
  name: string;
  departmentCode: string;
  photoUrl: string | null;
  revenue: number;
  closeRate: number;
  avgSale: number;
  avgTicket: number;
}

interface RolePodium {
  role: { code: string; name: string };
  top: Tech[];
}

interface TopPerfResp {
  byRole: RolePodium[];
}

const PERIOD_LABEL: Record<string, string> = {
  mtd: 'MTD',
  ytd: 'YTD',
  last_month: 'Last month',
  ttm: 'TTM',
  qtd: 'QTD',
};

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

export default function LeaderboardWidget() {
  const [data, setData] = useState<TopPerfResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const postHeightRef = useRef<(() => void) | null>(null);

  const params = getWidgetParams({
    theme: 'light',
    period: 'last_month',
    refresh: 300,
    compact: false,
    mode: 'top_per_dept', // 'top_per_dept' = #1 of each role; 'combined' = best across all
    limit: 6,
  });

  const isDark = params.theme === 'dark';

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/kpi/top-performers?preset=${params.period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: TopPerfResp };
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [params.period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const postHeight = initIframeResize('leaderboard');
    postHeightRef.current = postHeight;
    return initAutoRefresh(fetchData, params.refresh as number);
  }, [fetchData, params.refresh]);

  useEffect(() => {
    if (postHeightRef.current) setTimeout(postHeightRef.current, 100);
  }, [data]);

  const bg = isDark ? BRAND.navy : 'transparent';
  const textColor = isDark ? '#fff' : BRAND.gray800;
  const mutedColor = isDark ? 'rgba(255,255,255,0.55)' : BRAND.gray400;
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#fff';
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

  const compact = params.compact as boolean;

  let cards: Array<{ tech: Tech; roleName: string }> = [];
  if (params.mode === 'combined') {
    // Flatten + sort by revenue, take top N.
    const all = data.byRole.flatMap((r) => r.top.map((t) => ({ tech: t, roleName: r.role.name })));
    all.sort((a, b) => b.tech.revenue - a.tech.revenue);
    cards = all.slice(0, Math.max(1, Math.min(20, params.limit as number)));
  } else {
    // Top of each role.
    cards = data.byRole
      .filter((r) => r.top.length > 0)
      .map((r) => ({ tech: r.top[0], roleName: r.role.name }));
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        ${WIDGET_BASE_STYLES}
        body { background: ${bg}; }
        .lb-wrap { padding: ${compact ? '10px 12px' : '16px 20px'}; }
        .lb-head { display: flex; align-items: center; gap: 8px; margin-bottom: ${compact ? '8px' : '14px'}; }
        .lb-grid { display: grid; gap: ${compact ? '8px' : '12px'}; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
        .lb-card { display: flex; align-items: center; gap: 12px; padding: ${compact ? '8px 10px' : '12px 14px'}; background: ${cardBg}; border: 1px solid ${cardBorder}; border-radius: 10px; }
        .lb-avatar { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 16px; flex-shrink: 0; overflow: hidden; }
        .lb-avatar img { width: 100%; height: 100%; object-fit: cover; }
      `,
        }}
      />
      <div className="lb-wrap">
        <div className="lb-head">
          <span style={{ fontSize: 18 }}>🏆</span>
          <span className="widget-heading" style={{ fontSize: compact ? 14 : 16, color: textColor }}>
            Top Performers
          </span>
          <span style={{ fontSize: 12, color: mutedColor, marginLeft: 'auto' }}>
            {PERIOD_LABEL[params.period as string] ?? params.period}
          </span>
        </div>

        <div className="lb-grid">
          {cards.map(({ tech, roleName }) => {
            const color = getDepartmentColor(tech.departmentCode);
            const isCA = tech.departmentCode === 'hvac_sales';
            return (
              <div key={`${roleName}-${tech.employeeId}`} className="lb-card">
                <span className="lb-avatar" style={{ backgroundColor: color }}>
                  {tech.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tech.photoUrl} alt={tech.name} />
                  ) : (
                    initials(tech.name)
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: mutedColor, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {roleName}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: textColor,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {tech.name}
                  </div>
                  <div style={{ fontSize: 12, color: mutedColor }}>
                    <span className="widget-stat" style={{ fontSize: 13, color: textColor, marginRight: 6 }}>
                      {formatRevenue(tech.revenue / 100)}
                    </span>
                    · {(tech.closeRate / 100).toFixed(1)}% · {formatRevenue((isCA ? tech.avgSale : tech.avgTicket) / 100)} avg
                  </div>
                </div>
              </div>
            );
          })}
          {cards.length === 0 && (
            <div style={{ padding: 20, color: mutedColor, fontSize: 13, textAlign: 'center' }}>
              No data yet for this period.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
