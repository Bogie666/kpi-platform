'use client';

import { Panel } from '@/components/primitives/panel';
import { Stat } from '@/components/primitives/stat';
import type { FinancialResponse } from '@/lib/types/kpi';
import type { CompareMode } from '@/lib/state/url-params';
import type { NewCustomersResponse } from '@/app/api/kpi/new-customers/route';

export interface FinancialKPIStripProps {
  data: FinancialResponse;
  compareMode: CompareMode;
  newCustomers?: NewCustomersResponse;
}

function toStatMode(m: CompareMode): 'prev' | 'ly' | 'ly2' | 'none' {
  if (m === 'ly') return 'ly';
  if (m === 'ly2') return 'ly2';
  return 'prev';
}

export function FinancialKPIStrip({ data, compareMode, newCustomers }: FinancialKPIStripProps) {
  const mode = toStatMode(compareMode);
  const k = data.kpis;
  // New-customer comparison value shaped to match the other KPIs. We do
  // not have a `prev` (prior period) yet — only LY / LY2 — so leave it
  // undefined, matching how the other KPIs handle that case.
  const newCustomersCV = newCustomers
    ? {
        value: newCustomers.value,
        ly: newCustomers.ly,
        ly2: newCustomers.ly2,
        unit: 'count' as const,
      }
    : undefined;
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      <Panel padding="tight">
        <Stat label="Close rate" value={k.closeRate.value} unit="bps" comparison={k.closeRate} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        <Stat label="Avg ticket" value={k.avgTicket.value} unit="cents" comparison={k.avgTicket} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        <Stat label="Opportunities" value={k.opportunities.value} unit="count" comparison={k.opportunities} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        <Stat label="Memberships" value={k.memberships.value} unit="count" comparison={k.memberships} compareMode={mode} />
      </Panel>
      <Panel padding="tight">
        {newCustomersCV ? (
          <Stat
            label="New customers"
            value={newCustomersCV.value}
            unit="count"
            comparison={newCustomersCV}
            compareMode={mode}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-eyebrow uppercase text-muted">New customers</span>
            <span className="text-kpi font-mono tabular-nums text-muted/40">…</span>
          </div>
        )}
      </Panel>
    </div>
  );
}
