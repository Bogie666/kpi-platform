'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, GitCompareArrows, ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Sparkline } from '@/components/charts/sparkline';
import { fmtMoney } from '@/lib/format/money';
import { linearScale, niceTicks } from '@/lib/charts/scale';
import type { Technician } from '@/lib/types/kpi';
import {
  compareTechs,
  fmtMetric,
  metricsFor,
  momentum,
  percentileLabel,
  type MetricUnit,
} from '@/lib/insights/tech-momentum';

type Layout = 'spotlight' | 'scorecard' | 'split';

const LAYOUTS: Array<{ id: Layout; label: string }> = [
  { id: 'spotlight', label: 'Spotlight' },
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'split', label: 'Split' },
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Head-to-head uses two fixed, always-distinct colors so the two techs read
// apart even when they share a department (and thus a --d-* color).
const A_COMPARE = 'var(--accent)';
const B_COMPARE = 'oklch(0.70 0.16 300)';

export interface TechStatsModalProps {
  tech: Technician;
  compareWith: Technician | null;
  peers: Technician[];
  isCA: boolean;
  onPickCompare: (t: Technician | null) => void;
  onClose: () => void;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function deptLabel(code: string): string {
  return code.replace(/_/g, ' ');
}

function monthAbbr(key?: string): string {
  if (!key) return '';
  const m = Number(key.slice(5, 7)) - 1;
  return MONTH_ABBR[m] ?? '';
}

/** Trailing-12-month revenue from the chart series, falling back to the
 *  period revenue when no monthly history exists. Keeps the headline number
 *  consistent with the trend line above it. */
function revTrailing(tech: Technician): { value: number; prev?: number; trailing: boolean } {
  const sum = (a?: number[]) => (a && a.length ? a.reduce((s, v) => s + v, 0) : undefined);
  const t12 = sum(tech.spark);
  if (t12 === undefined) return { value: tech.revenue, prev: tech.ly, trailing: false };
  return { value: t12, prev: sum(tech.lySpark), trailing: true };
}

export function TechStatsModal({
  tech,
  compareWith,
  peers,
  isCA,
  onPickCompare,
  onClose,
}: TechStatsModalProps) {
  const [layout, setLayout] = useState<Layout>('spotlight');
  const [picking, setPicking] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const comparing = !!compareWith && !picking;

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') trapFocus(e);
    };
    const trapFocus = (e: KeyboardEvent) => {
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [onClose]);

