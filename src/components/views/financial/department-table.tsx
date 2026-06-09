'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { ComparePill } from '@/components/primitives/compare-pill';
import { Sparkline } from '@/components/charts/sparkline';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import { cn } from '@/lib/cn';
import type { FinancialResponse } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';
import type { PipelineRevenueResponse } from '@/app/api/kpi/pipeline-revenue/route';

export interface DepartmentTableProps {
  data: FinancialResponse;
  compareMode: CompareMode;
  pipeline?: PipelineRevenueResponse;
}

export function DepartmentTable({ data, compareMode, pipeline }: DepartmentTableProps) {
  const compareOn = compareMode === 'ly' || compareMode === 'ly2';
  const compareKey: 'ly' | 'ly2' = compareMode === 'ly2' ? 'ly2' : 'ly';
  const compareLabel = compareKey === 'ly2' ? '2024' : 'LY';

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
    <Panel eyebrow="Divisions" title="Revenue by division" padding="cozy">
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-left">
          <thead>
            <tr className="col-head border-b border-border">
              <th className="py-2 pr-4 font-normal">Division</th>
              <th
                className="py-2 pr-4 font-normal text-right"
                title="Top: revenue invoiced this period. Below: pipeline = won estimates on jobs scheduled in the next 30 days, not yet invoiced."
              >
                Revenue
              </th>
              {compareOn ? (
                <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">
                  {compareLabel}
                </th>
              ) : (
                <th className="py-2 pr-4 font-normal text-right hidden md:table-cell">Target</th>
              )}
              {!compareOn && (
                <th className="py-2 pr-4 font-normal text-right hidden lg:table-cell">% to Goal</th>
              )}
              <th className="py-2 pr-4 font-normal text-right">
                {compareOn ? `Δ vs ${compareLabel}` : 'vs Target'}
              </th>
              <th className="py-2 pr-2 font-normal text-right hidden lg:table-cell">Trend</th>
            </tr>
          </thead>
          <tbody>
            {data.departments.map((d) => {
              const pctGoal = (d.revenue.value / d.target) * 100;
              const baseVal = d.revenue[compareKey];
              const bus = d.businessUnits ?? [];
              const hasBreakdown = bus.length > 1;
              const isOpen = expanded.has(d.code);
              const pipelineCents = pipeline?.byDivision?.[d.code] ?? 0;

              return (
                <FragmentWithRows
                  key={d.code}
                  deptRow={
                    <tr
                      className={cn(
                        'border-b border-border/60 hover:bg-surface-2/20 transition-colors',
                        hasBreakdown && 'cursor-pointer',
                        isOpen && 'bg-surface-2/15',
                      )}
                      onClick={hasBreakdown ? () => toggle(d.code) : undefined}
                      aria-expanded={hasBreakdown ? isOpen : undefined}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          {hasBreakdown ? (
                            <ChevronRight
                              aria-hidden="true"
                              className={cn(
                                'h-3.5 w-3.5 text-muted transition-transform shrink-0',
                                isOpen && 'rotate-90',
                              )}
                            />
                          ) : (
                            <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ background: `var(${d.colorToken})` }}
                          />
                          <span className="text-[13px] font-medium">{d.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px]">
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{fmtMoney(d.revenue.value)}</span>
                          {pipelineCents > 0 && (
                            <span
                              className="text-[11px] text-up"
                              title={`Pipeline: scheduled work through EOM. Projected: ${fmtMoney(d.revenue.value + pipelineCents)}`}
                            >
                              +{fmtMoney(pipelineCents)} pipe
                            </span>
                          )}
                        </div>
                      </td>
                      {compareOn ? (
                        <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden md:table-cell">
                          {baseVal !== undefined ? fmtMoney(baseVal) : '—'}
                        </td>
                      ) : (
                        <td className="py-3 pr-4 text-right font-mono tabular-nums text-[13px] text-muted hidden md:table-cell">
                          {fmtMoney(d.target)}
                        </td>
                      )}
                      {!compareOn && (
                        <td className="py-3 pr-4 hidden lg:table-cell">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-1 bg-surface-2 rounded-full overflow-hidden">
                              <div
                                className="h-full transition-[width] duration-300 ease-out"
                                style={{
                                  width: `${Math.min(pctGoal, 100)}%`,
                                  background: `var(${d.colorToken})`,
                                }}
                              />
                            </div>
                            <span className="font-mono tabular-nums text-[12px] text-muted w-12 text-right">
                              {fmtPercent(Math.round(pctGoal * 100))}
                            </span>
                          </div>
                        </td>
                      )}
                      <td className="py-3 pr-4 text-right">
                        <div className="flex justify-end">
                          {compareOn && baseVal !== undefined ? (
                            <ComparePill
                              current={d.revenue.value}
                              comparison={baseVal}
                              unit="cents"
                              baseline={compareKey}
                              size="sm"
                            />
                          ) : d.target > 0 ? (
                            <ComparePill
                              current={d.revenue.value}
                              comparison={d.target}
                              unit="cents"
                              baseline="prev"
                              size="sm"
                            />
                          ) : (
                            <span className="text-[12px] text-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-2 text-right hidden lg:table-cell">
                        <div className="inline-flex">
                          <Sparkline
                            values={d.spark}
                            compareValues={compareOn ? d.lySpark : undefined}
                            width={96}
                            height={28}
                            stroke={`var(${d.colorToken})`}
                            fill="area"
                          />
                        </div>
                      </td>
                    </tr>
                  }
                  buRows={
                    isOpen && hasBreakdown
                      ? bus.map((bu) => {
                          const buBase = bu.revenue[compareKey];
                          return (
                            <tr
                              key={`${d.code}:bu:${bu.id}`}
                              className="border-b border-border/40 bg-surface-2/10"
                            >
                              <td className="py-2 pr-4">
                                <div className="flex items-center gap-2 pl-6">
                                  <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                                  <span
                                    aria-hidden="true"
                                    className="h-1.5 w-1.5 rounded-full shrink-0 opacity-60"
                                    style={{ background: `var(${d.colorToken})` }}
                                  />
                                  <span className="text-[12px] text-muted">{bu.name}</span>
                                </div>
                              </td>
                              <td className="py-2 pr-4 text-right font-mono tabular-nums text-[12px] text-muted">
                                {fmtMoney(bu.revenue.value)}
                              </td>
                              {compareOn ? (
                                <td className="py-2 pr-4 text-right font-mono tabular-nums text-[12px] text-muted hidden md:table-cell">
                                  {buBase !== undefined ? fmtMoney(buBase) : '—'}
                                </td>
                              ) : (
                                <td className="py-2 pr-4 hidden md:table-cell" />
                              )}
                              {!compareOn && <td className="py-2 pr-4 hidden lg:table-cell" />}
                              <td className="py-2 pr-4 text-right">
                                <div className="flex justify-end">
                                  {compareOn && buBase !== undefined ? (
                                    <ComparePill
                                      current={bu.revenue.value}
                                      comparison={buBase}
                                      unit="cents"
                                      baseline={compareKey}
                                      size="sm"
                                    />
                                  ) : (
                                    <span className="text-[12px] text-muted">—</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 pr-2 text-right hidden lg:table-cell">
                                <div className="inline-flex opacity-60">
                                  <Sparkline
                                    values={bu.spark}
                                    width={96}
                                    height={20}
                                    stroke={`var(${d.colorToken})`}
                                    fill="area"
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      : null
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

/**
 * Tiny helper — renders the division `<tr>` followed by optional BU `<tr>`s.
 * We can't return `<tr> + <tr>` from a `.map` callback directly without a
 * fragment, and using `<></>` strips the React key. Naming this lets each
 * iteration produce a stable identity in the tbody.
 */
function FragmentWithRows({
  deptRow,
  buRows,
}: {
  deptRow: React.ReactNode;
  buRows: React.ReactNode;
}) {
  return (
    <>
      {deptRow}
      {buRows}
    </>
  );
}
