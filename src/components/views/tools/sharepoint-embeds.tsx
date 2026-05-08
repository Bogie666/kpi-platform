'use client';

import { useState } from 'react';
import { CopyButton } from './copy-button';

interface WidgetConfig {
  name: string;
  path: string;
  description: string;
  defaultHeight: number;
  defaultParams?: string;
  params: Array<{ key: string; values: string; default: string }>;
}

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://lexkpi.vercel.app';

const WIDGETS: WidgetConfig[] = [
  {
    name: 'Full TV display',
    path: '/tv',
    description:
      'Cycles through revenue, top performers per role, call center, memberships, upcoming appointments, and reviews. Drop into any iframe to mirror the office TV.',
    defaultHeight: 720,
    params: [{ key: 'refresh', values: 'auto-refresh hourly', default: 'always on' }],
  },
  {
    name: 'Revenue by Department',
    path: '/widgets/revenue',
    description:
      'Per-department revenue with target progress bars and total. Pulls from /api/kpi/financial.',
    defaultHeight: 520,
    defaultParams: '?theme=light&period=mtd',
    params: [
      { key: 'theme', values: 'light, dark', default: 'light' },
      { key: 'period', values: 'mtd, qtd, ytd, ttm, last_month', default: 'mtd' },
      { key: 'target', values: 'true, false (hide progress bars)', default: 'true' },
      { key: 'compact', values: 'true, false', default: 'false' },
      { key: 'refresh', values: 'seconds between refetches', default: '300' },
    ],
  },
  {
    name: 'Top Performers Leaderboard',
    path: '/widgets/leaderboard',
    description:
      'Top techs/CSRs/installers per role, or combined across all departments. Pulls from /api/kpi/top-performers.',
    defaultHeight: 560,
    defaultParams: '?theme=light&period=last_month&mode=top_per_dept',
    params: [
      { key: 'theme', values: 'light, dark', default: 'light' },
      { key: 'period', values: 'mtd, qtd, ytd, ttm, last_month', default: 'last_month' },
      {
        key: 'mode',
        values: 'top_per_dept (one card per role), combined (best across all)',
        default: 'top_per_dept',
      },
      { key: 'limit', values: 'cards to show in combined mode', default: '6' },
      { key: 'compact', values: 'true, false', default: 'false' },
      { key: 'refresh', values: 'seconds between refetches', default: '300' },
    ],
  },
  {
    name: 'Cool Club Members',
    path: '/widgets/coolclub',
    description:
      'Active membership count vs. goal with goal-progress ring, MTD net change, and 12-month sparkline. Pulls from /api/kpi/memberships.',
    defaultHeight: 460,
    defaultParams: '?theme=dark',
    params: [
      { key: 'theme', values: 'light, dark', default: 'dark' },
      {
        key: 'goal',
        values: 'override the active-member goal (0 = use server goal)',
        default: '0',
      },
      { key: 'compact', values: 'true, false', default: 'false' },
      { key: 'refresh', values: 'seconds between refetches', default: '300' },
    ],
  },
  {
    name: 'Google Reviews Carousel',
    path: '/widgets/reviews',
    description:
      'Auto-scrolling carousel of recent Google reviews with summary panel (avg rating, total). Filterable per location. Pulls from /api/kpi/reviews.',
    defaultHeight: 360,
    defaultParams: '?theme=light&location=lex&minRating=4',
    params: [
      { key: 'theme', values: 'light, dark', default: 'light' },
      { key: 'location', values: 'lex (all), lex-dallas, lex-fortworth, lex-allen', default: 'lex' },
      { key: 'minRating', values: '1–5 (hide reviews below this)', default: '4' },
      { key: 'maxReviews', values: 'cards to show', default: '16' },
      { key: 'autoScroll', values: 'true, false', default: 'true' },
      { key: 'speed', values: 'milliseconds between auto-scrolls', default: '5000' },
      { key: 'compact', values: 'true, false (hide summary panel)', default: 'false' },
      { key: 'refresh', values: 'seconds between refetches', default: '300' },
    ],
  },
];

export function SharePointEmbeds() {
  const [host, setHost] = useState(BASE_URL);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted leading-relaxed">
        Embed dashboard widgets in SharePoint pages, WordPress sites, or any tool that
        accepts an iframe. Paste the iframe code into the host&apos;s HTML editor. Each
        widget posts its rendered height to the parent — set <code>height</code> to a
        sensible default and the iframe will adjust on load.
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-eyebrow uppercase text-muted">Host URL</label>
        <input
          type="url"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          className="w-full bg-surface-2 border border-border rounded-btn px-3 py-2 text-[13px] focus:outline-none focus:border-accent"
        />
      </div>

      {WIDGETS.map((w) => {
        const url = `${host}${w.path}${w.defaultParams ?? ''}`;
        const iframeCode = `<iframe src="${url}" style="width:100%;height:${w.defaultHeight}px;border:none;" loading="lazy" sandbox="allow-scripts allow-same-origin"></iframe>`;
        return (
          <div
            key={w.path}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface-2/40 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[14px] font-semibold">{w.name}</h4>
              <CopyButton text={iframeCode} />
            </div>
            <p className="text-[12px] text-muted leading-relaxed">{w.description}</p>
            <pre className="bg-bg rounded-btn p-3 text-[11px] text-up overflow-x-auto whitespace-pre-wrap break-all select-all border border-border">
              {iframeCode}
            </pre>
            <details className="group">
              <summary className="text-[11px] text-muted cursor-pointer hover:text-text">
                URL parameters
              </summary>
              <table className="mt-2 w-full text-[11px]">
                <thead className="text-muted">
                  <tr className="text-left">
                    <th className="pb-1 pr-4 font-medium">Param</th>
                    <th className="pb-1 pr-4 font-medium">Values</th>
                    <th className="pb-1 font-medium">Default</th>
                  </tr>
                </thead>
                <tbody className="text-muted/90">
                  {w.params.map((p) => (
                    <tr key={p.key}>
                      <td className="py-0.5 pr-4 font-mono text-accent">{p.key}</td>
                      <td className="py-0.5 pr-4">{p.values}</td>
                      <td className="py-0.5 text-muted/70">{p.default}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        );
      })}
    </div>
  );
}
