'use client';

import { useDashboardParams } from '@/lib/state/url-params';
import { useEstimates } from '@/lib/hooks/use-estimates';
import { SectionHead } from '@/components/primitives/section-head';
import { Panel } from '@/components/primitives/panel';
import { Skeleton } from '@/components/primitives/skeleton';
import { Stat } from '@/components/primitives/stat';
import { StackedBars } from '@/components/charts/stacked-bars';
import { AreaTrend } from '@/components/charts/area-trend';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import { fmtAsOf } from '@/lib/format/date';
import type { AnalyzeResponse } from '@/lib/types/kpi';

const TIER_LABEL: Record<string, string> = {
  low: 'Good (lowest option)',
  mid: 'Better (middle option)',
  high: 'Best (highest option)',
};

const TTC_LABEL: Record<string, string> = {
  same_day: 'Same day',
  one_to_7: '1–7 days',
  over_7: '8+ days',
};

// Fixed status colors — won reads as money in the door, open as still in
// play, dismissed as gone. Identity is never color-alone: every segment is
// paired with a labeled legend chip.
const STATUS = [
  { key: 'won', label: 'Won', color: 'var(--up)' },
  { key: 'open', label: 'Still open', color: 'var(--accent)' },
  { key: 'dismissed', label: 'Dismissed', color: 'var(--muted)' },
] as const;

export function AnalyzeView() {
  const [params] = useDashboardParams();
  const { data, isLoading, error, refetch } = useEstimates(params);

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Analyze"
        title="Estimate analysis"
        right={
          data && (
            <span className="text-meta font-mono text-muted hidden md:inline">
              Last 12 months · as of {fmtAsOf(data.meta.asOf)}
            </span>
          )
        }
      />

      {isLoading && <AnalyzeSkeleton />}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load estimate data</div>
            <button
              onClick={() => refetch()}
              className="text-[13px] font-medium px-3 py-1.5 rounded-btn bg-surface-2 hover:bg-surface-2/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </Panel>
      )}

      {data && <AnalyzeContent data={data} />}
    </div>
  );
}

function AnalyzeSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i} padding="tight">
            <Skeleton variant="stat" />
          </Panel>
        ))}
      </div>
      <Panel padding="cozy">
        <Skeleton variant="chart" />
      </Panel>
    </div>
  );
}

