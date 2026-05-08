'use client';

import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import type { UpcomingAppointmentsResponse } from '@/app/api/kpi/upcoming-appointments/route';

export interface UpcomingAppointmentsPanelProps {
  data: UpcomingAppointmentsResponse;
}

function fmtRange(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function dayLabel(isoDate: string): { dow: string; day: string } {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}

export function UpcomingAppointmentsPanel({ data }: UpcomingAppointmentsPanelProps) {
  const maxDay = Math.max(...data.byDay.map((d) => d.count), 1);
  const avgPerDay = data.byDay.length > 0 ? Math.round(data.totalAppointments / data.byDay.length) : 0;

  // Build a map jobType → its dept (code/name) from the lower panel's
  // grouping. Used to organize each day's expandable job-type list by
  // department so it mirrors the "By department & job type" section.
  const typeToDept = new Map<string, { code: string | null; name: string | null }>();
  for (const g of data.groups) {
    for (const t of g.jobTypes) {
      // Last-write-wins is fine; ST job-type names are effectively unique
      // across depts in this tenant. If a dupe ever shows up, the lower
      // panel will reveal both anyway.
      typeToDept.set(t.name, { code: g.departmentCode, name: g.departmentName });
    }
  }
  const deptOrder = data.groups.map((g) => g.departmentName ?? 'Uncategorized');

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

      {/* Daily distribution — stacked by department */}
      <Panel
        eyebrow={`Next 7 days · ${fmtRange(data.windowStart, data.windowEnd)}`}
        title="By day"
        right={
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
            Segments by dept · hover for count
          </span>
        }
        padding="cozy"
      >
        <div className="flex flex-col gap-3">
          {data.byDay.map((d, i) => {
            const { dow, day } = dayLabel(d.date);
            const pct = (d.count / maxDay) * 100;
            const isToday = i === 0;
            const segments = d.depts;
            return (
              <div
                key={d.date}
                className="grid items-start gap-3"
                style={{ gridTemplateColumns: '70px 1fr 40px' }}
              >
                <div className="flex flex-col leading-tight pt-1">
                  <span className={`text-[12px] font-medium ${isToday ? 'text-accent' : ''}`}>
                    {isToday ? 'Today' : dow}
                  </span>
                  <span className="text-[10px] text-muted">{day}</span>
                </div>
                <div className="flex flex-col gap-1.5 pt-1">
                  <div
                    className="flex h-3 bg-surface-2 rounded-full overflow-hidden"
                    style={{ width: `${pct}%` }}
                  >
                    {segments.map((s) => {
                      const segPct = d.count > 0 ? (s.count / d.count) * 100 : 0;
                      const color = s.code ? `var(--d-${s.code})` : 'var(--muted)';
                      return (
                        <div
                          key={s.code ?? s.name}
                          className="h-full transition-[width] duration-300 ease-out"
                          style={{
                            width: `${segPct}%`,
                            background: color,
                            opacity: isToday ? 1 : 0.75,
                          }}
                          title={`${s.name}: ${s.count}`}
                        />
                      );
                    })}
                  </div>
                  {segments.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
                      {segments.slice(0, 6).map((s) => {
                        const color = s.code ? `var(--d-${s.code})` : 'var(--muted)';
                        return (
                          <span key={s.code ?? s.name} className="flex items-center gap-1">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: color }}
                              aria-hidden
                            />
                            <span>{s.name}</span>
                            <span className="font-mono tabular-nums">{s.count}</span>
                          </span>
                        );
                      })}
                      {segments.length > 6 && (
                        <span className="text-muted/60">+{segments.length - 6} more</span>
                      )}
                    </div>
                  )}
                  {d.topJobTypes.length > 0 && (() => {
                    // Re-group this day's flat topJobTypes list by dept,
                    // matching the "By department & job type" section.
                    type DeptBucket = {
                      code: string | null;
                      name: string;
                      types: Array<{ name: string; count: number }>;
                      total: number;
                    };
                    const byDept = new Map<string, DeptBucket>();
                    for (const t of d.topJobTypes) {
                      const dept = typeToDept.get(t.name) ?? { code: null, name: 'Other' };
                      const key = dept.name ?? 'Uncategorized';
                      const bucket = byDept.get(key) ?? {
                        code: dept.code,
                        name: key,
                        types: [],
                        total: 0,
                      };
                      bucket.types.push(t);
                      bucket.total += t.count;
                      byDept.set(key, bucket);
                    }
                    // Order depts the same way the lower panel does.
                    const orderedDepts = [
                      ...deptOrder.filter((n) => byDept.has(n)).map((n) => byDept.get(n)!),
                      ...Array.from(byDept.values()).filter(
                        (b) => !deptOrder.includes(b.name),
                      ),
                    ];
                    return (
                      <details className="group mt-1">
                        <summary className="cursor-pointer text-[11px] text-muted hover:text-foreground list-none flex items-center gap-1.5">
                          <span className="transition-transform group-open:rotate-90" aria-hidden>
                            ›
                          </span>
                          <span>
                            {d.topJobTypes.length} job type{d.topJobTypes.length === 1 ? '' : 's'} ·{' '}
                            {orderedDepts.length} dept{orderedDepts.length === 1 ? '' : 's'}
                          </span>
                        </summary>
                        <div className="mt-1.5 flex flex-col gap-2 pl-3 border-l border-border/60">
                          {orderedDepts.map((bucket) => {
                            const color = bucket.code ? `var(--d-${bucket.code})` : 'var(--muted)';
                            return (
                              <div key={bucket.name} className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className="h-1.5 w-1.5 rounded-full shrink-0"
                                      style={{ background: color }}
                                      aria-hidden
                                    />
                                    <span className="font-medium">{bucket.name}</span>
                                  </span>
                                  <span className="font-mono tabular-nums text-muted">
                                    {bucket.total}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 pl-3.5">
                                  {bucket.types
                                    .sort((a, b) => b.count - a.count)
                                    .map((t) => (
                                      <div
                                        key={t.name}
                                        className="flex items-center justify-between text-[11px]"
                                      >
                                        <span className="text-muted truncate pr-2">{t.name}</span>
                                        <span className="font-mono tabular-nums">{t.count}</span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })()}
                </div>
                <span className="text-[13px] font-mono tabular-nums text-right pt-1">
                  {d.count}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Per-department breakdown */}
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
          <div className="text-[13px] text-muted">
            Nothing scheduled in the next week.
          </div>
        )}
        <div className="flex flex-col">
          {data.groups.map((g) => {
            const color = g.departmentCode
              ? `var(--d-${g.departmentCode})`
              : 'var(--muted)';
            return (
              <div
                key={g.departmentCode ?? g.departmentName ?? 'u'}
                className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border/40"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: color }}
                      aria-hidden
                    />
                    <span className="text-[14px] font-medium">
                      {g.departmentName ?? 'Uncategorized'}
                    </span>
                  </div>
                  <span className="text-[13px] font-mono tabular-nums text-muted">
                    {g.total}
                  </span>
                </div>
                <div className="flex flex-col gap-1 pl-4 border-l border-border/60">
                  {g.jobTypes.map((t) => (
                    <div
                      key={t.name}
                      className="flex items-center justify-between text-[12px]"
                    >
                      <span className="text-muted truncate pr-3">{t.name}</span>
                      <span className="font-mono tabular-nums">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Top job types across all depts */}
      {data.topJobTypes.length > 0 && (
        <Panel
          eyebrow="Overall"
          title="Top job types this week"
          padding="cozy"
        >
          <div className="flex flex-col gap-2">
            {data.topJobTypes.map((t) => {
              const max = data.topJobTypes[0]?.count || 1;
              const pct = (t.count / max) * 100;
              return (
                <div
                  key={t.name}
                  className="grid items-center gap-3"
                  style={{ gridTemplateColumns: 'minmax(0, 1fr) 100px 40px' }}
                >
                  <span className="text-[13px] truncate">{t.name}</span>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent/70 transition-[width] duration-300 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-mono tabular-nums text-right">
                    {t.count}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
