'use client';

import { useState } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import { cn } from '@/lib/cn';
import type { UpcomingAppointmentsResponse } from '@/app/api/kpi/upcoming-appointments/route';

/**
 * Desktop port of the TV appointments drill-down scene (Jun 2026 handoff):
 * seven stacked-bar day rows on the left; the right panel shows week-wide
 * top job types until a day is selected, then drills to that day's counts.
 * Same interaction contract as the TV scene, at dashboard type scale.
 */

const ACCENT_BORDER = 'oklch(0.72 0.14 235 / 0.45)';
const FAINT = 'oklch(0.55 0.012 255)';

function deptColor(code: string | null): string {
  return code ? `var(--d-${code})` : 'var(--muted)';
}

function dayParts(iso: string): { dow: string; date: string; long: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  const opt = { timeZone: 'UTC' } as const;
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short', ...opt }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...opt }),
    long: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...opt }),
  };
}

function fmtRange(from: string, to: string): string {
  const f = dayParts(from);
  const t = dayParts(to);
  return `${f.date} – ${t.date}`;
}

export function AppointmentsDrilldown({ data }: { data: UpcomingAppointmentsResponse }) {
  const [selected, setSelected] = useState<number | null>(null);

  const days = data.byDay;
  const max = Math.max(...days.map((d) => d.count), 1);
  const avgPerDay = days.length > 0 ? Math.round(data.totalAppointments / days.length) : 0;

  const selDay = selected != null ? days[selected] : null;
  // A selected day shows every job type (scrollable); the week view keeps
  // the top 9 so the default panel stays compact.
  const panelRows = selDay ? selDay.topJobTypes : data.topJobTypes.slice(0, 9);
  const panelMax = Math.max(...panelRows.map((r) => r.count), 1);
  const selParts = selDay ? dayParts(selDay.date) : null;
  const panelTitle = selParts ? `Job types · ${selParts.dow} · ${selParts.date}` : 'Top job types';
  const panelSub = selDay
    ? `${selDay.count} appointments · select again to clear`
    : 'Next 7 days · select a day to drill down';

  // Legend: divisions present this week, busiest first.
  const legendMap = new Map<string, { name: string; count: number }>();
  for (const d of days) {
    for (const s of d.depts) {
      if (!s.code) continue;
      const prior = legendMap.get(s.code) ?? { name: s.name, count: 0 };
      prior.count += s.count;
      legendMap.set(s.code, prior);
    }
  }
  const legend = Array.from(legendMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      {/* Headline stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Panel padding="tight">
          <Stat label="Total this week" value={data.totalAppointments} unit="count" />
        </Panel>
        <Panel padding="tight">
          <Stat label="Today" value={data.todayCount} unit="count" />
        </Panel>
        <Panel padding="tight">
          <Stat label="Tomorrow" value={data.tomorrowCount} unit="count" />
        </Panel>
        <Panel padding="tight">
          <Stat label="Avg / day" value={avgPerDay} unit="count" />
        </Panel>
      </div>

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        {/* Left: day rows + legend */}
        <Panel
          eyebrow={`Next 7 days · ${fmtRange(data.windowStart, data.windowEnd)}`}
          title="By day"
          right={
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
              Select a day to drill down
            </span>
          }
          padding="cozy"
        >
          <div className="flex flex-col gap-1.5">
            {days.map((d, i) => {
              const { dow, date, long } = dayParts(d.date);
              const isToday = i === 0;
              const active = selected === i || (selected === null && isToday);
              const barOpacity = active ? 1 : selected === null ? 0.82 : 0.55;
              return (
                <button
                  key={d.date}
                  onClick={() => setSelected((prev) => (prev === i ? null : i))}
                  aria-pressed={selected === i}
                  className={cn(
                    'grid items-center text-left rounded-[10px] border transition-all duration-200 cursor-pointer',
                    active ? 'bg-surface-2/40' : 'border-transparent hover:bg-surface-2/25',
                  )}
                  style={{
                    gridTemplateColumns: '92px 1fr 56px',
                    gap: 16,
                    padding: '8px 12px',
                    borderColor: active ? ACCENT_BORDER : 'transparent',
                  }}
                >
                  <div className="flex flex-col leading-tight">
                    <span
                      className={cn('text-[15px] font-semibold', active && 'text-accent')}
                    >
                      {isToday ? 'Today' : dow}
                    </span>
                    <span className="text-[11px] text-muted">{isToday ? long : date}</span>
                  </div>
                  <div className="h-6 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full flex rounded-full overflow-hidden transition-opacity duration-200"
                      style={{ width: `${(d.count / max) * 100}%`, opacity: barOpacity }}
                    >
                      {d.depts.map((s) => (
                        <div
                          key={s.code ?? s.name}
                          className="h-full"
                          title={`${s.name}: ${s.count}`}
                          style={{
                            width: d.count > 0 ? `${(s.count / d.count) * 100}%` : 0,
                            background: deptColor(s.code),
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-[18px] font-mono tabular-nums font-semibold text-right',
                      !active && 'text-muted',
                    )}
                  >
                    {d.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-4 px-3">
            {legend.map(([code, l]) => (
              <div key={code} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-[3px] shrink-0"
                  style={{ background: deptColor(code) }}
                  aria-hidden
                />
                <span className="text-[12px] text-muted">{l.name}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Right: drill-down panel */}
        <Panel padding="cozy" className="h-fit">
          <div className="flex flex-col gap-1 mb-5">
            <span className="text-eyebrow uppercase tracking-[0.12em] text-muted">
              {panelTitle}
            </span>
            <span className="text-[12px]" style={{ color: FAINT }}>
              {panelSub}
            </span>
          </div>
          <div
            className="flex flex-col gap-3 overflow-y-auto pr-1"
            style={{ height: 288 }}
          >
            {panelRows.map((r) => (
              <div
                key={r.name}
                className="grid items-center"
                style={{ gridTemplateColumns: 'minmax(0,1fr) 88px 40px', gap: 12 }}
              >
                <span className="text-[13px] truncate">{r.name}</span>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${(r.count / panelMax) * 100}%`,
                      background: deptColor(r.dept),
                    }}
                  />
                </div>
                <span className="text-[14px] font-mono tabular-nums text-right">{r.count}</span>
              </div>
            ))}
            {panelRows.length === 0 && (
              <span className="text-[13px] text-muted">Nothing scheduled.</span>
            )}
          </div>
        </Panel>
      </div>

      {/* Per-department breakdown — kept from the previous layout for the
          deeper BU/job-type digging the drill-down doesn't cover. */}
      <Panel
        eyebrow="Breakdown"
        title="By department & job type"
        right={
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted font-mono tabular-nums">
            {data.groups.length} depts
          </span>
        }
        padding="cozy"
      >
        {data.groups.length === 0 && (
          <div className="text-[13px] text-muted">Nothing scheduled in the next week.</div>
        )}
        <div className="flex flex-col">
          {data.groups.map((g) => (
            <div
              key={g.departmentCode ?? g.departmentName ?? 'u'}
              className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border/40"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: deptColor(g.departmentCode) }}
                    aria-hidden
                  />
                  <span className="text-[14px] font-medium">
                    {g.departmentName ?? 'Uncategorized'}
                  </span>
                </div>
                <span className="text-[13px] font-mono tabular-nums text-muted">{g.total}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pl-4 border-l border-border/60">
                {g.jobTypes.map((t) => (
                  <div key={t.name} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted truncate pr-3">{t.name}</span>
                    <span className="font-mono tabular-nums">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
