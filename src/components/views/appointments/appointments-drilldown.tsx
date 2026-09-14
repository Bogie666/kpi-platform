'use client';

import { useMemo, useState } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import { cn } from '@/lib/cn';
import {
  SOURCE_CLASSES,
  SOURCE_CLASS_COLOR,
  SOURCE_CLASS_LABEL,
  type SourceClass,
} from '@/lib/kpi/source-class';
import { AppointmentFilters, type DeptSlice } from './appointment-filters';
import type {
  CapacitySlice,
  UpcomingAppointmentsResponse,
} from '@/app/api/kpi/upcoming-appointments/route';

/**
 * Appointments drill-down — three filters that compose: source class
 * (demand / maintenance / install), department, and day. Each is optional,
 * so the same controls answer "how much demand work this week", "Plumbing's
 * maintenance on Thursday", or anything between.
 *
 * Everything is counted from `byDay[].byBu`, whose job-type rows carry both
 * the true division and the source class. Counting from one place means the
 * tiles, the filter cards, the day bars and the job-type list can never
 * disagree about what the current slice contains.
 */

const ACCENT_BORDER = 'oklch(0.72 0.14 235 / 0.45)';
const FAINT = 'oklch(0.55 0.012 255)';
/** Sentinel key for appointments whose BU maps to no division. */
const UNCATEGORIZED = '__uncategorized__';

type Day = UpcomingAppointmentsResponse['byDay'][number];

function deptKey(code: string | null): string {
  return code ?? UNCATEGORIZED;
}

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
  return `${dayParts(from).date} – ${dayParts(to).date}`;
}

/**
 * The one counting primitive: appointments on `day` matching an optional
 * department and an optional source class. `null` means "don't filter on
 * this axis".
 */
function countIn(day: Day, dept: string | null, cls: SourceClass | null): number {
  let n = 0;
  for (const bu of day.byBu ?? []) {
    if (dept !== null && deptKey(bu.departmentCode) !== dept) continue;
    if (cls === null) {
      n += bu.total;
      continue;
    }
    for (const t of bu.jobTypes) if (t.cls === cls) n += t.count;
  }
  return n;
}

function sumDays(days: Day[], dept: string | null, cls: SourceClass | null): number {
  return days.reduce((s, d) => s + countIn(d, dept, cls), 0);
}

/**
 * Open capacity on `day` under the same department/class filters, or null
 * when the day has no capacity data. A department the capacity board doesn't
 * cover reads as zero open rather than null — the board is known, it just
 * has nothing free there.
 */
function capacityFor(day: Day, dept: string | null, cls: SourceClass | null): CapacitySlice | null {
  const cap = day.capacity;
  if (!cap) return null;
  const scope = dept === null ? cap : cap.byDept.find((d) => d.code === dept);
  if (!scope) return { openHours: 0, bookable: 0 };
  return cls === null ? { openHours: scope.openHours, bookable: scope.bookable } : scope.byClass[cls];
}

/** Total open hours and bookable jobs across `days` under the filters. */
function sumCapacity(
  days: Day[],
  dept: string | null,
  cls: SourceClass | null,
): CapacitySlice | null {
  let seen = false;
  const out = { openHours: 0, bookable: 0 };
  for (const d of days) {
    const c = capacityFor(d, dept, cls);
    if (!c) continue;
    seen = true;
    out.openHours += c.openHours;
    out.bookable += c.bookable;
  }
  return seen ? out : null;
}

