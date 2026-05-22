'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Input, Select } from '@/components/primitives/input';
import { SectionHead } from '@/components/primitives/section-head';
import { cn } from '@/lib/cn';

interface Employee {
  id: number;
  serviceTitanId: number | null;
  name: string;
  roleCode: string | null;
  roleLocked: boolean;
  departmentCode: string | null;
  active: boolean;
}

interface Role {
  code: string;
  name: string;
  active: boolean;
}

interface EmployeeDraft extends Employee {
  /** Whether this row has unsaved local edits. */
  dirty: boolean;
}

export function EmployeesClient() {
  const [employees, setEmployees] = useState<EmployeeDraft[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [onlyLocked, setOnlyLocked] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch('/api/admin/employees');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = (await res.json()) as { employees: Employee[]; roles: Role[] };
      setEmployees(j.employees.map((e) => ({ ...e, dirty: false })));
      setRoles(j.roles);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoaded(true);
    }
  }

  function update(id: number, patch: Partial<Employee>) {
    setEmployees((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch, dirty: true } : e)),
    );
  }

  function toggleLock(id: number) {
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              roleLocked: !e.roleLocked,
              dirty: true,
            }
          : e,
      ),
    );
  }

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return employees.filter((e) => {
      if (!showInactive && !e.active) return false;
      if (onlyLocked && !e.roleLocked) return false;
      if (!needle) return true;
      return (
        e.name.toLowerCase().includes(needle) ||
        (e.roleCode ?? '').toLowerCase().includes(needle) ||
        (e.departmentCode ?? '').toLowerCase().includes(needle)
      );
    });
  }, [employees, filter, showInactive, onlyLocked]);

  const dirtyCount = employees.filter((e) => e.dirty).length;

  async function save() {
    const updates = employees
      .filter((e) => e.dirty)
      .map((e) => ({ id: e.id, roleCode: e.roleCode, roleLocked: e.roleLocked }));
    if (updates.length === 0) return;
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; updated?: number };
      if (!j.ok) throw new Error(j.error ?? `Failed (${res.status})`);
      setFlash(`Saved · ${j.updated ?? 0} employees updated.`);
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
      <SectionHead eyebrow="Admin" title="Employee role assignment" />

      <Panel padding="cozy">
        <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
          By default, the sync auto-buckets each technician into a role based on
          the division of the jobs they close. Lock an employee here to pin them
          to a specific role instead — useful for custom tabs like "Sales Team 1"
          that the auto-bucketing wouldn't pick up on its own.
        </p>
        <p className="text-[12px] text-muted leading-relaxed max-w-2xl mt-2">
          <strong className="text-text">Unlocked</strong> rows ignore whatever
          value is in the role column and use the sync's choice.
          <strong className="text-text"> Locked</strong> rows use the value you
          set, every sync, until you unlock them.
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
        eyebrow={`Employees · ${filtered.length} of ${employees.length}`}
        title="Roster"
        right={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={onlyLocked}
                onChange={(e) => setOnlyLocked(e.target.checked)}
              />
              Locked only
            </label>
            <Button
              variant="primary"
              disabled={saving || dirtyCount === 0}
              onClick={save}
            >
              {saving ? 'Saving…' : `Save${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
            </Button>
          </div>
        }
      >
        <div className="mb-3 max-w-sm">
          <Input
            placeholder="Filter by name, role, or division…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="border border-border rounded-panel overflow-hidden">
          <div
            className="grid text-[11px] uppercase text-muted bg-surface-2 px-3 py-2 gap-3 sticky top-0"
            style={{ gridTemplateColumns: '1fr 140px 200px 110px 60px' }}
          >
            <div>Name</div>
            <div>Division</div>
            <div>Role</div>
            <div>Status</div>
            <div className="text-right">Lock</div>
          </div>
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-[13px] text-muted">No employees match.</div>
          )}
          {filtered.map((e) => (
            <div
              key={e.id}
              className={cn(
                'grid items-center px-3 py-2 gap-3 text-[13px] border-t border-border',
                e.dirty && 'bg-accent/5',
                !e.active && 'opacity-60',
              )}
              style={{ gridTemplateColumns: '1fr 140px 200px 110px 60px' }}
            >
              <div className="truncate">
                {e.name}
                {e.serviceTitanId != null && (
                  <span className="text-[11px] text-muted font-mono ml-2">#{e.serviceTitanId}</span>
                )}
              </div>
              <div className="text-muted text-[12px] truncate">{e.departmentCode ?? '—'}</div>
              <div>
                <Select
                  value={e.roleCode ?? ''}
                  onChange={(ev) => update(e.id, { roleCode: ev.target.value || null })}
                  disabled={!e.roleLocked}
                  title={e.roleLocked ? 'Set the locked role' : 'Unlock to override'}
                >
                  <option value="">— none —</option>
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                      {!r.active ? ' (archived)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <div className={cn('text-[12px]', e.active ? 'text-up' : 'text-muted')}>
                {e.active ? 'Active' : 'Inactive'}
              </div>
              <div className="text-right">
                <Button
                  variant={e.roleLocked ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => toggleLock(e.id)}
                  title={e.roleLocked ? 'Unlock — return to auto-bucketing' : 'Lock to chosen role'}
                >
                  {e.roleLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
