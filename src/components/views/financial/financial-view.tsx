'use client';

import { useMemo } from 'react';
import { useFinancial } from '@/lib/hooks/use-financial';
import { useNewCustomers } from '@/lib/hooks/use-new-customers';
import { usePipelineRevenue } from '@/lib/hooks/use-pipeline-revenue';
import { useDashboardParams } from '@/lib/state/url-params';
import { SectionHead } from '@/components/primitives/section-head';
import { PeriodTabs } from '@/components/primitives/period-tabs';
import { Skeleton } from '@/components/primitives/skeleton';
import { Panel } from '@/components/primitives/panel';
import { CompareBanner } from '@/components/layout/compare-banner';
import { fmtAsOf } from '@/lib/format/date';
import { financialInsights } from '@/lib/insights/financial';
import { FinancialHero } from './financial-hero';
import { FinancialKPIStrip } from './financial-kpi-strip';
import { DepartmentTable } from './department-table';
import { PotentialRevenuePanel } from './potential-revenue-panel';

export function FinancialView() {
  const [params, setParams] = useDashboardParams();
  const { data, isLoading, error, refetch } = useFinancial(params);
  // Pipeline default is today → EOM regardless of which period is selected,
  // so the number is always interpretable as "what this month could still
  // add". (Could later pivot to follow the period.)
  const { data: pipeline } = usePipelineRevenue();
  const { data: newCustomers } = useNewCustomers(params);

  const compareOn = params.compare === 'ly' || params.compare === 'ly2';
  const compareYear: 'ly' | 'ly2' = params.compare === 'ly2' ? 'ly2' : 'ly';

  const insights = useMemo(
    () => (data && compareOn ? financialInsights(data, compareYear) : []),
    [data, compareOn, compareYear],
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow={data ? data.meta.period : 'Financial'}
        title="Financial"
        right={
          <>
            <PeriodTabs value={params.period} onChange={(p) => setParams({ period: p })} />
            {data && (
              <span className="text-meta font-mono text-muted hidden md:inline">
                as of {fmtAsOf(data.meta.asOf)}
              </span>
            )}
          </>
        }
      />

      {isLoading && (
        <div className="flex flex-col gap-6">
          <Panel padding="cozy">
            <Skeleton variant="chart" />
          </Panel>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Panel key={i} padding="tight">
                <Skeleton variant="stat" />
              </Panel>
            ))}
          </div>
          <Panel padding="cozy">
            <Skeleton variant="table-row" count={5} className="mb-2" />
          </Panel>
        </div>
      )}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load financial data</div>
            <p className="text-[13px] text-muted">
              Something went wrong fetching the dashboard. You can try again.
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

      {data && (
        <>
          {compareOn && insights.length > 0 && (
            <CompareBanner insights={insights} mode={compareYear} />
          )}
          <FinancialHero data={data} compareMode={params.compare} pipeline={pipeline} />
          <FinancialKPIStrip
            data={data}
            compareMode={params.compare}
            newCustomers={newCustomers}
          />
          <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
            <DepartmentTable
              data={data}
              compareMode={params.compare}
              pipeline={pipeline}
            />
            <PotentialRevenuePanel data={data} />
          </div>
        </>
      )}
    </div>
  );
}