  const maxWidth = layout === 'split' && !comparing ? 880 : comparing ? 760 : 620;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${tech.name} stats`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[color-mix(in_oklch,var(--bg)_72%,transparent)] backdrop-blur-sm animate-[fade_.18s_ease-out]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-h-[90vh] overflow-y-auto bg-surface border border-border rounded-2xl shadow-2xl animate-[pop_.22s_cubic-bezier(.16,1,.3,1)]"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 sm:px-6 py-2.5 bg-surface/95 backdrop-blur border-b border-border">
          <span className="text-eyebrow uppercase text-muted">
            {comparing ? 'Head-to-head' : picking ? 'Pick a technician to compare' : 'Technician stats'}
          </span>
          <div className="flex items-center gap-2">
            {!comparing && !picking && (
              <div
                role="tablist"
                aria-label="Layout"
                className="hidden sm:flex items-center gap-0.5 rounded-btn border border-border bg-surface-2/60 p-0.5"
              >
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    role="tab"
                    aria-selected={layout === l.id}
                    onClick={() => setLayout(l.id)}
                    className={cn(
                      'text-[12px] font-medium px-3 py-1 rounded-btn transition-colors',
                      layout === l.id
                        ? 'bg-surface text-text shadow-[inset_0_0_0_1px_var(--border)]'
                        : 'text-muted hover:text-text',
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
            {(comparing || picking) && (
              <button
                onClick={() => {
                  setPicking(false);
                  onPickCompare(null);
                }}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-text px-2.5 py-1 rounded-btn transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close"
              className="inline-grid place-items-center h-8 w-8 rounded-btn text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {picking ? (
            <ComparePicker
              tech={tech}
              peers={peers}
              onPick={(p) => {
                onPickCompare(p);
                setPicking(false);
              }}
            />
          ) : comparing && compareWith ? (
            <CompareView a={tech} b={compareWith} isCA={isCA} />
          ) : layout === 'scorecard' ? (
            <ScorecardLayout tech={tech} peers={peers} isCA={isCA} onCompare={() => setPicking(true)} />
          ) : layout === 'split' ? (
            <SplitLayout tech={tech} peers={peers} isCA={isCA} onCompare={() => setPicking(true)} />
          ) : (
            <SpotlightLayout tech={tech} peers={peers} isCA={isCA} onCompare={() => setPicking(true)} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Shared bits ─────────────────────────────────────────────────────────── */

function Avatar({ tech, size = 48, color }: { tech: Technician; size?: number; color?: string }) {
  const c = color ?? `var(--d-${tech.departmentCode})`;
  return (
    <span
      className="shrink-0 rounded-full grid place-items-center font-mono font-medium overflow-hidden"
      style={{
        height: size,
        width: size,
        fontSize: size * 0.32,
        background: `color-mix(in oklch, ${c} 22%, var(--surface-2))`,
        border: '1px solid var(--border)',
        color: c,
      }}
      aria-hidden
    >
      {tech.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tech.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initials(tech.name)
      )}
    </span>
  );
}

function CompareButton({ onCompare }: { onCompare: () => void }) {
  return (
    <button
      onClick={onCompare}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-btn border border-border bg-surface-2 hover:bg-surface-2/70 text-text transition-colors"
    >
      <GitCompareArrows className="h-3.5 w-3.5" />
      Compare
    </button>
  );
}

/** Identity row: avatar, name, and the division + rank/percentile pills on
 *  one line; Compare on the right. */
function Identity({
  tech,
  peers,
  onCompare,
}: {
  tech: Technician;
  peers: Technician[];
  onCompare: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar tech={tech} size={44} />
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[18px] font-semibold leading-tight truncate">{tech.name}</span>
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          <span className="text-muted capitalize">{deptLabel(tech.departmentCode)}</span>
          <span className="font-mono px-2 py-0.5 rounded-pill bg-surface-2 text-muted border border-border">
            Rank #{tech.rank}
          </span>
          <span
            className="font-mono px-2 py-0.5 rounded-pill border"
            style={{
              background: 'color-mix(in oklch, var(--accent) 16%, var(--surface-2))',
              color: 'var(--accent)',
              borderColor: 'color-mix(in oklch, var(--accent) 45%, transparent)',
            }}
          >
            {percentileLabel(tech.rank, peers.length)}
          </span>
        </div>
      </div>
      <div className="ml-auto shrink-0">
        <CompareButton onCompare={onCompare} />
      </div>
    </div>
  );
}

/** Percent / points YoY delta pill (matches the target's simplified pills). */
function DeltaPill({
  cur,
  prev,
  unit,
  suffix,
}: {
  cur: number;
  prev?: number;
  unit: MetricUnit;
  suffix?: string;
}) {
  if (prev === undefined || prev === null) {
    return <span className="text-[11px] text-muted">no LY</span>;
  }
  const up = cur >= prev;
  const body =
    unit === 'bps'
      ? `${up ? '+' : ''}${((cur - prev) / 100).toFixed(1)} pts`
      : `${up ? '+' : ''}${prev !== 0 ? (((cur - prev) / Math.abs(prev)) * 100).toFixed(1) : '0.0'}%`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill font-mono tabular-nums font-medium text-[11px] px-1.5 py-0.5 leading-none',
        up ? 'bg-up-bg text-up' : 'bg-down-bg text-down',
      )}
    >
      <span aria-hidden className="text-[9px]">{up ? '▲' : '▼'}</span>
      {body}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}

/* ─── Trend chart (this year vs last year) ────────────────────────────────── */

function TrendChart({
  series,
  compare,
  months,
  color = 'var(--accent)',
  compareColor = 'var(--muted)',
  compareDashed = true,
  height = 180,
}: {
  series: number[];
  compare?: number[];
  months?: string[];
  color?: string;
  compareColor?: string;
  /** Last-year overlay is dashed; head-to-head passes false for two solid lines. */
  compareDashed?: boolean;
  height?: number;
}) {
  const hasData = series.length >= 2;
  if (!hasData) {
    return (
      <div
        className="rounded-card border border-border bg-surface-2/40 grid place-items-center text-[12px] text-muted"
        style={{ height }}
      >
        Trend data not yet available
      </div>
    );
  }

  const W = 560;
  const H = height;
  const padT = 10;
  const padB = 10;
  const all = compare && compare.length ? series.concat(compare) : series;
  const ticks = niceTicks(Math.max(...all, 1));
  const top = ticks[ticks.length - 1] || 1;
  const x = linearScale([0, series.length - 1], [0, W]);
  const y = linearScale([0, top], [H - padB, padT]);
  const toPath = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const line = toPath(series);
  const area = `${line} L${W.toFixed(1)},${H - padB} L0,${H - padB} Z`;
  const lastX = x(series.length - 1);
  const lastY = y(series[series.length - 1]);

  // Up to 5 evenly spaced month labels (first … last).
  const n = series.length;
  const labelCount = Math.min(5, n);
  const labelIdx = Array.from(new Set(
    Array.from({ length: labelCount }, (_, k) =>
      labelCount <= 1 ? 0 : Math.round((k * (n - 1)) / (labelCount - 1)),
    ),
  ));

  return (
    <div className="relative" style={{ paddingBottom: months && months.length ? 18 : 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="techTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Faint baseline gridlines */}
        {[top, top / 2].map((v, i) => (
          <line
            key={i}
            x1={0}
            x2={W}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--border)"
            strokeOpacity={0.5}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill="url(#techTrendFill)" />
        {compare && compare.length >= 2 && (
          <path
            d={toPath(compare)}
            fill="none"
            stroke={compareColor}
            strokeOpacity={compareDashed ? 0.6 : 1}
            strokeWidth={compareDashed ? 1.5 : 2}
            strokeDasharray={compareDashed ? '4 3' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={lastX} cy={lastY} r={3.5} fill={color} />
      </svg>
      {months && months.length === n && (
        <div className="absolute inset-x-0 bottom-0 h-4 text-[10px] text-muted font-mono">
          {labelIdx.map((idx) => {
            const pos = n <= 1 ? 0 : (idx / (n - 1)) * 100;
            const transform =
              idx === 0 ? 'none' : idx === n - 1 ? 'translateX(-100%)' : 'translateX(-50%)';
            return (
              <span key={idx} className="absolute" style={{ left: `${pos}%`, transform }}>
                {monthAbbr(months[idx])}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChartLegend({ hasLy }: { hasLy: boolean }) {
  return (
    <div className="flex items-center gap-4 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded bg-accent" />
        This year
      </span>
      {hasLy && (
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed border-muted" />
          Last year
        </span>
      )}
    </div>
  );
}

/* ─── KPI card ────────────────────────────────────────────────────────────── */

function KpiCard({
  label,
  cur,
  prev,
  unit,
}: {
  label: string;
  cur: number;
  prev?: number;
  unit: MetricUnit;
}) {
  return (
    <div className="rounded-card border border-border bg-surface-2/40 p-3 flex flex-col gap-1">
      <span className="text-eyebrow uppercase text-muted">{label}</span>
      <span className="text-[22px] leading-none font-mono tabular-nums">{fmtMetric(cur, unit)}</span>
      <div className="flex items-center gap-2">
        <DeltaPill cur={cur} prev={prev} unit={unit} />
        {prev !== undefined && (
          <span className="text-[11px] text-muted font-mono tabular-nums">
            {fmtMetric(prev, unit)} LY
          </span>
        )}
      </div>
    </div>
  );
}

/** Replacement for the (redundant with the headline) revenue KPI card.
 *  Technicians show Flip revenue; CAs don't flip, so they get Opportunities. */
function firstKpi(
  tech: Technician,
  isCA: boolean,
): { label: string; cur: number; prev?: number; unit: MetricUnit } {
  return isCA
    ? { label: 'Opportunities', cur: tech.opps, prev: tech.lyOpps, unit: 'count' }
    : { label: 'Flip revenue', cur: tech.flipSales, prev: tech.lyFlipSales, unit: 'cents' };
}

/* ─── Spotlight layout ────────────────────────────────────────────────────── */

function SpotlightLayout({
  tech,
  peers,
  isCA,
  onCompare,
}: {
  tech: Technician;
  peers: Technician[];
  isCA: boolean;
  onCompare: () => void;
}) {
  const m = metricsFor(tech, isCA);
  const rev = revTrailing(tech);
  const hasLy = !!tech.lySpark && tech.lySpark.length >= 2;
  const movers = momentum(tech, isCA);

  return (
    <div className="flex flex-col gap-4">
      <Identity tech={tech} peers={peers} onCompare={onCompare} />

      {/* Revenue + trend, combined */}
      <div className="rounded-card border border-border bg-surface-2/30 p-3.5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex flex-col gap-1">
            <span className="text-eyebrow uppercase text-muted">
              {rev.trailing ? 'Revenue · trailing 12 mo' : 'Revenue'}
            </span>
            <div className="flex items-baseline gap-2.5">
              <span className="text-[32px] leading-none font-mono tabular-nums">{fmtMoney(rev.value)}</span>
              <DeltaPill cur={rev.value} prev={rev.prev} unit="cents" suffix="YoY" />
            </div>
          </div>
          <div className="pt-1">
            <ChartLegend hasLy={hasLy} />
          </div>
        </div>
        <TrendChart series={tech.spark} compare={tech.lySpark} months={tech.sparkMonths} height={140} />
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(() => {
          const fk = firstKpi(tech, isCA);
          return <KpiCard label={fk.label} cur={fk.cur} prev={fk.prev} unit={fk.unit} />;
        })()}
        {m.slice(1, 3).map((d) => (
          <KpiCard key={d.label} label={d.label} cur={d.cur} prev={d.prev} unit={d.unit} />
        ))}
      </div>

      {movers.length > 0 && <MomentumChips movers={movers} />}
    </div>
  );
}

function MomentumChips({ movers }: { movers: ReturnType<typeof momentum> }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-eyebrow uppercase text-muted">Momentum vs last year</span>
      <div className="flex flex-wrap gap-2">
        {movers.map((mvr) => {
          const Icon = mvr.dir === 'up' ? TrendingUp : TrendingDown;
          return (
            <span
              key={mvr.label}
              className={cn(
                'inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-pill border',
                mvr.dir === 'up'
                  ? 'bg-up-bg text-up border-up/30'
                  : 'bg-down-bg text-down border-down/30',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {mvr.label}
              <span className="font-mono tabular-nums">{mvr.delta}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Scorecard layout ────────────────────────────────────────────────────── */

function ScorecardLayout({
  tech,
  peers,
  isCA,
  onCompare,
}: {
  tech: Technician;
  peers: Technician[];
  isCA: boolean;
  onCompare: () => void;
}) {
  const metrics = metricsFor(tech, isCA);
  const rankFill = peers.length > 1 ? (1 - (tech.rank - 1) / (peers.length - 1)) * 100 : 100;
  return (
    <div className="flex flex-col gap-4">
      <Identity tech={tech} peers={peers} onCompare={onCompare} />
      <div className="flex flex-col divide-y divide-border/60">
        {metrics.map((d) => (
          <div
            key={d.label}
            className="grid items-center gap-3 py-2"
            style={{ gridTemplateColumns: 'minmax(0,1.1fr) auto auto 84px' }}
          >
            <span className="text-[13px] text-muted truncate">{d.label}</span>
            <span className="text-[15px] font-mono tabular-nums font-medium text-right w-24">
              {fmtMetric(d.cur, d.unit)}
            </span>
            <div className="flex justify-end w-24">
              <DeltaPill cur={d.cur} prev={d.prev} unit={d.unit} />
            </div>
            {d.spark && d.spark.length >= 2 ? (
              <Sparkline values={d.spark} width={84} height={24} fill="area" />
            ) : (
              <span className="text-[11px] text-muted text-right">—</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-eyebrow uppercase text-muted w-28">Field position</span>
        <div className="h-2 flex-1 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${rankFill}%`, background: `var(--d-${tech.departmentCode})` }}
          />
        </div>
        <span className="text-[12px] font-mono tabular-nums text-muted w-20 text-right">
          {percentileLabel(tech.rank, peers.length)}
        </span>
      </div>
    </div>
  );
}

