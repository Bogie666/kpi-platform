'use client';

import { useState } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import { useDailyTargets } from '@/lib/hooks/use-daily-targets';
import { SectionHead } from '@/components/primitives/section-head';
import { Panel } from '@/components/primitives/panel';
import { Pill, type PillTone } from '@/components/primitives/pill';
import { Skeleton } from '@/components/primitives/skeleton';
import { Stat } from '@/components/primitives/stat';
import { fmtAsOf } from '@/lib/format/date';
import { fmtMoney } from '@/lib/format/money';
import { cn } from '@/lib/cn';
import type { DailyTargetRow } from '@/lib/targets/compute';
import type { TrailingSource, PaceStatus } from '@/lib/targets/compute';
import type { MonthProjection } from '@/lib/targets/projection';

const STATUS_TONE: Record<PaceStatus, PillTone> = {
  ahead: 'up',
  on_pace: 'accent',
  behind: 'down',
  no_budget: 'default',
};

const STATUS_LABEL: Record<PaceStatus, string> = {
  ahead: 'Ahead',
  on_pace: 'On pace',
  behind: 'Behind',
  no_budget: 'No budget',
};

export function TargetsView() {
  const { data, isLoading, error, refetch } = useDailyTargets();
  const [creditBacklog, setCreditBacklog] = useState(true);

  // Both variants come precomputed in the payload, so toggling is instant.
  const view = data
    ? creditBacklog
      ? { totals: data.totals, divisions: data.divisions, projection: data.projection }
      : data.withoutBacklog
    : null;

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow={data ? data.calendar.monthLabel : 'Daily pace'}
        title="Today's Targets"
        right={
          data && (
            <>
              <BacklogToggle value={creditBacklog} onChange={setCreditBacklog} />
              <span className="text-meta font-mono text-muted hidden md:inline">
                as of {fmtAsOf(data.asOf)}
              </span>
            </>
          )
        }
      />

      {isLoading && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Panel key={i} padding="tight">
                <Skeleton variant="stat" />
              </Panel>
            ))}
          </div>
          <Panel padding="cozy">
            <Skeleton variant="table-row" count={6} className="mb-2" />
          </Panel>
        </div>
      )}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load today&apos;s targets</div>
            <p className="text-[13px] text-muted">
              The first load of the day crawls ServiceTitan and can take a moment —
              try again.
            </p>
            <button
              onClick={() => refetch()}
              className="text-[13px] font-medium px-3 py-1.5 rounded-btn bg-surface-2 hover:bg-surface-2/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </Panel>
      )}

      {data && view && (
        <>
          {!data.calendar.isWorkdayToday && (
            <Panel padding="tight" className="border-warning/40">
              <div className="flex items-center gap-2 text-[13px] text-warning">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                Today isn&apos;t a scheduled working day — numbers shown pace the
                remaining budget over the next {data.calendar.remainingWorkdays}{' '}
                workday{data.calendar.remainingWorkdays === 1 ? '' : 's'}. Weekend
                production counts as bonus and shows up as relief on Monday.
              </div>
            </Panel>
          )}

          <div
            className={cn(
              'grid gap-4 grid-cols-1 sm:grid-cols-2',
              data.capacityTotals ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
            )}
          >
            <Panel padding="tight">
              <Stat
                label="Daily target — all divisions"
                value={view.totals.dailyTargetCents}
                unit="cents"
                sub={
                  view.totals.todayCents > 0
                    ? `${fmtMoney(view.totals.todayCents)} invoiced today (${Math.min(
                        Math.round((view.totals.todayCents / Math.max(view.totals.dailyTargetCents, 1)) * 100),
                        999,
                      )}% of target)`
                    : 'revenue needed today to stay on budget'
                }
              />
            </Panel>
            <Panel padding="tight">
              <Stat
                label="Remaining budget"
                value={Math.max(view.totals.remainingBudgetCents, 0)}
                unit="cents"
                sub={`${data.calendar.remainingWorkdays} of ${data.calendar.totalWorkdays} workdays left${
                  data.calendar.holidays.length > 0
                    ? ` · ${data.calendar.holidays.length} holiday${data.calendar.holidays.length === 1 ? '' : 's'} this month`
                    : ''
                }`}
              />
            </Panel>
            <Panel padding="tight">
              <Stat
                label="MTD revenue — thru yesterday"
                value={view.totals.mtdCents}
                unit="cents"
                sub={
                  view.totals.budgetCents > 0
                    ? `${Math.round((view.totals.mtdCents / view.totals.budgetCents) * 100)}% of ${fmtMoney(view.totals.budgetCents)} budget · today counts toward today's target`
                    : 'no budget set'
                }
              />
            </Panel>
            <Panel padding="tight">
              <Stat
                label="Scheduled backlog"
                value={view.totals.backlogCents}
                unit="cents"
                sub={`sold work on the books through month end · ${view.totals.jobsScheduledToday} jobs scheduled today${
                  creditBacklog ? '' : ' · not credited'
                }`}
              />
            </Panel>
            {data.capacityTotals && (
              <Panel padding="tight">
                <div className="flex flex-col gap-1.5">
                  <span className="text-eyebrow uppercase text-muted">
                    Capacity left today
                  </span>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-mono tabular-nums text-kpi">
                      {data.capacityTotals.openHours.toFixed(1)}h
                    </span>
                  </div>
                  <div className="text-[12px] text-muted">
                    {data.capacityTotals.techsAvailable} of {data.capacityTotals.techsTotal}{' '}
                    techs with open time
                    {data.capacityTotals.utilization != null &&
                      ` · board ${Math.round(data.capacityTotals.utilization * 100)}% booked`}
                  </div>
                </div>
              </Panel>
            )}
          </div>

          <TargetsTable rows={view.divisions} creditBacklog={creditBacklog} />

          <ProjectionPanel
            projection={view.projection}
            budgetCents={view.totals.budgetCents}
            todayIso={data.date}
            creditBacklog={creditBacklog}
          />

          <p className="text-[12px] text-muted leading-relaxed">
            Daily target = (budget − MTD thru yesterday
            {creditBacklog ? ' − scheduled backlog' : ''}) ÷ remaining weekday
            workdays — held fixed through the day, with revenue invoiced today
            shown as progress against it.{' '}
            {creditBacklog
              ? 'Backlog is credited because it is already sold and scheduled this month.'
              : 'Backlog is shown for context but not credited — it isn’t revenue until it’s invoiced.'}{' '}
            Jobs needed uses trailing 30-day revenue per completed job
            (close rate already baked in). Maint and demand booked are today&apos;s
            board counts; calls short = demand calls still to book after crediting
            both today&apos;s scheduled maintenance and the demand calls already
            booked, at trailing revenue-per-call rates. Capacity left is live from
            ServiceTitan dispatch — unbooked tech-hours still ahead of now, with a
            rough calls-absorbable estimate at ~2.5 tech-hours per demand call.
            When calls short exceeds capacity, the overflow needs overtime,
            borrowed techs, or tomorrow&apos;s board. Expand a row for the
            per-source rates behind the math.
          </p>
        </>
      )}
    </div>
  );
}

function BacklogToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Backlog handling"
      className="flex items-center gap-0.5 rounded-btn border border-border bg-surface-2 p-0.5"
    >
      {[
        { v: true, label: 'Credit backlog' },
        { v: false, label: 'Ignore backlog' },
      ].map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.label}
            onClick={() => onChange(opt.v)}
            aria-pressed={active}
            title={
              opt.v
                ? 'Subtract sold-and-scheduled work from the remaining budget'
                : 'Pace on invoiced revenue only — backlog isn’t guaranteed'
            }
            className={cn(
              'text-[12px] font-medium px-2.5 py-1 rounded-btn transition-colors whitespace-nowrap',
              active
                ? 'bg-accent text-white shadow-sm'
                : 'text-muted hover:text-text hover:bg-surface-2',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function TargetsTable({
  rows,
  creditBacklog,
}: {
  rows: DailyTargetRow[];
  creditBacklog: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <Panel eyebrow="Divisions" title="Jobs needed today" padding="cozy">
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-left">
          <thead>
            <tr className="col-head border-b border-border">
              <HeaderTh tip="Click a row for the per-source trailing rates and diagnostics behind its numbers." align="left">
                Division
              </HeaderTh>
              <HeaderTh
                tip="This month's revenue budget for the division, from the targets admin."
                className="hidden xl:table-cell"
              >
                Budget
              </HeaderTh>
              <HeaderTh
                tip="Completed revenue month-start through yesterday. Today's invoices show under Daily target as progress instead."
                className="hidden md:table-cell"
              >
                MTD
              </HeaderTh>
              <HeaderTh
                tip={
                  creditBacklog
                    ? 'Budget − MTD − backlog: revenue still to generate this month. Green when the month is already covered.'
                    : 'Budget − MTD: revenue still to invoice this month. Green when the month is already covered.'
                }
                className="hidden lg:table-cell"
              >
                Remaining
              </HeaderTh>
              <HeaderTh
                tip={
                  creditBacklog
                    ? 'Sold-but-not-completed revenue on jobs scheduled within this month. Credited against the daily target.'
                    : 'Sold-but-not-completed revenue on jobs scheduled within this month. Context only in this view — not credited, since it isn’t guaranteed until invoiced.'
                }
                className="hidden lg:table-cell"
              >
                Backlog
              </HeaderTh>
              <HeaderTh tip="Remaining budget ÷ remaining weekday workdays (incl. today, minus holidays). Fixed for the day — the line under it is revenue invoiced today.">
                Daily target
              </HeaderTh>
              <HeaderTh
                tip="Daily target ÷ trailing 30-day revenue per completed job (close rate already baked in)."
                className="hidden sm:table-cell"
              >
                Jobs Needed
              </HeaderTh>
              <HeaderTh tip="Maintenance / PSI / ESI appointments on today's board.">
                Maint booked
              </HeaderTh>
              <HeaderTh tip="Demand service appointments on today's board.">
                Demand booked
              </HeaderTh>
              <HeaderTh
                tip="Demand calls still to book beyond today's board, after crediting booked maintenance and demand at trailing rev/call."
                align="right"
              >
                Calls short
              </HeaderTh>
              <HeaderTh
                tip="Open (unbooked) tech-hours left on today's dispatch board, from ServiceTitan capacity — with the rough demand-call count those hours could absorb."
                className="hidden md:table-cell"
              >
                Capacity left
              </HeaderTh>
              <HeaderTh
                tip="Month pace: MTD vs budget × elapsed workdays. Ahead ≥ 105% of expected-to-date, behind ≤ 95%."
                align="right"
                last
              >
                Status
              </HeaderTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = expanded.has(r.code);
              return (
                <RowPair
                  key={r.code}
                  row={
                    <tr
                      className={cn(
                        'border-b border-border/60 hover:bg-surface-2/20 transition-colors cursor-pointer',
                        isOpen && 'bg-surface-2/15',
                      )}
                      onClick={() => toggle(r.code)}
                      aria-expanded={isOpen}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            aria-hidden="true"
                            className={cn(
                              'h-3.5 w-3.5 text-muted transition-transform shrink-0',
                              isOpen && 'rotate-90',
                            )}
                          />
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ background: `var(${r.colorToken})` }}
                          />
                          <span className="text-[13px] font-medium">{r.name}</span>
                          {r.flags.length > 0 && (
                            <TriangleAlert
                              className="h-3.5 w-3.5 text-warning shrink-0"
                              aria-label="Has caveats — expand for details"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden xl:table-cell">
                        {fmtMoney(r.monthlyBudgetCents)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] hidden md:table-cell">
                        {fmtMoney(r.mtdRevenueCents)}
                      </td>
                      <td
                        className={cn(
                          'py-3 pr-4 text-right font-mono tabular-nums text-[13px] hidden lg:table-cell',
                          r.remainingBudgetCents < 0 && 'text-up',
                        )}
                      >
                        {fmtMoney(r.remainingBudgetCents)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden lg:table-cell">
                        {r.backlogCents > 0 ? fmtMoney(r.backlogCents) : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px]">
                        {fmtMoney(r.dailyTargetCents)}
                        {r.todayRevenueCents > 0 && (
                          <div
                            className={cn(
                              'text-[11px]',
                              r.dailyTargetCents > 0 && r.todayRevenueCents >= r.dailyTargetCents
                                ? 'text-up'
                                : 'text-muted',
                            )}
                          >
                            {fmtMoney(r.todayRevenueCents)} today
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px] hidden sm:table-cell">
                        {r.jobsNeededToday ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px]">
                        {r.maintScheduledToday > 0 ? r.maintScheduledToday : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px]">
                        {r.demandCallsBooked > 0 ? r.demandCallsBooked : '—'}
                      </td>
                      <td
                        className={cn(
                          'py-3 pr-4 text-right font-mono tabular-nums text-[14px] font-medium',
                          (r.demandCallsShort ?? 0) > 0 ? 'text-down' : 'text-up',
                        )}
                      >
                        {r.demandCallsShort == null
                          ? '—'
                          : r.demandCallsShort > 0
                            ? `+${r.demandCallsShort}`
                            : 'covered'}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] hidden md:table-cell">
                        {r.capacity == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span
                            className={cn(
                              (r.callsBeyondCapacity ?? 0) > 0 && 'text-warning',
                            )}
                          >
                            {r.capacity.openHours.toFixed(1)}h
                            <span className="text-muted text-[11px]">
                              {' '}
                              · ~{r.capacity.callsCapacity} calls
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <Pill tone={STATUS_TONE[r.status]} size="sm">
                          {STATUS_LABEL[r.status]}
                        </Pill>
                      </td>
                    </tr>
                  }
                  detail={
                    isOpen ? (
                      <tr className="border-b border-border/40 bg-surface-2/10">
                        <td colSpan={12} className="py-3 px-4">
                          <RowDetail row={r} />
                        </td>
                      </tr>
                    ) : null
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RowDetail({ row }: { row: DailyTargetRow }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-x-8 gap-y-2 grid-cols-2 md:grid-cols-4">
        <SourceRate label="Blended rev/job" source={row.trailing.blended} />
        <SourceRate label="Maintenance rev/call" source={row.trailing.maintenance} />
        <SourceRate label="Demand rev/call" source={row.trailing.demand} />
        <SourceRate label="Install rev/job" source={row.trailing.install} />
      </div>
      <div className="grid gap-x-8 gap-y-2 grid-cols-2 md:grid-cols-4 text-[12px]">
        <DetailItem
          label="Today's board"
          value={`${row.todaySchedule.maintenance} maint · ${row.todaySchedule.demand} demand · ${row.todaySchedule.install} install`}
        />
        <DetailItem
          label="Maint coverage today"
          value={row.maintRevenueTodayCents > 0 ? fmtMoney(row.maintRevenueTodayCents) : '—'}
        />
        <DetailItem label="Gap after maint" value={fmtMoney(row.gapCents)} />
        <DetailItem
          label="Demand calls needed (gross)"
          value={row.demandCallsNeeded != null ? String(row.demandCallsNeeded) : '—'}
        />
        <DetailItem
          label="Invoiced today"
          value={
            row.todayRevenueCents > 0
              ? `${fmtMoney(row.todayRevenueCents)} of ${fmtMoney(row.dailyTargetCents)} target`
              : '—'
          }
        />
        <DetailItem
          label="Pace vs budget"
          value={row.paceRatio != null ? `${Math.round(row.paceRatio * 100)}% of expected-to-date` : '—'}
        />
        {row.capacity != null && (
          <>
            <DetailItem
              label="Capacity left today"
              value={`${row.capacity.openHours.toFixed(1)}h open of ${row.capacity.totalHours.toFixed(1)}h · ${row.capacity.techsAvailable}/${row.capacity.techsTotal} techs${
                row.capacity.utilization != null
                  ? ` · ${Math.round(row.capacity.utilization * 100)}% booked`
                  : ''
              }`}
            />
            <DetailItem
              label="Calls short vs capacity"
              value={
                row.demandCallsShort == null
                  ? '—'
                  : row.demandCallsShort === 0
                    ? 'covered — no extra calls needed'
                    : `${row.callsBookable ?? 0} bookable today · ${row.callsBeyondCapacity ?? 0} beyond today's board`
              }
            />
          </>
        )}
      </div>
      {row.flags.length > 0 && (
        <ul className="flex flex-col gap-1">
          {row.flags.map((f) => (
            <li key={f} className="flex items-center gap-1.5 text-[12px] text-warning">
              <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceRate({ label, source }: { label: string; source: TrailingSource | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-eyebrow uppercase text-muted">{label}</span>
      {source?.revenuePerJobCents != null ? (
        <span className="font-mono tabular-nums text-[13px]">
          {fmtMoney(source.revenuePerJobCents)}
          <span className="text-muted text-[11px]">
            {' '}
            · {source.jobs} jobs / {source.windowDays}d
          </span>
        </span>
      ) : (
        <span className="text-[13px] text-muted">—</span>
      )}
    </div>
  );
}

/**
 * Column header with a hover tooltip. CSS-only (group-hover) so it works
 * inside the horizontally scrollable table; the bubble opens downward over
 * the table body to avoid clipping at the panel's top edge. `align` keeps
 * edge-column bubbles inside the scroll container.
 */
function HeaderTh({
  children,
  tip,
  align = 'center',
  last = false,
  className,
}: {
  children: React.ReactNode;
  tip: string;
  align?: 'left' | 'center' | 'right';
  last?: boolean;
  className?: string;
}) {
  return (
    <th
      className={cn(
        'py-2 font-normal',
        last ? 'pr-2' : 'pr-4',
        align === 'left' ? 'text-left' : 'text-right',
        className,
      )}
    >
      <span className="group/tip relative inline-flex cursor-help">
        <span className="underline decoration-dotted decoration-border underline-offset-4">
          {children}
        </span>
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute top-full z-20 mt-2 hidden w-52 group-hover/tip:block',
            'rounded-btn border border-border bg-surface-2 p-2 shadow-lg',
            'text-left text-[11px] font-normal normal-case tracking-normal leading-snug text-text',
            align === 'left' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            align === 'right' && 'right-0',
          )}
        >
          {tip}
        </span>
      </span>
    </th>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-eyebrow uppercase text-muted">{label}</span>
      <span className="font-mono tabular-nums text-[13px]">{value}</span>
    </div>
  );
}

/** Renders a division row plus its optional expanded detail row with a stable key. */
function RowPair({ row, detail }: { row: React.ReactNode; detail: React.ReactNode }) {
  return (
    <>
      {row}
      {detail}
    </>
  );
}

function fmtProjDate(iso: string): string {
  // Noon UTC keeps the calendar date stable when formatted in UTC.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Static remainder-of-month view: one row per remaining workday with the
 * estimated daily target if production continues at the month's actual
 * pace so far. Company-wide; a morning snapshot that doesn't drift intraday.
 */
function ProjectionPanel({
  projection,
  budgetCents,
  todayIso,
  creditBacklog,
}: {
  projection: MonthProjection | null;
  budgetCents: number;
  todayIso: string;
  creditBacklog: boolean;
}) {
  if (!projection) {
    return (
      <Panel eyebrow="Remainder of month" title="Daily targets at current pace" padding="cozy">
        <p className="text-[13px] text-muted">
          No workdays have elapsed this month yet, so there&apos;s no observed pace to
          project from. This view fills in after the first working day closes.
        </p>
      </Panel>
    );
  }

  const onTrack = projection.varianceCents >= 0;
  return (
    <Panel eyebrow="Remainder of month" title="Daily targets at current pace" padding="cozy">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px]">
          <span>
            <span className="text-muted">Current pace </span>
            <span className="font-mono tabular-nums font-medium">
              {fmtMoney(projection.paceCentsPerWorkday)}/workday
            </span>
          </span>
          <span>
            <span className="text-muted">Projected finish </span>
            <span className="font-mono tabular-nums font-medium">
              {fmtMoney(projection.projectedMonthEndCents)}
            </span>
            <span className={cn('font-mono tabular-nums', onTrack ? 'text-up' : 'text-down')}>
              {' '}
              ({onTrack ? '+' : '−'}
              {fmtMoney(Math.abs(projection.varianceCents))} vs {fmtMoney(budgetCents)} budget)
            </span>
          </span>
        </div>

        {projection.days.length > 0 && (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-left">
              <thead>
                <tr className="col-head border-b border-border">
                  <th className="py-2 pr-4 font-normal text-left">Workday</th>
                  <th className="py-2 pr-4 font-normal text-right">Est. daily target</th>
                  <th className="py-2 pr-4 font-normal text-right hidden sm:table-cell">
                    Projected MTD entering day
                  </th>
                  <th className="py-2 font-normal text-right hidden md:table-cell">
                    % of budget
                  </th>
                </tr>
              </thead>
              <tbody>
                {projection.days.map((d) => {
                  const isToday = d.date === todayIso;
                  return (
                    <tr
                      key={d.date}
                      className={cn(
                        'border-b border-border/40',
                        isToday && 'bg-surface-2/25 font-medium',
                      )}
                    >
                      <td className="py-2 pr-4 text-[13px]">
                        {fmtProjDate(d.date)}
                        {isToday && <span className="text-muted text-[11px]"> · today</span>}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-[13px]">
                        {fmtMoney(d.dailyTargetCents)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden sm:table-cell">
                        {fmtMoney(d.projectedMtdCents)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-[13px] text-muted hidden md:table-cell">
                        {budgetCents > 0
                          ? `${Math.round((d.projectedMtdCents / budgetCents) * 100)}%`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[12px] text-muted leading-relaxed">
          A static morning snapshot: pace = MTD completed revenue (thru yesterday) ÷
          elapsed workdays. Each day&apos;s estimated target assumes every prior
          remaining day produces exactly that pace, so targets climb if the pace is
          under the required run rate and shrink if it&apos;s over.
          {creditBacklog
            ? ' Scheduled backlog is credited against the remaining budget, matching the view above.'
            : ' Backlog is not credited, matching the strict view above.'}{' '}
          Projected finish ignores backlog and today&apos;s partial production —
          it&apos;s purely pace × remaining workdays.
        </p>
      </div>
    </Panel>
  );
}
