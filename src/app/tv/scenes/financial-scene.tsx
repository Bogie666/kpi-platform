'use client';

import { useQuery } from '@tanstack/react-query';
import type { ApiEnvelope, FinancialResponse } from '@/lib/types/kpi';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import { AreaTrend } from '@/components/charts/area-trend';
import { TvHeader } from './tv-header';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function FinancialScene() {
  const { data } = useQuery<FinancialResponse>({
    queryKey: ['tv-financial', 'mtd'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/financial?preset=mtd');
      if (!res.ok) throw new Error(`financial: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<FinancialResponse>;
      return json.data;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!data) {
    return <TvHeader eyebrow="Financial" title="Loading…" />;
  }

  const goal = data.total.target;
  const rev = data.total.revenue.value;
  const pct = goal > 0 ? Math.min(1, rev / goal) : 0;
  const isLong = data.trend.length > 60;
  const trend = data.trend.map((t) => {
    const dd = Number(t.date.slice(-2));
    const mm = Number(t.date.slice(5, 7));
    return {
      label: isLong && dd === 1 ? MONTH[mm - 1] ?? '' : isLong ? '' : String(dd),
      value: t.actual,
      target: t.target,
    };
  });

  return (
    <div className="flex flex-col h-full gap-6">
      <TvHeader eyebrow={`${data.meta.period} · Company revenue`} title="Revenue to date" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8 lg:gap-12 flex-1 min-h-0">
        <div className="flex flex-col gap-5 min-h-0">
          <div className="flex flex-col gap-2">
            <span className="text-eyebrow uppercase text-muted">Total revenue</span>
            <div
              className="text-display font-mono tabular-nums leading-none"
              style={{ fontSize: 'clamp(64px, 8vw, 120px)' }}
            >
              {fmtMoney(rev)}
            </div>
            <div className="flex items-center gap-3 text-[18px] text-muted font-mono tabular-nums flex-wrap">
              <span>{fmtMoney(goal)} goal</span>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-border" />
              <span className={pct >= 1 ? 'text-up' : 'text-text'}>
                {fmtPercent(Math.round(pct * 10000), { decimals: 1 })} to goal
              </span>
            </div>
            {/* Progress bar — directly under the headline numbers. */}
            <div className="h-3 w-full bg-surface-2 rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-accent transition-[width] duration-1000 ease-out"
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </div>

          {/* Per-department revenue — sorted desc, scaled to the highest bar
              so smaller depts still register visually. */}
          <DepartmentBreakdown data={data} />
        </div>

        <div className="min-h-[300px]">
          <AreaTrend data={trend} height={400} unit="cents" valueLabel="Revenue" />
        </div>
      </div>
    </div>
  );
}

function DepartmentBreakdown({ data }: { data: FinancialResponse }) {
  const depts = [...data.departments]
    .map((d) => ({ ...d, value: d.revenue.value }))
    .sort((a, b) => b.value - a.value)
    .filter((d) => d.value > 0 || d.target > 0);
  const max = Math.max(...depts.map((d) => d.value), 1);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      <span className="text-eyebrow uppercase text-muted">By department</span>
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        {depts.map((d) => {
          const widthPct = (d.value / max) * 100;
          const color = `var(${d.colorToken})`;
          const goalPct =
            d.target > 0 ? Math.min(1, d.value / d.target) : null;
          return (
            <div
              key={d.code}
              className="grid items-center gap-3"
              style={{ gridTemplateColumns: 'minmax(140px, 1.2fr) minmax(0, 2fr) 110px' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <span className="text-[15px] font-medium truncate">{d.name}</span>
              </div>
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${widthPct}%`, background: color, opacity: 0.85 }}
                />
              </div>
              <div className="text-right font-mono tabular-nums text-[16px] flex flex-col items-end leading-tight">
                <span className="font-semibold">{fmtMoney(d.value, { abbreviate: true })}</span>
                {goalPct != null && (
                  <span
                    className={`text-[11px] ${
                      goalPct >= 1 ? 'text-up' : goalPct >= 0.7 ? 'text-text' : 'text-muted'
                    }`}
                  >
                    {fmtPercent(Math.round(goalPct * 10000), { decimals: 0 })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
