'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Field, Input, Select } from '@/components/primitives/input';
import { SectionHead } from '@/components/primitives/section-head';

type RoleMetric = 'revenue' | 'avgTicket' | 'jobs' | 'closeRate';

interface RoleDraft {
  code: string;
  name: string;
  primaryMetric: RoleMetric;
  primaryMetricLabel: string;
  sortOrder: number;
  /** True if the role already exists in the DB. Used to gate code edits — a
   *  saved role's code is referenced by employee.roleCode + every fact row,
   *  so renaming it would orphan data. */
  existed: boolean;
}

const METRIC_OPTIONS: Array<{ value: RoleMetric; label: string; defaultDesc: string }> = [
  { value: 'revenue', label: 'Revenue', defaultDesc: 'Closed revenue' },
  { value: 'avgTicket', label: 'Avg ticket', defaultDesc: 'Average ticket' },
  { value: 'jobs', label: 'Jobs completed', defaultDesc: 'Jobs completed' },
  { value: 'closeRate', label: 'Close rate', defaultDesc: 'Close rate' },
];

export function TechnicianRolesClient() {
  const [roles, setRoles] = useState<RoleDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch('/api/admin/technician-roles');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = (await res.json()) as { roles: Array<Omit<RoleDraft, 'existed'>> };
      setRoles(
        j.roles
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((r) => ({ ...r, existed: true })),
      );
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoaded(true);
    }
  }

  function add() {
    const next = roles.length + 1;
    setRoles([
      ...roles,
      {
        code: `role_${next}`,
        name: `Role ${next}`,
        primaryMetric: 'revenue',
        primaryMetricLabel: 'Closed revenue',
        sortOrder: next * 10,
        existed: false,
      },
    ]);
  }

  function update(i: number, patch: Partial<RoleDraft>) {
    setRoles((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function remove(i: number) {
    setRoles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    setRoles((prev) => {
      const next = prev.slice();
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((r, idx) => ({ ...r, sortOrder: (idx + 1) * 10 }));
    });
  }

  function pickMetric(i: number, value: RoleMetric) {
    const opt = METRIC_OPTIONS.find((m) => m.value === value);
    update(i, {
      primaryMetric: value,
      // Only auto-fill the label if it's still the old default — never stomp
      // a custom label the admin typed.
      primaryMetricLabel:
        opt && METRIC_OPTIONS.some((m) => m.defaultDesc === roles[i].primaryMetricLabel)
          ? opt.defaultDesc
          : roles[i].primaryMetricLabel,
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setFlash(null);
    // Re-normalize sort order before sending so ties get broken deterministically.
    const payload = roles.map((r, idx) => ({
      code: r.code,
      name: r.name,
      primaryMetric: r.primaryMetric,
      primaryMetricLabel: r.primaryMetricLabel,
      sortOrder: (idx + 1) * 10,
    }));
    try {
      const res = await fetch('/api/admin/technician-roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roles: payload }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; upserted?: number; deactivated?: number };
      if (!j.ok) throw new Error(j.error ?? `Failed (${res.status})`);
      setFlash(`Saved · ${j.upserted ?? 0} active, ${j.deactivated ?? 0} archived.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div className="text-[13px] text-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <SectionHead eyebrow="Admin" title="Technician roles (tabs)" />

      <Panel padding="cozy">
        <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
          Each role becomes a tab on the Technicians page. Pick the primary
          metric the tab ranks employees by, then choose the label that
          appears next to it. Order the rows however you want them to appear
          left-to-right.
        </p>
        <p className="text-[12px] text-muted leading-relaxed max-w-2xl mt-2">
          <strong className="text-text">Note:</strong> the code is the join key
          on every employee + fact row — once a role has data, renaming the code
          would orphan it. The display name is safe to change anytime.
        </p>
      </Panel>

      {error && (
        <div className="text-[12px] text-down bg-down-bg border border-down/30 rounded-btn px-3 py-2">
          {error}
        </div>
      )}
      {flash && (
        <div className="text-[12px] text-up bg-up-bg border border-up/30 rounded-btn px-3 py-2">
          {flash}
        </div>
      )}

      <Panel
        eyebrow={`Roles · ${roles.length}`}
        title="Tabs"
        right={
          <div className="flex items-center gap-2">
            <Button variant="default" onClick={add}>
              <Plus className="h-3.5 w-3.5" />
              Add role
            </Button>
            <Button variant="primary" disabled={saving || roles.length === 0} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {roles.length === 0 && (
            <div className="text-[13px] text-muted">
              No roles yet. Add one to create your first Technicians tab.
            </div>
          )}
          {roles.map((r, i) => (
            <div
              key={i}
              className="border border-border rounded-panel p-4 grid gap-3"
              style={{ gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr auto' }}
            >
              <div className="flex flex-col items-center justify-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <span className="text-[11px] text-muted font-mono tabular-nums">{i + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => move(i, 1)}
                  disabled={i === roles.length - 1}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>

              <Field
                label="Code"
                hint={
                  r.existed
                    ? 'Immutable — referenced by every employee + fact row.'
                    : 'Lowercase, underscores. Set this once and leave it.'
                }
              >
                <Input
                  value={r.code}
                  disabled={r.existed}
                  onChange={(e) =>
                    update(i, {
                      code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                    })
                  }
                />
              </Field>

              <Field label="Display name" hint="The tab label.">
                <Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
              </Field>

              <Field label="Primary metric">
                <Select
                  value={r.primaryMetric}
                  onChange={(e) => pickMetric(i, e.target.value as RoleMetric)}
                >
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Metric label" hint="Shown next to the metric value.">
                <Input
                  value={r.primaryMetricLabel}
                  onChange={(e) => update(i, { primaryMetricLabel: e.target.value })}
                />
              </Field>

              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={() => remove(i)} title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