/* ─── Split layout ────────────────────────────────────────────────────────── */

function SplitLayout({
  tech,
  peers,
  isCA,
  onCompare,
}: {
  tech: Technician;
  peers: Technician[];
  isCA: boolean;
  onCompare: () => void;
}) {
  const m = metricsFor(tech, isCA);
  const rev = revTrailing(tech);
  const hasLy = !!tech.lySpark && tech.lySpark.length >= 2;
  const movers = momentum(tech, isCA);
  const cards: Array<{ label: string; cur: number; prev?: number; unit: MetricUnit }> = [
    firstKpi(tech, isCA),
    ...m.slice(1, 3).map((d) => ({ label: d.label, cur: d.cur, prev: d.prev, unit: d.unit })),
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="flex flex-col gap-3">
        <Identity tech={tech} peers={peers} onCompare={onCompare} />
        <div className="flex flex-col gap-2.5">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-card border border-border bg-surface-2/40 p-3 flex items-center justify-between gap-3"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-eyebrow uppercase text-muted">{c.label}</span>
                <span className="text-[18px] font-mono tabular-nums font-semibold">
                  {fmtMetric(c.cur, c.unit)}
                </span>
              </div>
              <DeltaPill cur={c.cur} prev={c.prev} unit={c.unit} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-eyebrow uppercase text-muted">
            {rev.trailing ? 'Revenue · trailing 12 mo' : 'Revenue trend'}
          </span>
          <ChartLegend hasLy={hasLy} />
        </div>
        <TrendChart series={tech.spark} compare={tech.lySpark} months={tech.sparkMonths} height={140} />
        {movers.length > 0 && <MomentumChips movers={movers} />}
      </div>
    </div>
  );
}

