'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BRAND,
  WIDGET_BASE_STYLES,
  formatRevenue,
  getDepartmentColor,
  getDepartmentIcon,
  getPercentColor,
  getWidgetParams,
  initAutoRefresh,
  initIframeResize,
} from '@/lib/widget-utils';

interface FinancialDept {
  code: string;
  name: string;
  revenue: { value: number };
  target: number;
}

interface FinancialResp {
  total: { revenue: { value: number }; target: number; fullPeriodTarget: number };
  departments: FinancialDept[];
  meta: { period: string };
}

const PERIOD_LABEL: Record<string, string> = {
  mtd: 'MTD',
  qtd: 'QTD',
  ytd: 'YTD',
  ttm: 'TTM',
  last_month: 'Last month',
};

export default function RevenueWidget() {
  const [data, setData] = useState<FinancialResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const postHeightRef = useRef<(() => void) | null>(null);

  const params = getWidgetParams({
    theme: 'light',
    period: 'mtd',
    refresh: 300,
    compact: false,
    target: true,
  });

  const isDark = params.theme === 'dark';

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/kpi/financial?preset=${params.period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: FinancialResp };
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
    const postHeight = initIframeResize('revenue');
    postHeightRef.current = postHeight;
    return initAutoRefresh(fetchData, params.refresh as number);
  }, [fetchData, params.refresh]);

  useEffect(() => {
    if (postHeightRef.current) setTimeout(postHeightRef.current, 100);
  }, [data]);

  const bg = isDark ? BRAND.navy : 'transparent';
  const textColor = isDark ? '#fff' : BRAND.gray800;
  const mutedColor = isDark ? 'rgba(255,255,255,0.55)' : BRAND.gray400;
  const barBg = isDark ? 'rgba(255,255,255,0.1)' : BRAND.gray100;

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

  // Sort by revenue desc, drop zero-target zero-revenue rows.
  const depts = [...data.departments]
    .filter((d) => d.revenue.value > 0 || d.target > 0)
    .sort((a, b) => b.revenue.value - a.revenue.value);
  const showTargets = params.target && depts.some((d) => d.target > 0);
  const compact = params.compact as boolean;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        ${WIDGET_BASE_STYLES}
        body { background: ${bg}; }
        .rev-wrap { padding: ${compact ? '10px 12px' : '16px 20px'}; }
        .rev-head { display: flex; align-items: center; gap: 8px; margin-bottom: ${compact ? '8px' : '14px'}; }
        .dept-row { display: flex; align-items: center; gap: 12px; padding: ${compact ? '6px 0' : '10px 0'}; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : BRAND.gray100}; }
        .dept-row:last-child { border-bottom: none; }
        .dept-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .progress-bar { height: 6px; border-radius: 3px; background: ${barBg}; margin-top: 4px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; transition: width .6s ease; }
        .rev-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 2px solid ${isDark ? 'rgba(255,255,255,0.12)' : BRAND.gray100}; }
      `,
        }}
      />
      <div className="rev-wrap">
        <div className="rev-head">
          <span style={{ fontSize: 18 }}>💰</span>
          <span className="widget-heading" style={{ fontSize: compact ? 14 : 16, color: textColor }}>
            Revenue by Department
          </span>
          <span style={{ fontSize: 12, color: mutedColor, marginLeft: 'auto' }}>
            {PERIOD_LABEL[params.period as string] ?? data.meta.period}
          </span>
        </div>

        {depts.map((d) => {
          const pct = d.target > 0 ? Math.round((d.revenue.value / d.target) * 100) : 0;
          const color = getDepartmentColor(d.name);
          if (compact) {
            return (
              <div key={d.code} className="dept-row">
                <span style={{ fontSize: 14 }}>{getDepartmentIcon(d.name)}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: textColor, flex: 1 }}>
                  {d.name}
                </span>
                <span className="widget-stat" style={{ fontSize: 15, color: textColor }}>
                  {formatRevenue(d.revenue.value / 100)}
                </span>
                {showTargets && d.target > 0 && (
                  <span style={{ fontSize: 11, color: getPercentColor(pct), fontWeight: 700 }}>
                    {pct}%
                  </span>
                )}
              </div>
            );
          }
          return (
            <div key={d.code} className="dept-row">
              <div className="dept-icon" style={{ backgroundColor: `${color}22` }}>
                {getDepartmentIcon(d.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{d.name}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="widget-stat" style={{ fontSize: 16, color: textColor }}>
                      {formatRevenue(d.revenue.value / 100)}
                    </span>
                    {showTargets && d.target > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: getPercentColor(pct) }}>
                        {pct}%
                      </span>
                    )}
                  </div>
                </div>
                {showTargets && d.target > 0 && (
                  <>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
                      Target: {formatRevenue(d.target / 100)}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div className="rev-foot">
          <span style={{ fontSize: 13, fontWeight: 600, color: mutedColor }}>Total revenue</span>
          <span className="widget-stat" style={{ fontSize: 18, color: textColor }}>
            {formatRevenue(data.total.revenue.value / 100)}
          </span>
        </div>
      </div>
    </>
  );
}
