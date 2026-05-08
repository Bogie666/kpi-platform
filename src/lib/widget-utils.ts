// Shared utilities for the embeddable /widgets/* pages. Modeled after
// the old kpi-dashboard set so the iframe snippets, theme params, and
// auto-refresh behavior are familiar. Designed to render in a
// transparent iframe with no app chrome.
'use client';

export const BRAND = {
  navy: '#0A2647',
  blue: '#144272',
  sky: '#2C74B3',
  gold: '#D4A843',
  green: '#22C55E',
  red: '#EF4444',
  orange: '#F59E0B',
  gray100: '#EEF0F4',
  gray400: '#9CA3AF',
  gray600: '#6B7280',
  gray800: '#374151',
} as const;

export type ParamShape = Record<string, string | number | boolean>;

export function getWidgetParams<T extends ParamShape>(defaults: T): T {
  if (typeof window === 'undefined') return defaults;
  const params = new URLSearchParams(window.location.search);
  const result: ParamShape = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const val = params.get(key);
    if (val === null) continue;
    const def = (defaults as ParamShape)[key];
    if (typeof def === 'boolean') {
      result[key] = val === 'true' || val === '1';
    } else if (typeof def === 'number') {
      const n = Number(val);
      if (!Number.isNaN(n)) result[key] = n;
    } else {
      result[key] = val;
    }
  }
  return result as T;
}

/** Send the body's scrollHeight to the parent so SharePoint / WordPress
 *  containers can resize the iframe to match. */
export function initIframeResize(widgetName: string): () => void {
  function postHeight() {
    const h = document.body.scrollHeight;
    window.parent.postMessage(
      { type: 'lex-widget-height', widget: widgetName, height: h },
      '*',
    );
  }
  window.addEventListener('load', postHeight);
  window.addEventListener('resize', postHeight);
  setTimeout(postHeight, 500);
  return postHeight;
}

export function initAutoRefresh(fn: () => void | Promise<void>, seconds: number): () => void {
  const id = window.setInterval(fn, seconds * 1000);
  return () => window.clearInterval(id);
}

export function formatRevenue(amount: number): string {
  const n = Math.abs(amount);
  if (n >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 10_000) {
    const k = amount / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  if (n >= 1_000) {
    const k = amount / 1000;
    return `$${k.toFixed(1)}k`;
  }
  return `$${amount.toLocaleString('en-US')}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function getPercentColor(pct: number): string {
  if (pct >= 90) return BRAND.green;
  if (pct >= 70) return BRAND.orange;
  return BRAND.red;
}

export function getDepartmentIcon(dept: string): string {
  const d = dept.toLowerCase();
  if (d.includes('hvac') || d.includes('heat') || d.includes('cool') || d.includes('air')) return '❄️';
  if (d.includes('plumb')) return '💧';
  if (d.includes('electr')) return '⚡';
  if (d.includes('solar')) return '☀️';
  if (d.includes('etx') || d.includes('east')) return '🌳';
  if (d.includes('comm')) return '🏢';
  return '🔹';
}

export function getDepartmentColor(dept: string): string {
  const d = dept.toLowerCase();
  if (d.includes('plumb')) return '#3B82F6';
  if (d.includes('electr')) return BRAND.gold;
  if (d.includes('comm')) return '#9333EA';
  if (d.includes('etx') || d.includes('east')) return '#10B981';
  if (d.includes('hvac') || d.includes('heat') || d.includes('cool') || d.includes('air')) return BRAND.sky;
  return BRAND.navy;
}

export const WIDGET_FONTS = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Open+Sans:wght@400;600;700&display=swap');`;

export const WIDGET_BASE_STYLES = `
  ${WIDGET_FONTS}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: transparent; font-family: 'Open Sans', sans-serif; color: ${BRAND.gray800}; }
  .widget-heading { font-family: 'Montserrat', sans-serif; font-weight: 700; }
  .widget-stat { font-family: 'Montserrat', sans-serif; font-weight: 800; }
  @keyframes lex-spin { to { transform: rotate(360deg); } }
`;

/** Friendly identifier → potential ServiceTitan / dashboard ids that
 *  count as the same location. Used by the reviews widget. */
export const LOCATION_IDS: Record<string, string[]> = {
  lex: ['lex'],
  'lex-etx': ['lex-etx'],
  lyons: ['lyons'],
};

export function matchesLocation(rowLocId: string, paramLoc: string): boolean {
  const ids = LOCATION_IDS[paramLoc];
  if (!ids) return true;
  return ids.includes(rowLocId);
}
