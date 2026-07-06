/**
 * Pure derivations for the technician stats card — percentile, YoY momentum,
 * and head-to-head compare. No React, no formatting side effects beyond the
 * pre-formatted strings the card renders directly. Role-aware: Comfort
 * Advisors swap avg ticket→avg sale, jobs→options, and drop memberships/flips,
 * mirroring the CA vs non-CA leaderboard columns.
 */
import type { Technician } from '@/lib/types/kpi';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import { fmtCount } from '@/lib/format/count';

export type MetricUnit = 'cents' | 'bps' | 'count' | 'options';

export function fmtMetric(value: number, unit: MetricUnit): string {
  switch (unit) {
    case 'cents':
      return fmtMoney(value);
    case 'bps':
      return fmtPercent(value, { decimals: 1 });
    case 'options':
      return (value / 100).toFixed(1);
    case 'count':
    default:
      return fmtCount(value);
  }
}

/** Rank (1-based) → "Top N%" within the role set. */
export function percentileLabel(rank: number, total: number): string {
  if (total <= 1) return 'Top 100%';
  return `Top ${Math.max(1, Math.round((rank / total) * 100))}%`;
}

export interface MetricDef {
  label: string;
  cur: number;
  prev?: number;
  unit: MetricUnit;
  /** Optional per-metric trend series for the scorecard mini-spark. */
  spark?: number[];
}

/**
 * The metrics shown on the scorecard / compare, in display order. Single
 * source of truth for the role split so the card and compare agree.
 */
export function metricsFor(t: Technician, isCA: boolean): MetricDef[] {
  if (isCA) {
    return [
      { label: 'Revenue', cur: t.revenue, prev: t.ly, unit: 'cents', spark: t.spark },
      { label: 'Close rate', cur: t.closeRate, prev: t.lyCloseRate, unit: 'bps' },
      { label: 'Avg sale', cur: t.avgSale, prev: t.lyAvgSale, unit: 'cents' },
      { label: 'Opportunities', cur: t.opps, prev: t.lyOpps, unit: 'count' },
      { label: 'Options / opp', cur: t.options, prev: t.lyOptions, unit: 'options' },
    ];
  }
  return [
    { label: 'Revenue', cur: t.revenue, prev: t.ly, unit: 'cents', spark: t.spark },
    { label: 'Close rate', cur: t.closeRate, prev: t.lyCloseRate, unit: 'bps' },
    { label: 'Avg ticket', cur: t.avgTicket, prev: t.lyAvgTicket, unit: 'cents' },
    { label: 'Completed jobs', cur: t.jobs, prev: t.lyJobs, unit: 'count' },
    { label: 'Opportunities', cur: t.opps, prev: t.lyOpps, unit: 'count' },
    { label: 'Memberships', cur: t.members, prev: t.lyMembers, unit: 'count' },
  ];
}

export interface Mover {
  label: string;
  /** signed, pre-formatted, e.g. "+9.9%" or "+3.6 pts". */
  delta: string;
  dir: 'up' | 'down';
  /** sort magnitude (fractional change, or points for bps). */
  magnitude: number;
}

const pctChange = (cur: number, prev: number) =>
  prev !== 0 ? (cur - prev) / Math.abs(prev) : 0;

/** Top 3 YoY movers by magnitude. bps metrics report as points. */
export function momentum(t: Technician, isCA: boolean): Mover[] {
  return metricsFor(t, isCA)
    .filter((d) => d.prev !== undefined && d.prev !== null)
    .map((d) => {
      const prev = d.prev as number;
      const up = d.cur >= prev;
      if (d.unit === 'bps') {
        const pts = (d.cur - prev) / 100;
        return {
          label: d.label,
          delta: `${up ? '+' : ''}${pts.toFixed(1)} pts`,
          dir: up ? 'up' : 'down',
          magnitude: Math.abs(pts) / 100,
        } as Mover;
      }
      const change = pctChange(d.cur, prev);
      return {
        label: d.label,
        delta: `${up ? '+' : ''}${(change * 100).toFixed(1)}%`,
        dir: up ? 'up' : 'down',
        magnitude: Math.abs(change),
      } as Mover;
    })
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 3);
}

export interface CompareRow {
  label: string;
  unit: MetricUnit;
  a: number;
  b: number;
  aPrev?: number;
  bPrev?: number;
  aFmt: string;
  bFmt: string;
  winner: 'a' | 'b' | 'tie';
}

export interface CompareResult {
  rows: CompareRow[];
  verdict: string;
  /** categories won by each side. */
  aWins: number;
  bWins: number;
}

/** Head-to-head rows + a one-line verdict. Role-aware via `isCA`. */
export function compareTechs(a: Technician, b: Technician, isCA: boolean): CompareResult {
  const aDefs = metricsFor(a, isCA);
  const bDefs = metricsFor(b, isCA);
  let aWins = 0;
  let bWins = 0;
  const rows: CompareRow[] = aDefs.map((da, i) => {
    const db = bDefs[i];
    const winner = da.cur > db.cur ? 'a' : db.cur > da.cur ? 'b' : 'tie';
    if (winner === 'a') aWins++;
    else if (winner === 'b') bWins++;
    return {
      label: da.label,
      unit: da.unit,
      a: da.cur,
      b: db.cur,
      aPrev: da.prev,
      bPrev: db.prev,
      aFmt: fmtMetric(da.cur, da.unit),
      bFmt: fmtMetric(db.cur, db.unit),
      winner,
    };
  });
  const total = rows.length;
  const lead = aWins === bWins ? null : aWins > bWins ? a : b;
  const verdict = lead
    ? `${lead.name.split(' ')[0]} leads in ${Math.max(aWins, bWins)} of ${total} categories this period.`
    : `${a.name.split(' ')[0]} and ${b.name.split(' ')[0]} are evenly matched — ${aWins} categories each.`;
  return { rows, verdict, aWins, bWins };
}
