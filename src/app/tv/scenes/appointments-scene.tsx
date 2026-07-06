'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import type { ApiEnvelope } from '@/lib/types/kpi';
import type { UpcomingAppointmentsResponse } from '@/app/api/kpi/upcoming-appointments/route';
import { TvHeader } from './tv-header';

/**
 * Appointments TV scene — drill-down redesign (design handoff, Jun 2026).
 * Default state: 7 horizontal stacked day bars + week-wide top job types in
 * the side panel. Selecting a day drills the panel to that day's job-type
 * counts; selecting it again clears. Selection resets when the rotator
 * remounts the scene, so kiosk TVs always show the default state.
 *
 * Pixel values follow the 1920×1080 handoff spec; colors come from the
 * repo's Direction A tokens (which match the spec's oklch values) and the
 * per-division `--d-*` palette.
 */

// Spec shades with no existing token.
const SECONDARY = 'oklch(0.88 0.005 255)';
const FAINT = 'oklch(0.55 0.012 255)';
const ACCENT_BORDER = 'oklch(0.72 0.14 235 / 0.45)';

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

export function AppointmentsScene() {
  const { data } = useQuery<UpcomingAppointmentsResponse>({
    queryKey: ['tv-upcoming'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/upcoming-appointments');
      if (!res.ok) throw new Error(`upcoming: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<UpcomingAppointmentsResponse>;
      return json.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const [selected, setSelected] = useState<number | null>(null);

  if (!data) return <TvHeader eyebrow="Upcoming" title="Loading…" />;

  const days = data.byDay;
  const max = Math.max(...days.map((d) => d.count), 1);
  const selDay = selected != null ? days[selected] : null;

  // Panel rows: week-wide top types, or the selected day's. Bars scale to
  // the max within the displayed list and color by the type's division.
  const panelRows = (selDay ? selDay.topJobTypes : data.topJobTypes).slice(0, 9);
  const panelMax = Math.max(...panelRows.map((r) => r.count), 1);
  const selParts = selDay ? dayParts(selDay.date) : null;
  const panelTitle = selParts
    ? `Job types · ${selParts.dow} · ${selParts.date}`
    : 'Top job types';
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
    // TvScene pads 48/40; top up to the spec's 64px top / 80px sides / 56px bottom.
    <div className="flex flex-col h-full" style={{ padding: '24px 32px 16px' }}>
      <header className="flex justify-between items-end" style={{ marginBottom: 44 }}>
        <div className="flex flex-col" style={{ gap: 10 }}>
          <span
            className="uppercase text-muted"
            style={{ fontSize: 20, letterSpacing: '0.14em', fontWeight: 500 }}
          >
            Upcoming · Next 7 days
          </span>
          <span style={{ fontSize: 56, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>
            Appointments
          </span>
        </div>
        <div className="flex" style={{ gap: 56 }}>
          <div className="flex flex-col items-end" style={{ gap: 6 }}>
            <span className="uppercase text-muted" style={{ fontSize: 17, letterSpacing: '0.1em' }}>
              Today
            </span>
            <span
              className="font-mono tabular-nums text-accent"
              style={{ fontSize: 52, fontWeight: 600, lineHeight: 1 }}
            >
              {data.todayCount}
            </span>
          </div>
          <div className="flex flex-col items-end" style={{ gap: 6 }}>
            <span className="uppercase text-muted" style={{ fontSize: 17, letterSpacing: '0.1em' }}>
              7-day total
            </span>
            <span className="font-mono tabular-nums" style={{ fontSize: 52, fontWeight: 600, lineHeight: 1 }}>
              {data.totalAppointments}
            </span>
          </div>
        </div>
      </header>

      <div
        className="flex-1 grid min-h-0"
        style={{ gridTemplateColumns: '2.2fr 1fr', gap: 56 }}
      >
        {/* Left: day rows + legend */}
        <div className="flex flex-col justify-between min-h-0">
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
                  'grid items-center text-left transition-all duration-200 cursor-pointer border',
                  active ? 'bg-surface' : 'bg-transparent border-transparent hover:bg-surface',
                )}
                style={{
                  gridTemplateColumns: '150px 1fr 90px',
                  gap: 28,
                  padding: '12px 18px',
                  borderRadius: 14,
                  borderColor: active ? ACCENT_BORDER : 'transparent',
                }}
              >
                <div className="flex flex-col" style={{ lineHeight: 1.2 }}>
                  <span
                    className={active ? 'text-accent' : undefined}
                    style={{ fontSize: 28, fontWeight: 600 }}
                  >
                    {isToday ? 'Today' : dow}
                  </span>
                  <span className="text-muted" style={{ fontSize: 17 }}>
                    {isToday ? long : date}
                  </span>
                </div>
                <div
                  className="overflow-hidden bg-surface-2"
                  style={{ height: 38, borderRadius: 999 }}
                >
                  <div
                    className="h-full flex overflow-hidden transition-opacity duration-200"
                    style={{
                      width: `${(d.count / max) * 100}%`,
                      borderRadius: 999,
                      opacity: barOpacity,
                    }}
                  >
                    {d.depts.map((s) => (
                      <div
                        key={s.code ?? s.name}
                        className="h-full"
                        style={{
                          width: d.count > 0 ? `${(s.count / d.count) * 100}%` : 0,
                          background: deptColor(s.code),
                        }}
                      />
                    ))}
                  </div>
                </div>
                <span
                  className="font-mono tabular-nums text-right"
                  style={{
                    fontSize: 38,
                    fontWeight: 600,
                    color: active ? 'var(--text)' : SECONDARY,
                  }}
                >
                  {d.count}
                </span>
              </button>
            );
          })}

          <div className="flex" style={{ gap: 32, padding: '8px 18px 0' }}>
            {legend.map(([code, l]) => (
              <div key={code} className="flex items-center" style={{ gap: 10 }}>
                <span
                  style={{ width: 16, height: 16, borderRadius: 5, background: deptColor(code) }}
                />
                <span className="text-muted" style={{ fontSize: 18 }}>
                  {l.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: drill-down panel */}
        <div
          className="bg-surface border border-border flex flex-col"
          style={{ borderRadius: 18, padding: 36, gap: 26 }}
        >
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span
              className="uppercase text-muted"
              style={{ fontSize: 18, letterSpacing: '0.12em', fontWeight: 500 }}
            >
              {panelTitle}
            </span>
            <span style={{ fontSize: 17, color: FAINT }}>{panelSub}</span>
          </div>
          <div className="flex-1 flex flex-col min-h-0" style={{ gap: 24 }}>
            {panelRows.map((r) => (
              <div
                key={r.name}
                className="grid items-center"
                style={{ gridTemplateColumns: '1fr 110px 56px', gap: 20 }}
              >
                <span className="truncate" style={{ fontSize: 22 }}>
                  {r.name}
                </span>
                <div
                  className="overflow-hidden bg-surface-2"
                  style={{ height: 8, borderRadius: 999 }}
                >
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{
                      width: `${(r.count / panelMax) * 100}%`,
                      borderRadius: 999,
                      background: deptColor(r.dept),
                    }}
                  />
                </div>
                <span className="font-mono tabular-nums text-right" style={{ fontSize: 24 }}>
                  {r.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