export function AppointmentsDrilldown({ data }: { data: UpcomingAppointmentsResponse }) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<SourceClass | null>(null);

  const days = data.byDay;
  const scopeDays = selectedDay != null ? days.slice(selectedDay, selectedDay + 1) : days;

  // Division display names, keyed the same way byBu rows are. byBu carries
  // the business-unit name, not the division's, so the labels come from the
  // per-day dept segments.
  const deptNames = useMemo(() => {
    const m = new Map<string, { code: string | null; name: string }>();
    for (const d of days) {
      for (const s of d.depts) m.set(deptKey(s.code), { code: s.code, name: s.name });
    }
    return m;
  }, [days]);

  // Each filter row counts within the other's selection, so the two rows
  // always describe the same slice.
  const deptSlices = useMemo<DeptSlice[]>(() => {
    const out: DeptSlice[] = [];
    for (const [key, meta] of deptNames) {
      const total = sumDays(scopeDays, key, selectedClass);
      const open = sumCapacity(scopeDays, key, selectedClass)?.bookable ?? 0;
      if (total > 0 || open > 0) {
        out.push({ key, code: meta.code, name: meta.name, total });
      }
    }
    return out.sort((a, b) => b.total - a.total);
  }, [deptNames, scopeDays, selectedClass]);

  const classCounts = useMemo(() => {
    const out = { demand: 0, maintenance: 0, install: 0 } as Record<SourceClass, number>;
    for (const cls of SOURCE_CLASSES) out[cls] = sumDays(scopeDays, selectedDept, cls);
    return out;
  }, [scopeDays, selectedDept]);

  const activeDept = deptNames.get(selectedDept ?? '') ?? null;

  // Denominators: each row's "All" card is the total under the *other*
  // filter, so its share bars add up to 100%.
  const classScopeTotal = sumDays(scopeDays, selectedDept, null);
  const deptScopeTotal = sumDays(scopeDays, null, selectedClass);
  const scopedTotal = sumDays(scopeDays, selectedDept, selectedClass);
  const weekTotal = sumDays(days, null, null);

  // Job types under all active filters.
  const jobTypeRows = useMemo(() => {
    const m = new Map<string, { count: number; cls: SourceClass; dept: string | null }>();
    for (const d of scopeDays) {
      for (const bu of d.byBu ?? []) {
        if (selectedDept !== null && deptKey(bu.departmentCode) !== selectedDept) continue;
        for (const t of bu.jobTypes) {
          if (selectedClass !== null && t.cls !== selectedClass) continue;
          const prior = m.get(t.name) ?? { count: 0, cls: t.cls, dept: bu.departmentCode };
          prior.count += t.count;
          m.set(t.name, prior);
        }
      }
    }
    const rows = Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);
    // The wide-open week view stays a top-N summary; any narrower scope is
    // short enough to show whole.
    const unfiltered = selectedDept === null && selectedDay === null && selectedClass === null;
    return unfiltered ? rows.slice(0, 9) : rows;
  }, [scopeDays, selectedDept, selectedDay, selectedClass]);

  // Business units inside the selected division (LEX vs LYONS Maintenance).
  const buRows = useMemo(() => {
    if (selectedDept === null) return [];
    const m = new Map<string, number>();
    for (const d of scopeDays) {
      for (const bu of d.byBu ?? []) {
        if (deptKey(bu.departmentCode) !== selectedDept) continue;
        const n =
          selectedClass === null
            ? bu.total
            : bu.jobTypes.reduce((s, t) => (t.cls === selectedClass ? s + t.count : s), 0);
        if (n > 0) m.set(bu.name, (m.get(bu.name) ?? 0) + n);
      }
    }
    return Array.from(m.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [scopeDays, selectedDept, selectedClass]);

  const dayCounts = days.map((d) => countIn(d, selectedDept, selectedClass));
  const dayOpen = days.map((d) => capacityFor(d, selectedDept, selectedClass));
  const scopeCapacity = sumCapacity(scopeDays, selectedDept, selectedClass);
  const showCapacity = data.capacityAvailable && scopeCapacity != null;
  const capacityCoverage =
    selectedDay == null
      ? `${data.capacityDaysAvailable}/${data.capacityDaysExpected} days`
      : '1/1 day';
  // Bars scale to booked-plus-open so the open segment is a true extension
  // of the booked one; without capacity they scale to booked alone.
  const max = Math.max(
    ...days.map((d, i) => dayCounts[i] + (showCapacity ? (dayOpen[i]?.bookable ?? 0) : 0)),
    1,
  );
  const avgPerDay = scopeDays.length > 0 ? Math.round(scopedTotal / scopeDays.length) : 0;

  const selDay = selectedDay != null ? days[selectedDay] : null;
  const selParts = selDay ? dayParts(selDay.date) : null;
  const panelMax = Math.max(...jobTypeRows.map((r) => r.count), 1);

  const deptLabel = activeDept?.name ?? 'All departments';
  const classLabel = selectedClass ? SOURCE_CLASS_LABEL[selectedClass] : 'All work';
  const scopeLabel = selParts ? `${selParts.dow} ${selParts.date}` : 'Next 7 days';
  const filterLabel = [classLabel, deptLabel].join(' · ');

  return (
    <div className="flex flex-col gap-6">
      {/* Headline stats — every tile follows the active filters. */}
      <div
        className={cn(
          'grid gap-4 grid-cols-2',
          showCapacity ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
        )}
      >
        <Panel padding="tight">
          <Stat
            label="This week"
            value={sumDays(days, selectedDept, selectedClass)}
            unit="count"
            sub={
              selectedDept || selectedClass
                ? `${filterLabel} · of ${weekTotal} total`
                : 'All departments'
            }
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Today"
            value={days.length > 0 ? countIn(days[0], selectedDept, selectedClass) : 0}
            unit="count"
          />
        </Panel>
        <Panel padding="tight">
          <Stat
            label="Tomorrow"
            value={days.length > 1 ? countIn(days[1], selectedDept, selectedClass) : 0}
            unit="count"
          />
        </Panel>
        <Panel padding="tight">
          <Stat label="Avg / day" value={avgPerDay} unit="count" />
        </Panel>
        {showCapacity && scopeCapacity && (
          <Panel padding="tight">
            <Stat
              label="Open to book"
              value={scopeCapacity.bookable}
              unit="count"
              sub={
                <span
                  title="Unbooked tech-hours left on the dispatch board, divided by a typical call length for each crew (maintenance runs are shorter than demand calls). An estimate for planning, not a promise."
                >
                  ~{scopeCapacity.openHours.toFixed(1)}h open · {capacityCoverage} · est. jobs
                </span>
              }
            />
          </Panel>
        )}
      </div>

      <Panel
        eyebrow="Filter"
        title="Work type & department"
        right={
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted font-mono tabular-nums">
            {scopeLabel}
          </span>
        }
        padding="cozy"
      >
        {weekTotal === 0 && !data.capacityAvailable ? (
          <div className="text-[13px] text-muted">Nothing scheduled in the next week.</div>
        ) : (
          <AppointmentFilters
            depts={deptSlices}
            classCounts={classCounts}
            classScopeTotal={classScopeTotal}
            deptScopeTotal={deptScopeTotal}
            selectedClass={selectedClass}
            selectedDept={selectedDept}
            onSelectClass={setSelectedClass}
            onSelectDept={setSelectedDept}
          />
        )}
      </Panel>

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        {/* Left: day rows */}
        <Panel
          eyebrow={`Next 7 days · ${fmtRange(data.windowStart, data.windowEnd)}`}
          title={selectedDept || selectedClass ? `By day · ${filterLabel}` : 'By day'}
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
              const active = selectedDay === i || (selectedDay === null && isToday);
              const barOpacity = active ? 1 : selectedDay === null ? 0.82 : 0.55;
              const count = dayCounts[i];
              const open = dayOpen[i];
              // Segments follow whichever axis is still free. A picked
              // class or department pins the colour, so the bar goes solid;
              // with neither picked the bar splits by class, which is the
              // comparison the page exists to make.
              const segments: Array<{ key: string; count: number; color: string; label: string }> =
                selectedClass !== null
                  ? [
                      {
                        key: selectedClass,
                        count,
                        color: SOURCE_CLASS_COLOR[selectedClass],
                        label: SOURCE_CLASS_LABEL[selectedClass],
                      },
                    ]
                  : activeDept
                    ? [
                        {
                          key: deptKey(activeDept.code),
                          count,
                          color: deptColor(activeDept.code),
                          label: activeDept.name,
                        },
                      ]
                    : // Nothing picked: split the bar demand vs maintenance vs
                      // install, so the mix reads without touching a filter.
                      SOURCE_CLASSES.map((cls) => ({
                        key: cls,
                        count: countIn(d, null, cls),
                        color: SOURCE_CLASS_COLOR[cls],
                        label: SOURCE_CLASS_LABEL[cls],
                      })).filter((s) => s.count > 0);
              return (
                <button
                  key={d.date}
                  onClick={() => setSelectedDay((prev) => (prev === i ? null : i))}
                  aria-pressed={selectedDay === i}
                  className={cn(
                    'grid items-center text-left rounded-[10px] border transition-all duration-200 cursor-pointer',
                    active ? 'bg-surface-2/40' : 'border-transparent hover:bg-surface-2/25',
                  )}
                  style={{
                    gridTemplateColumns: '92px 1fr 78px',
                    gap: 16,
                    padding: '8px 12px',
                    borderColor: active ? ACCENT_BORDER : 'transparent',
                  }}
                >
                  <div className="flex flex-col leading-tight">
                    <span className={cn('text-[15px] font-semibold', active && 'text-accent')}>
                      {isToday ? 'Today' : dow}
                    </span>
                    <span className="text-[11px] text-muted">{isToday ? long : date}</span>
                  </div>
                  <div className="h-6 bg-surface-2 rounded-full overflow-hidden flex">
                    <div
                      className="h-full flex overflow-hidden transition-[width,opacity] duration-200"
                      style={{ width: `${(count / max) * 100}%`, opacity: barOpacity }}
                    >
                      {segments.map((s) => (
                        <div
                          key={s.key}
                          className="h-full"
                          title={`${s.label}: ${s.count}`}
                          style={{
                            width: count > 0 ? `${(s.count / count) * 100}%` : 0,
                            background: s.color,
                          }}
                        />
                      ))}
                    </div>
                    {showCapacity && open != null && open.bookable > 0 && (
                      <div
                        className="h-full transition-[width] duration-200"
                        title={`Open capacity: ~${open.bookable} more job${
                          open.bookable === 1 ? '' : 's'
                        } (${open.openHours.toFixed(1)}h)`}
                        style={{
                          width: `${(open.bookable / max) * 100}%`,
                          opacity: barOpacity,
                          // Hatched rather than solid: this is room on the
                          // board, not work that exists.
                          backgroundImage:
                            'repeating-linear-gradient(135deg, var(--border) 0 3px, transparent 3px 7px)',
                          backgroundColor: 'color-mix(in oklch, var(--surface-2) 60%, transparent)',
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-col items-end leading-tight">
                    <span
                      className={cn(
                        'text-[18px] font-mono tabular-nums font-semibold',
                        !active && 'text-muted',
                      )}
                      title={
                        selectedDept || selectedClass
                          ? `${count} of ${d.count} scheduled this day`
                          : `${count} scheduled`
                      }
                    >
                      {count}
                    </span>
                    {showCapacity && open != null ? (
                      <span
                        className="text-[11px] font-mono tabular-nums text-muted"
                        title={`${open.openHours.toFixed(1)}h unbooked on this day's board`}
                      >
                        {open.bookable > 0 ? `+${open.bookable} open` : 'full'}
                      </span>
                    ) : (
                      (selectedDept || selectedClass) && (
                        <span className="text-[11px] font-mono tabular-nums text-muted">
                          of {d.count}
                        </span>
                      )
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Class swatches only while the bars are class-split; the capacity
              hatch needs explaining whenever it's on screen. */}
          {(showCapacity || (selectedClass === null && !activeDept)) && (
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-4 px-3">
              {selectedClass === null &&
                !activeDept &&
                SOURCE_CLASSES.map((cls) => (
                  <div key={cls} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-[3px] shrink-0"
                      style={{ background: SOURCE_CLASS_COLOR[cls] }}
                      aria-hidden
                    />
                    <span className="text-[12px] text-muted">{SOURCE_CLASS_LABEL[cls]}</span>
                  </div>
                ))}
              {showCapacity && (
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px] shrink-0 border border-border"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(135deg, var(--border) 0 2px, transparent 2px 4px)',
                    }}
                    aria-hidden
                  />
                  <span className="text-[12px] text-muted">
                    Open capacity — est. jobs that still fit
                  </span>
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* Right: job types, then the BU split when a department is selected */}
        <div className="flex flex-col gap-6">
          <Panel padding="cozy" className="h-fit">
            <div className="flex flex-col gap-1 mb-5">
              <span className="text-eyebrow uppercase tracking-[0.12em] text-muted">
                Job types · {filterLabel}
              </span>
              <span className="text-[12px]" style={{ color: FAINT }}>
                {scopeLabel} · {scopedTotal} appointment{scopedTotal === 1 ? '' : 's'} ·{' '}
                {selDay ? 'select the day again to clear' : 'select a day to narrow'}
              </span>
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: 288 }}>
              {jobTypeRows.map((r) => (
                <div
                  key={r.name}
                  className="grid items-center"
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 88px 40px', gap: 12 }}
                >
                  <span
                    className="text-[13px] truncate"
                    title={`${r.name} — ${SOURCE_CLASS_LABEL[r.cls]}`}
                  >
                    {r.name}
                  </span>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${(r.count / panelMax) * 100}%`,
                        // Coloured by class here, not division: with a
                        // department already picked the division colour would
                        // be a constant, while the class still varies.
                        background: SOURCE_CLASS_COLOR[r.cls],
                      }}
                    />
                  </div>
                  <span className="text-[14px] font-mono tabular-nums text-right">{r.count}</span>
                </div>
              ))}
              {jobTypeRows.length === 0 && (
                <span className="text-[13px] text-muted">Nothing scheduled.</span>
              )}
            </div>
          </Panel>

          {/* Only worth its space when the division actually splits. */}
          {buRows.length > 1 && (
            <Panel padding="cozy" className="h-fit">
              <div className="flex flex-col gap-1 mb-4">
                <span className="text-eyebrow uppercase tracking-[0.12em] text-muted">
                  Business units
                </span>
                <span className="text-[12px]" style={{ color: FAINT }}>
                  {filterLabel} · {scopeLabel}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {buRows.map((b) => (
                  <div key={b.name} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0 opacity-70"
                        style={{ background: deptColor(activeDept?.code ?? null) }}
                        aria-hidden
                      />
                      <span className="text-[13px] truncate" title={b.name}>
                        {b.name}
                      </span>
                    </div>
                    <span className="text-[13px] font-mono tabular-nums">{b.total}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
