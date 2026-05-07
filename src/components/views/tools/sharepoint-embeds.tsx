'use client';

import { useState } from 'react';
import { CopyButton } from './copy-button';

interface WidgetConfig {
  name: string;
  path: string;
  description: string;
  defaultHeight: number;
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
    params: [
      { key: 'refresh', values: 'auto-refresh hourly', default: 'always on' },
    ],
  },
];

export function SharePointEmbeds() {
  const [host, setHost] = useState(BASE_URL);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted leading-relaxed">
        Embed dashboard widgets in SharePoint pages using the Embed web part. Paste the
        iframe code into the web part&apos;s HTML editor.
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
        const iframeCode = `<iframe src="${host}${w.path}" style="width:100%;height:${w.defaultHeight}px;border:none;" loading="lazy" sandbox="allow-scripts allow-same-origin"></iframe>`;
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
                Notes
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

      <div className="rounded-card border border-border bg-surface-2/40 p-4">
        <p className="text-[12px] text-muted leading-relaxed">
          More iframe-friendly widget routes (per-location reviews carousel, revenue by
          dept, top performers) are available as embed snippets in the{' '}
          <strong className="text-text">Review Carousel Embed</strong> tool above. Add
          additional standalone widget routes here as they ship.
        </p>
      </div>
    </div>
  );
}
