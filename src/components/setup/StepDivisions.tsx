'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Field, Input, Select } from '@/components/primitives/input';
import { DIVISION_ICONS, DIVISION_PALETTE } from './division-palette';

export interface DivisionDraft {
  code: string;
  name: string;
  color: string;
  icon: string | null;
  hasTechnicians: boolean;
  hasComfortAdvisors: boolean;
  sortOrder: number;
}

export interface BuAssignment {
  id: number;
  name: string;
  /** division `code`, or null = drop */
  departmentCode: string | null;
}

interface RemoteBu {
  id: number;
  name: string;
}

export function StepDivisions({
  initialDivisions,
  initialAssignments,
  onSave,
  saving,
}: {
  initialDivisions: DivisionDraft[];
  initialAssignments: BuAssignment[];
  onSave: (payload: { divisions: DivisionDraft[]; buAssignments: BuAssignment[] }) => void | Promise<void>;
  saving?: boolean;
}) {
  const [divisions, setDivisions] = useState<DivisionDraft[]>(initialDivisions);
  const [busFromSt, setBusFromSt] = useState<RemoteBu[]>([]);
  const [assignments, setAssignments] = useState<Map<number, string | null>>(
    () => new Map(initialAssignments.map((a) => [a.id, a.departmentCode])),
  );
  const [loadingBus, setLoadingBus] = useState(false);
  const [buError, setBuError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchBus() {
    setLoadingBus(true);
    setBuError(null);
    try {
      const res = await fetch('/api/setup/st-business-units');
      const j = (await res.json()) as { ok?: boolean; error?: string; businessUnits?: RemoteBu[] };
      if (!j.ok) {
        setBuError(j.error ?? 'Failed to fetch BUs');
        return;
      }
      setBusFromSt(j.businessUnits ?? []);
      // Seed assignments for BUs we haven't seen before — leave them undecided.
      setAssignments((prev) => {
        const next = new Map(prev);
        for (const bu of j.businessUnits ?? []) {
          if (!next.has(bu.id)) next.set(bu.id, undefined as unknown as string | null);
        }
        return next;
      });
    } catch (err) {
      setBuError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingBus(false);
    }
  }

  function addDivision() {
    const idx = divisions.length;
    const palette = DIVISION_PALETTE[idx % DIVISION_PALETTE.length];
    setDivisions([
      ...divisions,
      {
        code: `division_${idx + 1}`,
        name: `Division ${idx + 1}`,
        color: palette.hex,
        icon: null,
        hasTechnicians: true,
        hasComfortAdvisors: false,
        sortOrder: (idx + 1) * 10,
      },
    ]);
  }

  function updateDivision(idx: number, patch: Partial<DivisionDraft>) {
    setDivisions((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function removeDivision(idx: number) {
    const removed = divisions[idx];
    setDivisions((prev) => prev.filter((_, i) => i !== idx));
    // Clear any assignments that referenced this code.
    setAssignments((prev) => {
      const next = new Map(prev);
      for (const [id, code] of next) {
        if (code === removed.code) next.set(id, null);
      }
      return next;
    });
  }

  function setAssignment(buId: number, code: string | null | undefined) {
    setAssignments((prev) => {
      const next = new Map(prev);
      next.set(buId, code === undefined ? (undefined as unknown as string | null) : code);
      return next;
    });
  }

  const unassignedCount = useMemo(() => {
    let n = 0;
    for (const bu of busFromSt) {
      const v = assignments.get(bu.id);
      if (v === undefined) n++;
    }
    return n;
  }, [busFromSt, assignments]);

  const canContinue =
    divisions.length > 0 &&
    busFromSt.length > 0 &&
    unassignedCount === 0 &&
    divisions.every((d) => d.code.trim() && d.name.trim());

  function submit() {
    const buAssignments: BuAssignment[] = busFromSt.map((bu) => ({
      id: bu.id,
      name: bu.name,
      departmentCode: assignments.get(bu.id) ?? null,
    }));
    void onSave({ divisions, buAssignments });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        eyebrow="Step 3 of 4"
        title="Divisions & business units"
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => void fetchBus()} disabled={loadingBus}>
              <RefreshCw className="h-3.5 w-3.5" />
              Re-fetch from ST
            </Button>
            <Button
              variant="primary"
              disabled={saving || !canContinue}
              onClick={submit}
            >
              {saving ? 'Saving…' : 'Save & continue'}
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
          Create your divisions (HVAC, Plumbing, etc.), then assign each
          ServiceTitan business unit to one — or mark it "Drop" if you don't
          want it shown on the dashboard. The dashboard groups every fact row
          by division using these mappings.
        </p>
      </Panel>

      <Panel eyebrow="Divisions" right={<Button variant="default" onClick={addDivision}><Plus className="h-3.5 w-3.5" />Add division</Button>}>
        <div className="flex flex-col gap-3">
          {divisions.length === 0 && (
            <div className="text-[13px] text-muted">No divisions yet — add at least one.</div>
          )}
          {divisions.map((d, i) => (
            <div
              key={i}
              className="border border-border rounded-panel p-4 grid gap-3"
              style={{ gridTemplateColumns: 'auto 1fr 1fr auto auto auto' }}
            >
              <div className="flex items-center justify-center">
                <div
                  className="h-8 w-8 rounded-md"
                  style={{ background: d.color, boxShadow: 'inset 0 0 0 1px var(--border)' }}
                  aria-hidden="true"
                />
              </div>
              <Field label="Code" hint="Lowercase, underscores. Used as a key everywhere — don't change later.">
                <Input
                  value={d.code}
                  onChange={(e) => updateDivision(i, { code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                />
              </Field>
              <Field label="Display name">
                <Input value={d.name} onChange={(e) => updateDivision(i, { name: e.target.value })} />
              </Field>
              <Field label="Color">
                <Select value={d.color} onChange={(e) => updateDivision(i, { color: e.target.value })}>
                  {DIVISION_PALETTE.map((p) => (
                    <option key={p.hex} value={p.hex}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Icon">
                <Select
                  value={d.icon ?? ''}
                  onChange={(e) => updateDivision(i, { icon: e.target.value || null })}
                >
                  <option value="">(none)</option>
                  {DIVISION_ICONS.map((ic) => (
                    <option key={ic} value={ic}>
                      {ic}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={() => removeDivision(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="col-span-full flex items-center gap-4 text-[12px] text-muted">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.hasTechnicians}
                    onChange={(e) => updateDivision(i, { hasTechnicians: e.target.checked })}
                  />
                  Has technicians
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.hasComfortAdvisors}
                    onChange={(e) => updateDivision(i, { hasComfortAdvisors: e.target.checked })}
                  />
                  Has comfort advisors
                </label>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        eyebrow={`Business units · ${busFromSt.length} from ServiceTitan`}
        title="Map each BU to a division"
        right={unassignedCount > 0 ? (
          <span className="text-[12px] text-warning">{unassignedCount} unassigned</span>
        ) : null}
      >
        {buError && (
          <div className="text-[12px] text-down bg-down-bg border border-down/30 rounded-btn px-3 py-2 mb-3">
            {buError}
          </div>
        )}
        {loadingBus && <div className="text-[13px] text-muted">Fetching from ServiceTitan…</div>}
        {!loadingBus && busFromSt.length === 0 && !buError && (
          <div className="text-[13px] text-muted">No business units returned from ServiceTitan.</div>
        )}
        {!loadingBus && busFromSt.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {busFromSt.map((bu) => {
              const current = assignments.get(bu.id);
              return (
                <div
                  key={bu.id}
                  className="flex items-center gap-3 border border-border rounded-btn px-3 py-2"
                >
                  <div className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span
                      className="text-[14px] font-medium truncate"
                      title={`${bu.name} (ST id ${bu.id})`}
                    >
                      {bu.name?.trim() ? bu.name : `Business Unit #${bu.id}`}
                    </span>
                    <span className="text-[10px] text-muted font-mono mt-0.5">
                      ST id {bu.id}
                    </span>
                  </div>
                  {/* Wrap the Select — its `w-full` default would otherwise
                      override any width class passed via props and balloon
                      the dropdown to fill the entire row. */}
                  <div className="w-44 shrink-0">
                    <Select
                      value={current === undefined ? '' : current ?? '__drop__'}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '') setAssignment(bu.id, undefined);
                        else if (v === '__drop__') setAssignment(bu.id, null);
                        else setAssignment(bu.id, v);
                      }}
                    >
                      <option value="">— choose —</option>
                      {divisions.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.name}
                        </option>
                      ))}
                      <option value="__drop__">Drop (don't show)</option>
                    </Select>
                  </div>
                  {current === null && (
                    <span title="Marked drop">
                      <X className="h-3.5 w-3.5 text-muted" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
