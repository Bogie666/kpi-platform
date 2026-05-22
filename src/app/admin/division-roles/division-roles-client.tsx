'use client';

import { useEffect, useMemo, useState } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Select } from '@/components/primitives/input';
import { SectionHead } from '@/components/primitives/section-head';
import { cn } from '@/lib/cn';

interface Division {
  code: string;
  name: string;
  defaultRoleCode: string | null;
  active: boolean;
  sortOrder: number;
}

interface Role {
  code: string;
  name: string;
  active: boolean;
}

interface Draft extends Division {
  dirty: boolean;
}

export function DivisionRolesClient() {
  const [divisions, setDivisions] = useState<Draft[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch('/api/admin/division-roles');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = (await res.json()) as { divisions: Division[]; roles: Role[] };
      setDivisions(j.divisions.map((d) => ({ ...d, dirty: false })));
      setRoles(j.roles);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoaded(true);
    }
  }

  function update(code: string, defaultRoleCode: string | null) {
    setDivisions((prev) =>
      prev.map((d) => (d.code === code ? { ...d, defaultRoleCode, dirty: true } : d)),
    );
  }

  const dirty = useMemo(() => divisions.filter((d) => d.dirty), [divisions]);

  async function save() {
    if (dirty.length === 0) return;
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/division-roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          updates: dirty.map((d) => ({
            divisionCode: d.code,
            defaultRoleCode: d.defaultRoleCode,
          })),
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; updated?: number };
      if (!j.ok) throw new Error(j.error ?? `Failed (${res.status})`);
      setFlash(`Saved · ${j.updated ?? 0} division mappings updated.`);
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
      <SectionHead eyebrow="Admin" title="Division → role auto-bucketing" />

      <Panel padding="cozy">
        <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
          When a technician closes a job, the sync attributes that row to a
          role (Technicians tab) based on the job's division. This page
          controls that mapping. The choice here is the default behavior —
          you can still override individual employees in{' '}
          <strong className="text-text">Employees</strong>.
        </p>
        <p className="text-[12px] text-muted leading-relaxed max-w-2xl mt-2">
          Leave any division at <strong className="text-text">— none —</strong> to drop
          its jobs from technician stats entirely.
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
        eyebrow={`Divisions · ${divisions.length}`}
        title="Mapping"
        right={
          <Button variant="primary" disabled={saving || dirty.length === 0} onClick={save}>
            {saving ? 'Saving…' : `Save${dirty.length > 0 ? ` (${dirty.length})` : ''}`}
          </Button>
        }
      >
        <div className="border border-border rounded-panel overflow-hidden">
          <div
            className="grid text-[11px] uppercase text-muted bg-surface-2 px-3 py-2 gap-3"
            style={{ gridTemplateColumns: '1fr 1fr 100px' }}
          >
            <div>Division</div>
            <div>Default role (Technicians tab)</div>
            <div>Status</div>
          </div>
          {divisions.length === 0 && (
            <div className="px-3 py-4 text-[13px] text-muted">No divisions yet.</div>
          )}
          {divisions.map((d) => (
            <div
              key={d.code}
              className={cn(
                'grid items-center px-3 py-2 gap-3 text-[13px] border-t border-border',
                d.dirty && 'bg-accent/5',
                !d.active && 'opacity-60',
              )}
              style={{ gridTemplateColumns: '1fr 1fr 100px' }}
            >
              <div>
                {d.name}
                <span className="text-[11px] text-muted font-mono ml-2">{d.code}</span>
              </div>
              <Select
                value={d.defaultRoleCode ?? ''}
                onChange={(e) => update(d.code, e.target.value || null)}
              >
                <option value="">— none (drop) —</option>
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                    {!r.active ? ' (archived)' : ''}
                  </option>
                ))}
              </Select>
              <div className={cn('text-[12px]', d.active ? 'text-up' : 'text-muted')}>
                {d.active ? 'Active' : 'Inactive'}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
