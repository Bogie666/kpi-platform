'use client';

import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import { AreaTrend, type AreaTrendPoint } from '@/components/charts/area-trend';
import { DualTrend, type DualTrendPoint } from '@/components/charts/dual-trend';
import { TrendLegend } from '@/components/charts/trend-legend';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import { cn } from '@/lib/cn';
import { fmtAsOf } from '@/lib/format/date';
import { DeltaPill } from '@/components/primitives/delta-pill';
import { LiveDot } from '@/components/primitives/live-dot';
import type { FinancialResponse } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';
import type { PipelineRevenueResponse } from '@/app/api/kpi/pipeline-revenue/route';

export interface FinancialHeroProps {
  data: FinancialResponse;
  compareMode: CompareMode;
  pipeline?: PipelineRevenueResponse;
}

function compareModeToStat(m: CompareMode): 'prev' | 'ly' | 'ly2' | 'none' {
  if (m === 'prev') return 'prev';
  if (m === 'ly') return 'ly';
  if (m === 'ly2') return 'ly2';
  return 'prev';
}

/** 8 → "8a", 13.5 → "1:30p" — compact clock label for an hour-of-day. */
function fmtClockHour(hourOfDay: number): string {
  const h24 = ((hourOfDay % 24) + 24) % 24;
  let h = Math.floor(h24);
  let m = Math.round((h24 - h) * 60);
  if (m === 60) {
    h = (h + 1) % 24;
    m = 0;
  }
  const suffix = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m > 0 ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

/** 3 → "3", 3.25 → "3.3" — compact elapsed-hours label. */
function fmtHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

export function FinancialHero({ data, compareMode, pipeline }: FinancialHeroProps) {
  const { total, trend } = data;
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';
  const compareYear: 'ly' | 'ly2' = compareMode === 'ly2' ? 'ly2' : 'ly';

  const today = total.today;
  // Intraday pace (when the API provides it): compare today's revenue against
  // the share of the day target that should be in the door *by now* — the day
  // target spread over the configured working day — instead of the full-day
  // number, which made every morning read as "behind goal". Falls back to the
  // full-day comparison for older cached payloads without `pace`.
  const pace = today?.pace ?? null;
  const expectedNow = pace ? pace.expected : today?.target ?? 0;
  const paceLive = pace != null && pace.isWorkday && pace.elapsedHours > 0;
  const preWorkday = pace != null && pace.isWorkday && pace.elapsedHours <= 0;
  const offDay = pace != null && !pace.isWorkday;
  const workdayDone = pace != null && pace.isWorkday && pace.elapsedHours >= pace.workdayHours;
  // "Ahead" means ahead of where we should be by now. Before the workday (or
  // on an off day) expected is 0, so any revenue counts as ahead.
  const todayAhead = today
    ? expectedNow > 0
      ? today.revenue >= expectedNow
      : today.revenue > 0 || !pace
    : false;

  const pctToGoal = total.percentToGoal / 100;
  const fullTarget = total.fullPeriodTarget;
  // Only call out the full-period goal when it's meaningfully larger than
  // the pace-adjusted figure — for last_month / fully-elapsed windows the
  // two values are identical and the second pill would be noise.
  const showFullPeriod = fullTarget > 0 && fullTarget > total.target * 1.01;
  const fullPeriodLabel =
    data.meta.period === 'YTD'
      ? 'Annual goal'
      : data.meta.period === 'QTD'
        ? 'Quarter goal'
        : 'Monthly goal';
  // Pipeline = won (sold) estimates on work scheduled-but-not-yet-completed
  // within the selected budget period. Show as a quiet second line under the
  // daily-pace meta — big number stays actual revenue, pipeline doesn't
  // compete for primacy. actual + pipeline = period-end projection.
  const pipelineCents = pipeline?.totalCents ?? 0;
  const showPipeline = pipelineCents > 0;
  const combinedCents = total.revenue.value + pipelineCents;
  // Label the window end from the response (e.g. "through Jul 31") rather
  // than assuming EOM — QTD/YTD extend to quarter/year end.
  const pipelineThrough = (() => {
    const end = pipeline?.windowEnd;
    if (!end) return 'this period';
    const monthIdx = Number(end.slice(5, 7)) - 1;
    const day = Number(end.slice(-2));
    const abbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `through ${abbr[monthIdx] ?? ''} ${day}`;
  })();

  const subMeta = (
    <div className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums">
        <span>
          {fmtPercent(total.percentToGoal)} of {fmtMoney(total.target)} daily pace ·{' '}
          {data.meta.period}
        </span>
        {showFullPeriod && (
          <>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
            <span className="text-muted">
              {fullPeriodLabel}: {fmtMoney(fullTarget)}
            </span>
          </>
        )}
      </span>
      {showPipeline && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums text-[12px] text-muted">
          <span className="text-up" aria-hidden="true">+</span>
          <span className="text-up font-medium">{fmtMoney(pipelineCents)} pipeline</span>
          <span aria-hidden="true" className="text-muted/50">→</span>
          <span className="text-text/80">{fmtMoney(combinedCents)} projected</span>
          <span className="text-muted/60 text-[11px]">(sold work, {pipelineThrough})</span>
        </span>
      )}
    </div>
  );

  // X-axis label strategy: short windows show day-of-month; long windows
  // (~60+ days) show abbreviated months on the 1st of each month and blank
  // otherwise, so the user sees "Jan / Feb / Mar / Apr" instead of a wall
  // of day numbers when YTD/QTD/TTM/L90 is active.
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const longWindow = trend.length > 60;
  const dayLabel = (t: (typeof trend)[number]) => String(Number(t.date.slice(-2)));
  const monthLabel = (t: (typeof trend)[number]) => {
    const day = Number(t.date.slice(-2));
    if (day !== 1) return '';
    const monthIdx = Number(t.date.slice(5, 7)) - 1;
    return MONTH_ABBR[monthIdx] ?? '';
  };
  const xLabel = (t: (typeof trend)[number]) =>
    longWindow ? monthLabel(t) : dayLabel(t);
  const hoverLabel = (t: (typeof trend)[number]) => {
    const monthIdx = Number(t.date.slice(5, 7)) - 1;
    const day = Number(t.date.slice(-2));
    return `${MONTH_ABBR[monthIdx] ?? ''} ${day}`;
  };

  const chart = compareOn ? (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex-1 min-h-[220px]">
        <DualTrend
          data={
            trend.map((t) => ({
              label: xLabel(t),
              hoverLabel: hoverLabel(t),
              actual: t.actual,
              ly: t.ly,
              ly2: t.ly2,
              target: t.target,
            })) satisfies DualTrendPoint[]
          }
          mode={compareYear}
          unit="cents"
          height={260}
        />
      </div>
      <TrendLegend mode={compareYear} />
    </div>
  ) : (
    <div className="h-[240px] sm:h-[280px] lg:h-auto lg:min-h-[220px]">
      <AreaTrend
        data={
          trend.map((t) => ({
            label: xLabel(t),
            hoverLabel: hoverLabel(t),
            value: t.actual,
            target: t.target,
          })) satisfies AreaTrendPoint[]
        }
        height={260}
        unit="cents"
        valueLabel="Revenue"
      />
    </div>
  );

  return (
    <Panel className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8 lg:gap-12" padding="cozy">
      <div className="flex flex-col justify-between gap-6 min-h-[220px]">
        <Stat
          label="Total revenue"
          value={total.revenue.value}
          unit="cents"
          comparison={total.revenue}
          compareMode={compareModeToStat(compareMode)}
          emphasis="hero"
          sub={subMeta}
        />

        {today && (
          <div
            className="rounded-card bg-surface-2 p-4 border"
            style={{ borderColor: 'color-mix(in oklch, var(--accent) 28%, var(--border))' }}
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="flex items-center gap-2">
                <LiveDot size="sm" label="" />
                <span className="text-eyebrow uppercase text-text">
                  {today.isToday ? 'Today' : 'Final day'} · {pace ? 'Hourly' : 'Daily'} pace
                </span>
              </span>
              <span className="font-mono tabular-nums text-[11px] text-muted">
                as of {fmtAsOf(data.meta.asOf)}
              </span>
            </div>

            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-kpi font-mono tabular-nums">{fmtMoney(today.revenue)}</span>
              <span className="font-mono tabular-nums text-[14px] text-muted">
                / {fmtMoney(today.target)} target
              </span>
              {paceLive ? (
                <DeltaPill current={today.revenue} previous={expectedNow} format="money" />
              ) : !pace ? (
                <DeltaPill current={today.revenue} previous={today.target} format="percent" />
              ) : null}
            </div>

            <div className="flex items-center gap-2.5 mt-3">
              <div className="relative h-1.5 flex-1 bg-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.min(today.percentToGoal / 100, 100)}%` }}
                />
                {/* Pace marker — where the fill should reach by this hour. */}
                {paceLive && expectedNow > 0 && expectedNow < today.target && (
                  <div
                    aria-hidden="true"
                    className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-text/60 rounded-full"
                    style={{ left: `${Math.min((expectedNow / today.target) * 100, 100)}%` }}
                    title={`${fmtMoney(expectedNow)} expected by now`}
                  />
                )}
              </div>
              <span
                className={cn(
                  'font-mono tabular-nums text-[12px] w-12 text-right',
                  todayAhead ? 'text-up' : 'text-muted',
                )}
              >
                {fmtPercent(today.percentToGoal)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 mt-2 text-[11px]">
              {pace ? (
                offDay ? (
                  <>
                    <span className="text-muted">Non-workday — no pace target</span>
                    {today.revenue > 0 && (
                      <span className="font-mono tabular-nums text-up">
                        +{fmtMoney(today.revenue)} bonus
                      </span>
                    )}
                  </>
                ) : preWorkday ? (
                  <>
                    <span className="text-muted">
                      Workday starts at {fmtClockHour(pace.startHour)} ·{' '}
                      {fmtMoney(pace.hourlyTarget)}/hr target
                    </span>
                    {today.revenue > 0 && (
                      <span className="font-mono tabular-nums text-up">
                        +{fmtMoney(today.revenue)} early start
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-muted">
                      {workdayDone
                        ? `Workday complete (${fmtHours(pace.workdayHours)}h)`
                        : `${fmtMoney(expectedNow)} expected by now · ${fmtHours(pace.elapsedHours)}h of ${fmtHours(pace.workdayHours)}h`}{' '}
                      · {fmtMoney(pace.hourlyTarget)}/hr
                    </span>
                    <span
                      className={cn(
                        'font-mono tabular-nums whitespace-nowrap',
                        todayAhead ? 'text-up' : 'text-down',
                      )}
                    >
                      {todayAhead ? '+' : ''}
                      {fmtMoney(today.revenue - expectedNow)}{' '}
                      {todayAhead ? 'ahead of pace' : 'behind pace'}
                    </span>
                  </>
                )
              ) : (
                <>
                  <span className="text-muted">Overall daily revenue vs daily target</span>
                  <span className={cn('font-mono tabular-nums', todayAhead ? 'text-up' : 'text-down')}>
                    {todayAhead ? '+' : ''}{fmtMoney(today.revenue - today.target)}{' '}
                    {todayAhead ? 'ahead of goal' : 'behind goal'}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span className="text-eyebrow uppercase">Daily pace</span>
            <span className="font-mono tabular-nums">
              {fmtMoney(total.revenue.value)} / {fmtMoney(total.target)}
            </span>
          </div>
          <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(pctToGoal, 100)}%` }}
            />
          </div>
          {showFullPeriod && (
            <div className="flex items-center justify-between text-[11px] text-muted/80 mt-1">
              <span className="text-eyebrow uppercase">{fullPeriodLabel}</span>
              <span className="font-mono tabular-nums">
                {fmtMoney(fullTarget)}{' '}
                <span className="text-muted/60">
                  ({fmtPercent(fullTarget > 0 ? Math.round((total.revenue.value / fullTarget) * 10000) : 0)})
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
      {chart}
    </Panel>
  );
}
