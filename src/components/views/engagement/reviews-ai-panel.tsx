'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/button';

type Timeframe = '1week' | '2weeks' | '1month' | '3months' | '6months' | 'year';

interface InsightsData {
  timeframe: Timeframe;
  timeframeLabel: string;
  locationId: string;
  totalReviews: number;
  avgRating: number;
  ratingDistribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
  commonPraise: string[];
  commonComplaints: string[];
  keyThemes: Array<{
    theme: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    frequency: number;
    examples: string[];
  }>;
  technicianMentions: Array<{
    name: string;
    mentions: number;
    sentiment: 'positive' | 'negative' | 'mixed';
    samplePraise?: string;
  }>;
  recommendations: string[];
  sentimentScore: number;
  generatedAt: string;
  modelUsed?: string;
}

const TIMEFRAMES: Array<{ id: Timeframe; label: string }> = [
  { id: '1week', label: '1 week' },
  { id: '2weeks', label: '2 weeks' },
  { id: '1month', label: '1 month' },
  { id: '3months', label: '3 months' },
  { id: '6months', label: '6 months' },
  { id: 'year', label: '1 year' },
];

const SENTIMENT_COLOR = {
  positive: 'text-up',
  negative: 'text-down',
  neutral: 'text-muted',
  mixed: 'text-warning',
} as const;

export function ReviewsAiPanel({ locationId }: { locationId: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('3months');
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/kpi/reviews/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe, locationId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `${res.status}`);
      }
      const json = (await res.json()) as { data: InsightsData };
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // No auto-fire: user picks a date range first, then explicitly generates.
  const hasRun = data !== null || loading || error !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] uppercase tracking-[0.08em] text-muted">Timeframe</span>
        <div className="flex flex-wrap gap-1">
          {TIMEFRAMES.map((t) => {
            const active = t.id === timeframe;
            return (
              <button
                key={t.id}
                onClick={() => setTimeframe(t.id)}
                className={`text-[12px] font-medium px-2.5 py-1 rounded-btn transition-colors ${
                  active ? 'bg-surface-2 text-text shadow-[inset_0_0_0_1px_var(--border)]' : 'text-muted hover:text-text hover:bg-surface-2/40'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={generate} disabled={loading}>
            {loading ? 'Generating…' : data ? 'Re-run' : 'Generate'}
          </Button>
        </div>
      </div>

      {!hasRun && (
        <div className="text-[13px] text-muted">
          Select a timeframe above, then hit Generate to analyze reviews from that window.
        </div>
      )}

      {error && (
        <div className="text-[12px] text-down">⚠ {error}</div>
      )}

      {loading && !data && (
        <div className="text-[13px] text-muted">Claude is reading the reviews…</div>
      )}

      {data && (
        <>
          {/* Sentiment headline */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Sentiment score" value={`${data.sentimentScore}/100`} accent={data.sentimentScore >= 75 ? 'up' : data.sentimentScore >= 50 ? 'mid' : 'down'} />
            <Stat label="Reviews analyzed" value={data.totalReviews.toLocaleString('en-US')} />
            <Stat label="Avg rating" value={`${data.avgRating.toFixed(1)} ★`} />
            <Stat label="Window" value={data.timeframeLabel} />
          </div>

          {/* Praise + Complaints */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Section title="Common praise" tone="positive" items={data.commonPraise} />
            <Section title="Common complaints" tone="negative" items={data.commonComplaints} />
          </div>

          {/* Themes */}
          {data.keyThemes.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-eyebrow uppercase text-muted">Key themes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.keyThemes.map((t) => (
                  <article
                    key={t.theme}
                    className="flex flex-col gap-2 p-3 rounded-panel border border-border bg-surface"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-[14px] font-semibold leading-tight">{t.theme}</h4>
                      <span className={`text-[11px] uppercase tracking-[0.08em] ${SENTIMENT_COLOR[t.sentiment]}`}>
                        {t.sentiment} · {t.frequency}
                      </span>
                    </div>
                    {t.examples.length > 0 && (
                      <ul className="flex flex-col gap-1">
                        {t.examples.slice(0, 2).map((q, i) => (
                          <li key={i} className="text-[12px] text-muted italic leading-relaxed">
                            &ldquo;{q}&rdquo;
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* Technician mentions */}
          {data.technicianMentions.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-eyebrow uppercase text-muted">Technician mentions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.technicianMentions.map((t) => (
                  <div
                    key={t.name}
                    className="flex flex-col gap-1 p-3 rounded-panel border border-border bg-surface"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">{t.name}</span>
                      <span className={`text-[11px] uppercase tracking-[0.08em] ${SENTIMENT_COLOR[t.sentiment]}`}>
                        {t.sentiment} · {t.mentions}×
                      </span>
                    </div>
                    {t.samplePraise && (
                      <p className="text-[11px] text-muted italic leading-relaxed">
                        &ldquo;{t.samplePraise}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <Section title="Recommendations" tone="neutral" items={data.recommendations} />
          )}

          <div className="text-[10px] text-muted/70 font-mono tabular-nums">
            Generated {new Date(data.generatedAt).toLocaleString()}
            {data.modelUsed ? ` · ${data.modelUsed}` : ''}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = 'mid',
}: {
  label: string;
  value: string;
  accent?: 'up' | 'down' | 'mid';
}) {
  const color = accent === 'up' ? 'text-up' : accent === 'down' ? 'text-down' : '';
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-panel border border-border bg-surface">
      <span className="text-eyebrow uppercase text-muted">{label}</span>
      <span className={`text-[20px] font-mono tabular-nums font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const dotColor =
    tone === 'positive' ? 'var(--up)' : tone === 'negative' ? 'var(--down)' : 'var(--accent)';
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-eyebrow uppercase text-muted">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.length === 0 && <li className="text-[12px] text-muted italic">None.</li>}
        {items.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
            <span className="h-1.5 w-1.5 rounded-full mt-2 shrink-0" style={{ background: dotColor }} aria-hidden />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
