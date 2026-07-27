'use client';

import { useMemo } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import { ComparePill } from '@/components/primitives/compare-pill';
import { StackedBars } from '@/components/charts/stacked-bars';
import { TrendLegend } from '@/components/charts/trend-legend';
import { CompareBanner } from '@/components/layout/compare-banner';
import { cn } from '@/lib/cn';
import { fmtPercent } from '@/lib/format/percent';
import { callCenterInsights } from '@/lib/insights/operations';
import type { CallCenterResponse } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';

function toStatMode(m: CompareMode): 'prev' | 'ly' | 'ly2' | 'none' {
  if (m === 'ly') return 'ly';
  if (m === 'ly2') return 'ly2';
  return 'prev';
}

/**
 * Ranked single-measure list — reason name, proportional bar, count.
 * One hue (accent) since every row encodes the same measure; text stays
 * in ink tokens.
 */
function ReasonList({
  rows,
  emptyText,
}: {
  rows: Array<{ label: string; value: number; detail?: string }>;
  emptyText: string;
}) {
  const MAX_ROWS = 12;
  const shown = rows.slice(0, MAX_ROWS);
  const rest = rows.slice(MAX_ROWS);
  const max = shown.reduce((m, r) => Math.max(m, r.value), 0);

  if (rows.length === 0) {
    return <p className="text-[13px] text-muted py-2">{emptyText}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {shown.map((r) => (
        <li key={r.label} className="py-2">
          <div className="flex items-baseline gap-3">
            <span className="text-[13px] font-medium truncate flex-1 min-w-0">{r.label}</span>
            <span className="font-mono tabular-nums text-[13px] shrink-0">
              {r.value.toLocaleString()}
              {r.detail && <span className="text-muted"> {r.detail}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-1 rounded-pill bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-pill bg-accent/70"
              style={{ width: max > 0 ? `${Math.max((r.value / max) * 100, 2)}%` : 0 }}
            />
          </div>
        </li>
      ))}
      {rest.length > 0 && (
        <li className="py-2 text-[12px] text-muted">
          +{rest.length} more · {rest.reduce((s, r) => s + r.value, 0).toLocaleString()} total
        </li>
      )}
    </ul>
  );
}

const RANK_CLS: Record<string, string> = {
  '1': 'bg-[color-mix(in_oklch,var(--accent)_20%,var(--surface-2))] text-accent border-accent/50',
  '2': 'bg-surface-2 text-muted border-border',
  '3': 'bg-[color-mix(in_oklch,var(--warning)_15%,var(--surface-2))] text-warning border-warning/40',
  n: 'bg-surface-2 text-muted border-border',
};

export interface CallCenterPanelProps {
  data: CallCenterResponse;
  compareMode: CompareMode;
}

export function CallCenterPanel({ data, compareMode }: CallCenterPanelProps) {
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';
  const compareYear: 'ly' | 'ly2' = compareMode === 'ly2' ? 'ly2' : 'ly';
  const statMode = toStatMode(compareMode);

  const insights = useMemo(
    () => (compareOn ? callCenterInsights(data, compareYear) : []),
    [compareOn, compareYear, data],
  );

  return (
    <div className="flex flex-col gap-6">
      {compareOn && insights.length > 0 && (
        <CompareBanner insights={insights} mode={compareYear} />
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Panel padding="tight">
          <Stat
            label="Booked"
            value={data.kpis.booked.value}
            unit="count"
            comparison={data.kpis.booked}
            compareMode={statMode}
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Booking rate"
            value={data.kpis.bookRate.value}
            unit="bps"
            comparison={data.kpis.bookRate}
            compareMode={statMode}
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Avg call time"
            value={data.kpis.avgCallTime.value}
            unit="seconds"
            comparison={data.kpis.avgCallTime}
            compareMode={statMode}
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Abandon rate"
            value={data.kpis.abandonRate.value}
            unit="bps"
            comparison={data.kpis.abandonRate}
            compareMode={statMode}
          />
        </Panel>
      </div>

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Today"
          title="Calls vs bookings"
          right={
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
              {compareOn ? `Overlaid with ${compareYear === 'ly2' ? '2024' : '2025'}` : 'Hourly pacing'}
            </span>
          }
        >
          <div className="w-full aspect-[3/1] min-h-[220px]">
            <StackedBars
              data={data.hourly.map((h) => ({
                label: h.hr,
                total: h.calls,
                highlighted: h.booked,
                lyTotal: h.lyCalls,
                lyHighlighted: h.lyBooked,
              }))}
              compareMode={compareMode}
              highlightedLabel="Booked"
              totalLabel="Calls"
            />
          </div>
          {compareOn && <TrendLegend mode={compareYear} showTarget={false} className="mt-3" />}
        </Panel>

        <Panel
          eyebrow="Leaderboard"
          title="Agents"
          right={
            compareOn ? (
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                Rate · Δ vs {compareYear === 'ly2' ? '2024' : 'LY'}
              </span>
            ) : null
          }
        >
          <ul className="flex flex-col divide-y divide-border/60">
            {data.agents.map((a, i) => {
              const rankKey = i < 3 ? String(i + 1) : 'n';
              return (
                <li key={a.name} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-6 w-9 rounded-pill border text-[11px] font-mono tabular-nums font-medium shrink-0',
                      RANK_CLS[rankKey],
                    )}
                  >
                    #{i + 1}
                  </span>
                  <span className="text-[13px] font-medium truncate flex-1 min-w-0">{a.name}</span>
                  {compareOn && a.lyRate !== undefined ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono tabular-nums text-[13px]">
                        {fmtPercent(a.rate, { decimals: 0 })}
                      </span>
                      <ComparePill
                        current={a.rate}
                        comparison={a.lyRate}
                        unit="bps"
                        baseline={compareYear}
                        size="sm"
                      />
                    </span>
                  ) : (
                    <span className="font-mono tabular-nums text-[13px] text-muted">
                      {a.booked}/{a.calls} · {fmtPercent(a.rate, { decimals: 0 })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        <Panel
          eyebrow="Unbooked leads"
          title="By call reason"
          right={
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
              Unbooked · of leads
            </span>
          }
        >
          <ReasonList
            rows={(data.unbookedReasons ?? []).map((r) => ({
              label: r.reason,
              value: r.unbooked,
              detail: `/ ${r.leads.toLocaleString()}`,
            }))}
            emptyText="No unbooked lead calls recorded for this period yet."
          />
          <p className="mt-3 text-[11px] text-muted">
            Reason = what the customer called about (ST call reason), not the CSR&apos;s
            not-booked excuse — ServiceTitan doesn&apos;t track that on the call record.
          </p>
        </Panel>

        <Panel
          eyebrow="Cancellations"
          title="By cancel reason"
          right={
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
              Jobs
            </span>
          }
        >
          <ReasonList
            rows={(data.cancelReasons ?? []).map((r) => ({
              label: r.reason,
              value: r.count,
            }))}
            emptyText="No canceled jobs recorded for this period yet."
          />
        </Panel>
      </div>
    </div>
  );
}