/* ─── Compare picker ──────────────────────────────────────────────────────── */

function ComparePicker({
  tech,
  peers,
  onPick,
}: {
  tech: Technician;
  peers: Technician[];
  onPick: (t: Technician) => void;
}) {
  const others = peers.filter((p) => p.employeeId !== tech.employeeId);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {others.map((p) => (
        <button
          key={p.employeeId}
          onClick={() => onPick(p)}
          className="flex items-center gap-2 p-2 rounded-card border border-border bg-surface-2/30 hover:bg-surface-2/60 text-left transition-colors"
        >
          <Avatar tech={p} size={32} />
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-medium truncate">{p.name}</span>
            <span className="text-[11px] text-muted font-mono tabular-nums">
              #{p.rank} · {fmtMoney(p.revenue)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ─── Compare view ────────────────────────────────────────────────────────── */

function CompareView({ a, b, isCA }: { a: Technician; b: Technician; isCA: boolean }) {
  const { rows, verdict } = useMemo(() => compareTechs(a, b, isCA), [a, b, isCA]);
  const aColor = A_COMPARE;
  const bColor = B_COMPARE;

  return (
    <div className="flex flex-col gap-4">
      {/* Dual header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar tech={a} size={44} color={aColor} />
          <div className="flex flex-col min-w-0">
            <span className="text-[16px] font-semibold truncate leading-tight">{a.name}</span>
            <span className="text-[11px] font-mono font-medium" style={{ color: aColor }}>
              Rank #{a.rank}
            </span>
          </div>
        </div>
        <span className="text-[11px] font-mono uppercase text-muted px-2.5 py-1 rounded-pill border border-border bg-surface-2">
          vs
        </span>
        <div className="flex items-center gap-2.5 min-w-0 justify-end text-right">
          <div className="flex flex-col min-w-0 items-end">
            <span className="text-[16px] font-semibold truncate leading-tight">{b.name}</span>
            <span className="text-[11px] font-mono font-medium" style={{ color: bColor }}>
              Rank #{b.rank}
            </span>
          </div>
          <Avatar tech={b} size={44} color={bColor} />
        </div>
      </div>

      {/* Two-line trend card */}
      <div className="rounded-card border border-border bg-surface-2/30 p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-eyebrow uppercase text-muted">Revenue trend · trailing 12 mo</span>
          <div className="flex items-center gap-4 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: aColor }} />
              {a.name.split(' ')[0]}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: bColor }} />
              {b.name.split(' ')[0]}
            </span>
          </div>
        </div>
        <TrendChart
          series={a.spark}
          compare={b.spark}
          months={a.sparkMonths}
          color={aColor}
          compareColor={bColor}
          compareDashed={false}
          height={140}
        />
      </div>

      {/* Per-metric mirrored rows */}
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const max = Math.max(r.a, r.b, 1);
          return (
            <div key={r.label} className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="flex items-center gap-2 justify-start min-w-0">
                  <span
                    className="text-[17px] font-mono tabular-nums font-semibold"
                    style={{ color: aColor }}
                  >
                    {r.aFmt}
                  </span>
                  <DeltaPill cur={r.a} prev={r.aPrev} unit={r.unit} />
                </div>
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted whitespace-nowrap px-2">
                  {r.label}
                </span>
                <div className="flex items-center gap-2 justify-end min-w-0">
                  <DeltaPill cur={r.b} prev={r.bPrev} unit={r.unit} />
                  <span className="text-[17px] font-mono tabular-nums font-semibold">{r.bFmt}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 items-center">
                <div className="flex justify-end">
                  <div
                    className="h-2.5 rounded-full transition-[width] duration-300"
                    style={{
                      width: `${(r.a / max) * 100}%`,
                      background: aColor,
                      opacity: r.winner === 'b' ? 0.4 : 1,
                    }}
                  />
                </div>
                <div className="flex justify-start">
                  <div
                    className="h-2.5 rounded-full transition-[width] duration-300"
                    style={{
                      width: `${(r.b / max) * 100}%`,
                      background: bColor,
                      opacity: r.winner === 'a' ? 0.4 : 1,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[13px] text-text bg-surface-2/40 border border-border rounded-card px-4 py-2.5">
        {verdict}
      </p>
    </div>
  );
}
