'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { SectionHead } from '@/components/primitives/section-head';
import { Button } from '@/components/primitives/button';
import { Field, Input, Select } from '@/components/primitives/input';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  usePacingSettings,
  usePacingSettingsUpdate,
} from '@/lib/hooks/use-admin-settings';

/** 8 → "8:00 AM", 13.5 → "1:30 PM". */
function clockLabel(hourOfDay: number): string {
  const h24 = ((hourOfDay % 24) + 24) % 24;
  let h = Math.floor(h24);
  let m = Math.round((h24 - h) * 60);
  if (m === 60) {
    h = (h + 1) % 24;
    m = 0;
  }
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// Start-time choices on the half hour, 5:00 AM – 12:00 PM.
const START_OPTIONS = Array.from({ length: 15 }, (_, i) => 5 + i * 0.5);

export function SettingsClient() {
  const { data, isLoading, error, refetch } = usePacingSettings();
  const update = usePacingSettingsUpdate();

  const [hours, setHours] = useState('');
  const [start, setStart] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  // Seed the form once settings load (and after saves via refetched data).
  useEffect(() => {
    if (data) {
      setHours(String(data.workdayHours));
      setStart(String(data.startHour));
    }
  }, [data]);

  const hoursNum = Number(hours);
  const startNum = Number(start);
  const hoursValid = Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= 24;
  const startValid = Number.isFinite(startNum) && startNum >= 0 && startNum < 24;

  const notify = (kind: 'success' | 'error', msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4000);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hoursValid || !startValid) return;
    try {
      await update.mutateAsync({ workdayHours: hoursNum, startHour: startNum });
      notify('success', 'Saved — the financial screen picks this up on its next refresh');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <SectionHead eyebrow="Admin" title="Pacing settings" />

      {isLoading && (
        <Panel padding="cozy">
          <Skeleton variant="table-row" count={2} className="mb-2" />
        </Panel>
      )}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load settings</div>
            <p className="text-[13px] text-muted">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <Button onClick={() => refetch()}>Retry</Button>
          </div>
        </Panel>
      )}

      {data && (
        <Panel title="Working day" eyebrow="Hourly pace" padding="cozy">
          <p className="text-[13px] text-muted leading-relaxed mb-4">
            The financial screen&apos;s &ldquo;Today&rdquo; card spreads the daily revenue
            target evenly across this working day, so morning revenue is compared
            against what should be in the door <em>by that hour</em> instead of the
            full-day number. Weekends and company holidays have no pace target —
            production on those days counts as bonus.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <Field label="Workday start" hint="Business-local (Central) time">
                <Select value={start} onChange={(e) => setStart(e.target.value)}>
                  {START_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {clockLabel(h)}
                    </option>
                  ))}
                  {/* Preserve an out-of-list stored value instead of silently moving it. */}
                  {startValid && !START_OPTIONS.includes(startNum) && (
                    <option value={startNum}>{clockLabel(startNum)}</option>
                  )}
                </Select>
              </Field>

              <Field
                label="Workday length (hours)"
                hint="e.g. 10 — half hours OK (9.5)"
                error={hours && !hoursValid ? 'Must be between 0 and 24' : undefined}
              >
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  max="24"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  required
                />
              </Field>
            </div>

            {hoursValid && startValid && (
              <p className="text-[12px] text-muted font-mono tabular-nums">
                Pace runs {clockLabel(startNum)} → {clockLabel(startNum + hoursNum)} · a
                $50,000 day target paces at ${Math.round(50000 / hoursNum).toLocaleString('en-US')}/hr
              </p>
            )}

            <div>
              <Button type="submit" variant="primary" disabled={update.isPending || !hoursValid || !startValid}>
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {toast && (
        <div
          className="fixed bottom-4 left-4 z-50 bg-surface border border-border rounded-panel px-4 py-2.5 text-[13px] shadow-[var(--shadow-modal)]"
          style={{ color: toast.kind === 'success' ? 'var(--up)' : 'var(--down)' }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