function AnalyzeContent({ data }: { data: AnalyzeResponse }) {
  const { totals } = data;
  const wins7 = data.timeToClose
    .filter((t) => t.bucket !== 'over_7')
    .reduce((s, t) => s + t.count, 0);
  const ttcTotal = data.timeToClose.reduce((s, t) => s + t.count, 0);
  const wins7Pct = ttcTotal > 0 ? Math.round((wins7 / ttcTotal) * 100) : null;

  const deptTotals = data.byDept.reduce(
    (acc, d) => ({
      opps: acc.opps + d.opportunities,
      wonRevenue: acc.wonRevenue + d.wonRevenueCents,
      unsold: acc.unsold + d.unsoldCents,
    }),
    { opps: 0, wonRevenue: 0, unsold: 0 },
  );

  return (
    <>
      {/* KPI strip */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Panel padding="tight">
          <Stat
            label="Opportunities"
            value={totals.opportunities}
            unit="count"
            sub={
              <span className="font-mono tabular-nums">
                {totals.wonCount.toLocaleString('en-US')} won ·{' '}
                {totals.unsoldCount.toLocaleString('en-US')} open ·{' '}
                {totals.dismissedCount.toLocaleString('en-US')} dismissed
              </span>
            }
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Close rate"
            value={totals.closeRateBps}
            unit="bps"
            sub={
              totals.medianTtcDays != null ? (
                <span className="font-mono tabular-nums">
                  median close:{' '}
                  {totals.medianTtcDays === 0 ? 'same day' : `${totals.medianTtcDays}d`}
                </span>
              ) : undefined
            }
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Won revenue"
            value={totals.wonRevenueCents}
            unit="cents"
            sub={
              <span className="font-mono tabular-nums">
                avg ticket {fmtMoney(totals.avgTicketCents, { abbreviate: true })}
              </span>
            }
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Realistic unsold"
            value={totals.unsoldCents}
            unit="cents"
            sub={<span>open jobs, option-averaged</span>}
          />
        </Panel>
      </div>

      {/* Outcome funnel */}
      <Panel
        eyebrow="Outcomes"
        title="Where opportunities end up"
        padding="cozy"
        right={
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted hidden sm:inline">
            one row per customer opportunity
          </span>
        }
      >
        <OutcomeFunnel totals={totals} />
      </Panel>

      {/* Seasonality — two single-axis charts sharing the month grain */}
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel
            eyebrow="Seasonality"
            title="Opportunities & wins by month"
            right={
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                solid: won · faded: all opportunities
              </span>
            }
          >
            <div className="w-full aspect-[3/1] min-h-[220px]">
              <StackedBars
                data={data.seasonality.map((s) => ({
                  label: s.month,
                  total: s.opportunities,
                  highlighted: s.won,
                }))}
                highlightedLabel="Won"
                totalLabel="Opportunities"
              />
            </div>
          </Panel>

          <Panel eyebrow="Seasonality" title="Won revenue by month">
            <div className="w-full aspect-[4/1] min-h-[160px]">
              <AreaTrend
                data={data.seasonality.map((s) => ({
                  label: s.month,
                  value: s.wonRevenueCents,
                }))}
                showTarget={false}
                unit="cents"
                valueLabel="Won revenue"
                height={180}
              />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel eyebrow="Price sensitivity" title="Close rate by estimate size">
            <BarList
              items={data.valueBands.map((b) => ({
                label: b.band,
                pct: Math.round(b.closeRateBps / 100),
                detail: `${b.won}/${b.opportunities} won`,
              }))}
              valueSuffix="%"
            />
          </Panel>

          <Panel eyebrow="Tier selection" title="Price tier chosen">
            <BarList
              items={data.tierSelection.map((t) => ({
                label: TIER_LABEL[t.tier] ?? t.tier,
                pct: t.pct,
                detail:
                  t.count > 0
                    ? `${t.count} · avg ${fmtMoney(t.avgTicketCents, { abbreviate: true })}`
                    : '0',
              }))}
              valueSuffix="%"
            />
          </Panel>

          <Panel eyebrow="Time to close" title="How quickly customers decide">
            <BarList
              items={data.timeToClose.map((t) => ({
                label: TTC_LABEL[t.bucket] ?? t.bucket,
                pct: t.pct,
                detail: `${t.count.toLocaleString('en-US')} won`,
              }))}
              valueSuffix="%"
            />
            {wins7Pct != null && (
              <p className="mt-3 pt-3 border-t border-border/60 text-[12px] text-muted leading-relaxed">
                <span className="font-mono tabular-nums font-medium text-text">{wins7Pct}%</span>{' '}
                of wins land within 7 days — estimates older than a week rarely
                convert, which is why the Financial page splits potential into
                hot (≤7d) and warm.
              </p>
            )}
          </Panel>
        </div>
      </div>

      {/* By dept */}
      <Panel eyebrow="Divisions" title="Breakdown by division" padding="cozy">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-left">
            <thead>
              <tr className="col-head border-b border-border">
                <th className="py-2 pr-4 font-normal">Division</th>
                <th className="py-2 pr-4 font-normal text-right">Opportunities</th>
                <th className="py-2 pr-4 font-normal text-right">Close rate</th>
                <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Avg ticket</th>
                <th className="py-2 pr-4 font-normal text-right hidden sm:table-cell">Won revenue</th>
                <th className="py-2 pr-2 font-normal text-right">Realistic unsold</th>
              </tr>
            </thead>
            <tbody>
              {data.byDept.map((d) => (
                <tr key={d.code} className="border-b border-border/60 hover:bg-surface-2/20 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: `var(--d-${d.code})` }}
                      />
                      <span className="text-[13px] font-medium">{d.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px] font-medium">
                    {d.opportunities.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px]">
                    {fmtPercent(d.closeRateBps)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden md:table-cell">
                    {fmtMoney(d.avgTicketCents)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] hidden sm:table-cell">
                    {fmtMoney(d.wonRevenueCents)}
                  </td>
                  <td className="py-3 pr-2 text-right font-mono tabular-nums text-[14px] font-medium">
                    {fmtMoney(d.unsoldCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="py-3 pr-4 text-[12px] uppercase tracking-[0.08em] text-muted">
                  Total
                </td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px] font-semibold">
                  {deptTotals.opps.toLocaleString('en-US')}
                </td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px]">
                  {fmtPercent(totals.closeRateBps)}
                </td>
                <td className="py-3 pr-4 hidden md:table-cell" />
                <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] font-semibold hidden sm:table-cell">
                  {fmtMoney(deptTotals.wonRevenue)}
                </td>
                <td className="py-3 pr-2 text-right font-mono tabular-nums text-[14px] font-semibold">
                  {fmtMoney(deptTotals.unsold)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </>
  );
}

// ─── Outcome funnel ─────────────────────────────────────────────────────────

function OutcomeFunnel({ totals }: { totals: AnalyzeResponse['totals'] }) {
  const counts = {
    won: totals.wonCount,
    open: totals.unsoldCount,
    dismissed: totals.dismissedCount,
  };
  const total = counts.won + counts.open + counts.dismissed;
  if (total === 0) {
    return <p className="text-[13px] text-muted">No estimate data in this window.</p>;
  }
  const pct = (n: number) => (n / total) * 100;
  const money: Record<string, string | null> = {
    won: `${fmtMoney(totals.wonRevenueCents, { abbreviate: true })} revenue`,
    open: `${fmtMoney(totals.unsoldCents, { abbreviate: true })} on the table`,
    dismissed: null,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Segmented bar — 2px surface gaps between segments */}
      <div className="flex h-3 w-full rounded-full overflow-hidden gap-[2px]">
        {STATUS.filter((s) => counts[s.key] > 0).map((s) => (
          <div
            key={s.key}
            className="h-full rounded-[2px] transition-[width] duration-300 ease-out"
            style={{
              width: `${Math.max(pct(counts[s.key]), 1)}%`,
              background: s.color,
              opacity: s.key === 'dismissed' ? 0.45 : 1,
            }}
            title={`${s.label}: ${counts[s.key].toLocaleString('en-US')}`}
          />
        ))}
      </div>

      {/* Legend — identity is never color-alone */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {STATUS.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: s.color, opacity: s.key === 'dismissed' ? 0.45 : 1 }}
            />
            <span className="text-muted">{s.label}</span>
            <span className="font-mono tabular-nums font-medium">
              {counts[s.key].toLocaleString('en-US')}
            </span>
            <span className="font-mono tabular-nums text-[12px] text-muted">
              ({Math.round(pct(counts[s.key]))}%)
            </span>
            {money[s.key] && (
              <span className="font-mono tabular-nums text-[12px] text-muted/70 hidden sm:inline">
                · {money[s.key]}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Bar list ───────────────────────────────────────────────────────────────

interface BarItem {
  label: string;
  /** 0–100 — drives both the printed value and the bar width. */
  pct: number;
  /** Secondary right-side context, e.g. "12/40 won" or "8 · avg $4.2k". */
  detail?: string;
}

function BarList({ items, valueSuffix = '%' }: { items: BarItem[]; valueSuffix?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="font-mono tabular-nums whitespace-nowrap">
              {i.pct}
              {valueSuffix}
              {i.detail && <span className="text-muted text-[12px]"> · {i.detail}</span>}
            </span>
          </div>
          <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(Math.max(i.pct, 0), 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
