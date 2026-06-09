'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useDashboardParams } from '@/lib/state/url-params';
import { useTechnicians } from '@/lib/hooks/use-technicians';
import { SectionHead } from '@/components/primitives/section-head';
import { PeriodTabs } from '@/components/primitives/period-tabs';
import { Panel } from '@/components/primitives/panel';
import { Skeleton } from '@/components/primitives/skeleton';
import { CompareBanner } from '@/components/layout/compare-banner';
import { fmtAsOf } from '@/lib/format/date';
import { technicianInsights } from '@/lib/insights/technicians';
import { RoleSubTabs } from './role-sub-tabs';
import { TeamKPIStrip } from './team-kpi-strip';
import { Podium } from './podium';
import { TechLeaderboard } from './tech-leaderboard';

export function TechniciansView() {
  const [params, setParams] = useDashboardParams();
  const { data, isLoading, error, refetch } = useTechnicians(params);

  const compareOn = params.compare === 'ly' || params.compare === 'ly2';
  const compareYear: 'ly' | 'ly2' = params.compare === 'ly2' ? 'ly2' : 'ly';
  const isAllView = data?.role.code === 'all';

  const [search, setSearch] = useState('');
  // Clear the search when the user navigates away from the all-techs view —
  // the per-role tabs already filter to a small set, search there would be noise.
  const effectiveSearch = isAllView ? search.trim().toLowerCase() : '';

  const filteredTechnicians = useMemo(() => {
    if (!data) return [];
    if (!effectiveSearch) return data.technicians;
    return data.technicians.filter((t) => t.name.toLowerCase().includes(effectiveSearch));
  }, [data, effectiveSearch]);

  const insights = useMemo(
    () => (data && compareOn ? technicianInsights(data, compareYear) : []),
    [data, compareOn, compareYear],
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Technicians"
        title={data ? data.role.name : 'Technicians'}
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
        <>
          <Panel padding="cozy">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Skeleton variant="stat" count={4} />
            </div>
          </Panel>
          <Panel padding="cozy">
            <Skeleton variant="chart" />
          </Panel>
        </>
      )}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load technicians</div>
            <p className="text-[13px] text-muted">Something went wrong. Try again?</p>
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
          <RoleSubTabs
            value={data.role.code}
            onChange={(code) => setParams({ role: code })}
            roles={data.roles}
          />

          {compareOn && insights.length > 0 && (
            <CompareBanner insights={insights} mode={compareYear} />
          )}

          <TeamKPIStrip team={data.team} compareMode={params.compare} roleCode={data.role.code} />

          {!isAllView && data.technicians.length >= 3 && (
            <Podium
              first={data.technicians[0]}
              second={data.technicians[1]}
              third={data.technicians[2]}
              role={data.role}
            />
          )}

          {isAllView && (
            <div className="flex items-center gap-2 max-w-md">
              <div className="relative flex-1">
                <Search
                  aria-hidden="true"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full bg-surface border border-border rounded-btn text-[13px] text-text placeholder:text-muted pl-8 pr-8 py-1.5 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className="text-meta text-muted whitespace-nowrap">
                {filteredTechnicians.length} of {data.technicians.length}
              </span>
            </div>
          )}

          <TechLeaderboard
            technicians={filteredTechnicians}
            compareMode={params.compare}
            roleCode={data.role.code}
          />
        </>
      )}
    </div>
  );
}
