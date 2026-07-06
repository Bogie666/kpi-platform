'use client';

import { useUpcomingAppointments } from '@/lib/hooks/use-upcoming-appointments';
import { SectionHead } from '@/components/primitives/section-head';
import { Panel } from '@/components/primitives/panel';
import { fmtAsOf } from '@/lib/format/date';
import { AppointmentsDrilldown } from './appointments-drilldown';

export function AppointmentsView() {
  const { data, isLoading, error, refetch } = useUpcomingAppointments();
  // The upcoming-appointments route doesn't expose a meta.asOf, so we
  // stamp the load time here for the header.
  const asOfNow = new Date().toISOString();

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Appointments"
        title="Upcoming"
        right={
          data && (
            <span className="text-meta font-mono text-muted hidden md:inline">
              Next 7 days · as of {fmtAsOf(asOfNow)}
            </span>
          )
        }
      />

      {isLoading && (
        <Panel padding="cozy">
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div
              className="h-9 w-9 rounded-full border-[3px] border-border"
              style={{
                borderTopColor: 'var(--accent)',
                animation: 'spin 0.8s linear infinite',
              }}
              aria-hidden
            />
            <div className="flex flex-col items-center gap-1">
              <span className="text-[15px] font-medium">Loading appointments…</span>
              <span className="text-[12px] text-muted">
                Pulling the next 7 days from ServiceTitan, usually 5–10 seconds.
              </span>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </Panel>
      )}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load appointments</div>
            <button
              onClick={() => refetch()}
              className="text-[13px] font-medium px-3 py-1.5 rounded-btn bg-surface-2 hover:bg-surface-2/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </Panel>
      )}

      {data && <AppointmentsDrilldown data={data} />}
    </div>
  );
}
