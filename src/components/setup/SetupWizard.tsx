'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { StepCompany, type StepCompanyValues } from './StepCompany';
import { StepServiceTitan, type StepServiceTitanValues } from './StepServiceTitan';
import {
  StepDivisions,
  type BuAssignment,
  type DivisionDraft,
} from './StepDivisions';
import {
  StepGoogleReviews,
  type GoogleLocationDraft,
  type StepGoogleValues,
} from './StepGoogleReviews';

const STEP_LABELS = ['Company', 'ServiceTitan', 'Divisions', 'Google reviews'];

interface SetupState {
  step: number;
  completed: boolean;
  config: Record<string, string | number | boolean | null>;
}

export function SetupWizard() {
  const [state, setState] = useState<SetupState | null>(null);
  const [activeStep, setActiveStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch('/api/setup');
      if (!res.ok) throw new Error(`Failed to load setup state: ${res.status}`);
      const s = (await res.json()) as SetupState;
      setState(s);
      setActiveStep(Math.min(s.step, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function postStep(step: number, stepName: string, data: Record<string, unknown>, complete = false) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step, stepName, data, complete }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; step?: number; completed?: boolean };
      if (!j.ok) throw new Error(j.error ?? `Failed (${res.status})`);
      await load();
      setActiveStep(Math.min(step + 1, 4));
      if (complete) {
        // Hard reload so layout.tsx re-reads config and the dashboard becomes usable.
        window.location.href = '/';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!state) {
    return <div className="text-[13px] text-muted">Loading…</div>;
  }

  const cfg = state.config;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <Stepper active={activeStep} furthest={Math.min(state.step, 4)} onJump={setActiveStep} />

      {error && (
        <div className="text-[12px] text-down bg-down-bg border border-down/30 rounded-btn px-3 py-2">
          {error}
        </div>
      )}

      {activeStep === 1 && (
        <StepCompany
          saving={saving}
          initial={{
            company_name: (cfg.company_name as string) ?? '',
            company_logo_url: (cfg.company_logo_url as string) ?? '',
            timezone: (cfg.timezone as string) ?? 'America/Chicago',
          }}
          onSave={(v: StepCompanyValues) => postStep(1, 'company', v as unknown as Record<string, unknown>)}
        />
      )}

      {activeStep === 2 && (
        <StepServiceTitan
          saving={saving}
          initial={{
            st_tenant_id: (cfg.st_tenant_id as string) ?? '',
            st_client_id: (cfg.st_client_id as string) ?? '',
            st_client_secret: (cfg.st_client_secret as string) ?? '',
            st_app_key: (cfg.st_app_key as string) ?? '',
          }}
          onSave={(v: StepServiceTitanValues) =>
            postStep(2, 'servicetitan', v as unknown as Record<string, unknown>)
          }
        />
      )}

      {activeStep === 3 && (
        <DivisionsStepLoader
          saving={saving}
          onSave={async (payload: { divisions: DivisionDraft[]; buAssignments: BuAssignment[] }) => {
            setSaving(true);
            setError(null);
            try {
              const res = await fetch('/api/setup/divisions', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
              });
              const j = (await res.json()) as { ok?: boolean; error?: string };
              if (!j.ok) throw new Error(j.error ?? 'Save failed');
              await postStep(3, 'divisions', {});
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      {activeStep === 4 && (
        <StepGoogleReviews
          saving={saving}
          initialCreds={{
            google_client_id: (cfg.google_client_id as string) ?? '',
            google_client_secret: (cfg.google_client_secret as string) ?? '',
            google_refresh_token: (cfg.google_refresh_token as string) ?? '',
          }}
          initialLocations={[]}
          onSave={async (payload: {
            creds: StepGoogleValues;
            locations: GoogleLocationDraft[];
            skip: boolean;
          }) => {
            setSaving(true);
            setError(null);
            try {
              if (!payload.skip) {
                const locRes = await fetch('/api/setup/google-locations', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ locations: payload.locations }),
                });
                const lj = (await locRes.json()) as { ok?: boolean; error?: string };
                if (!lj.ok) throw new Error(lj.error ?? 'Failed to save locations');
              }
              await postStep(
                4,
                'google-reviews',
                payload.skip ? {} : (payload.creds as unknown as Record<string, unknown>),
                true,
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

function Stepper({
  active,
  furthest,
  onJump,
}: {
  active: number;
  furthest: number;
  onJump: (n: number) => void;
}) {
  return (
    <ol className="flex items-center gap-2 flex-wrap">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const isActive = n === active;
        const isDone = n < furthest;
        const isReachable = n <= furthest;
        return (
          <li key={label}>
            <button
              type="button"
              disabled={!isReachable}
              onClick={() => isReachable && onJump(n)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-btn border text-[12px] font-medium transition-colors',
                isActive
                  ? 'border-accent text-text bg-accent/10'
                  : isDone
                    ? 'border-up/40 text-up bg-up-bg/40 hover:bg-up-bg/60'
                    : isReachable
                      ? 'border-border text-muted hover:text-text'
                      : 'border-border text-muted opacity-50 cursor-not-allowed',
              )}
            >
              <span
                className={cn(
                  'h-5 w-5 rounded-full grid place-items-center text-[11px] tabular-nums',
                  isDone
                    ? 'bg-up text-bg'
                    : isActive
                      ? 'bg-accent text-bg'
                      : 'bg-surface-2 text-muted',
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : n}
              </span>
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function DivisionsStepLoader({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (p: { divisions: DivisionDraft[]; buAssignments: BuAssignment[] }) => void | Promise<void>;
}) {
  const [initial, setInitial] = useState<{
    divisions: DivisionDraft[];
    assignments: BuAssignment[];
  } | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    // Pull current divisions from /api/config (public, includes them).
    const res = await fetch('/api/config');
    const j = (await res.json()) as {
      divisions?: Array<{
        code: string;
        name: string;
        color: string | null;
        icon: string | null;
        active: boolean;
        sortOrder: number;
      }>;
    };
    const divisions: DivisionDraft[] = (j.divisions ?? []).map((d) => ({
      code: d.code,
      name: d.name,
      color: d.color ?? '#3FB6E8',
      icon: d.icon,
      hasTechnicians: true,
      hasComfortAdvisors: false,
      sortOrder: d.sortOrder,
    }));
    setInitial({ divisions, assignments: [] });
  }

  if (!initial) return <div className="text-[13px] text-muted">Loading…</div>;

  return (
    <StepDivisions
      saving={saving}
      initialDivisions={initial.divisions}
      initialAssignments={initial.assignments}
      onSave={onSave}
    />
  );
}
