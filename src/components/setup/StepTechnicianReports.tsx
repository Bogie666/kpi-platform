'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';

export interface TechnicianReportColumnMapping {
  employeeId?: string;
  employeeName?: string;
  completedJobs?: string;
  completedRevenue?: string;
  opportunity?: string;
  salesOpportunity?: string;
  closedOpportunities?: string;
  closeRate?: string;
  totalSales?: string;
  totalJobAverage?: string;
  optionsPerOpportunity?: string;
  membershipsSold?: string;
  leadsSet?: string;
  totalLeadSales?: string;
  technicianBusinessUnit?: string;
  technicianTrade?: string;
}

export interface TechnicianReportConfigDraft {
  id: string;
  label: string;
  roleCode: string;
  departmentCode: string;
  categoryId: string;
  reportId: string;
  active: boolean;
  columnMapping: TechnicianReportColumnMapping;
  detectedFields?: Array<{ name: string; label?: string; dataType?: string }>;
}

export interface StepTechnicianReportsValues {
  reports: TechnicianReportConfigDraft[];
  skip: boolean;
}

interface Option { code: string; name: string }

const DEFAULT_ROLES: Option[] = [
  { code: 'comfort_advisor', name: 'Comfort Advisors' },
  { code: 'hvac_tech', name: 'HVAC Techs' },
  { code: 'hvac_maintenance', name: 'HVAC Maintenance' },
  { code: 'plumbing', name: 'Plumbing' },
  { code: 'electrical', name: 'Electrical' },
  { code: 'commercial_hvac', name: 'Commercial HVAC' },
];

const KPI_FIELDS: Array<{ key: keyof TechnicianReportColumnMapping; label: string; required?: boolean }> = [
  { key: 'employeeId', label: 'Technician ID' },
  { key: 'employeeName', label: 'Technician name', required: true },
  { key: 'completedJobs', label: 'Completed jobs' },
  { key: 'completedRevenue', label: 'Completed revenue' },
  { key: 'opportunity', label: 'Opportunity' },
  { key: 'salesOpportunity', label: 'Sales opportunity' },
  { key: 'closedOpportunities', label: 'Closed opportunities' },
  { key: 'closeRate', label: 'Close rate' },
  { key: 'totalSales', label: 'Total sales' },
  { key: 'totalJobAverage', label: 'Total job average' },
  { key: 'optionsPerOpportunity', label: 'Options per opportunity' },
  { key: 'membershipsSold', label: 'Memberships sold' },
  { key: 'leadsSet', label: 'Leads set / flips' },
  { key: 'totalLeadSales', label: 'Total lead sales' },
  { key: 'technicianBusinessUnit', label: 'Technician business unit' },
  { key: 'technicianTrade', label: 'Technician trade' },
];

const DEFAULT_MAPPING: TechnicianReportColumnMapping = {
  employeeId: 'TechnicianId',
  employeeName: 'Name',
  completedJobs: 'CompletedJobs',
  completedRevenue: 'CompletedRevenue',
  opportunity: 'Opportunity',
  salesOpportunity: 'SalesOpportunity',
  closedOpportunities: 'ClosedOpportunities',
  closeRate: 'CloseRate',
  totalSales: 'TotalSales',
  totalJobAverage: 'TotalJobAverage',
  optionsPerOpportunity: 'OptionsPerOpportunity',
  membershipsSold: 'MembershipsSold',
  leadsSet: 'LeadsSet',
  totalLeadSales: 'TotalLeadSales',
  technicianBusinessUnit: 'TechnicianBusinessUnit',
  technicianTrade: 'TechnicianTrade',
};

function newReport(): TechnicianReportConfigDraft {
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  return {
    id,
    label: 'Technician KPI report',
    roleCode: 'comfort_advisor',
    departmentCode: 'hvac_sales',
    categoryId: 'technician',
    reportId: '',
    active: true,
    columnMapping: { ...DEFAULT_MAPPING },
  };
}

export function StepTechnicianReports({
  saving,
  initialReports,
  divisions,
  onSave,
}: {
  saving: boolean;
  initialReports: TechnicianReportConfigDraft[];
  divisions: Option[];
  onSave: (v: StepTechnicianReportsValues) => void | Promise<void>;
}) {
  const [reports, setReports] = useState<TechnicianReportConfigDraft[]>(
    initialReports.length > 0 ? initialReports : [newReport()],
  );
  const [testing, setTesting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const update = (id: string, patch: Partial<TechnicianReportConfigDraft>) => {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const updateMapping = (id: string, key: keyof TechnicianReportColumnMapping, value: string) => {
    setReports((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, columnMapping: { ...r.columnMapping, [key]: value || undefined } } : r,
      ),
    );
  };

  async function testReport(report: TechnicianReportConfigDraft) {
    setTesting(report.id);
    setMessage(null);
    try {
      const res = await fetch('/api/setup/test-tech-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categoryId: report.categoryId, reportId: report.reportId }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        fields?: Array<{ name: string; label?: string; dataType?: string }>;
        rows?: number;
      };
      if (!j.ok) throw new Error(j.error ?? `Test failed (${res.status})`);
      update(report.id, { detectedFields: j.fields ?? [] });
      setMessage(`Report tested: ${j.rows ?? 0} sample rows, ${j.fields?.length ?? 0} columns detected.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(null);
    }
  }

  const canSave = reports.every(
    (r) => !r.active || (r.label && r.roleCode && r.departmentCode && r.categoryId && r.reportId && (r.columnMapping.employeeId || r.columnMapping.employeeName)),
  );

  return (
    <Panel eyebrow="Technician reports" title="Map ServiceTitan report columns" padding="cozy">
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-muted leading-relaxed max-w-3xl">
          Add the saved ServiceTitan technician KPI reports this tenant uses. Each report can represent a role/division copy, like HVAC Sales, Plumbing, or Electrical. Test the report to detect its columns, then map those columns to dashboard fields.
        </p>

        {message && <div className="text-[12px] text-muted bg-surface-2 border border-border rounded-btn px-3 py-2">{message}</div>}

        {reports.map((r, idx) => {
          const fields = r.detectedFields ?? [];
          const options = fields.map((f) => ({ value: f.name, label: f.label ? `${f.label} (${f.name})` : f.name }));
          return (
            <div key={r.id} className="border border-border rounded-card bg-surface p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-semibold text-text">Report {idx + 1}</div>
                <button
                  type="button"
                  onClick={() => setReports((prev) => prev.filter((x) => x.id !== r.id))}
                  className="text-muted hover:text-down transition-colors"
                  aria-label="Remove report"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Label" value={r.label} onChange={(v) => update(r.id, { label: v })} />
                <Select label="Role" value={r.roleCode} onChange={(v) => update(r.id, { roleCode: v })} options={DEFAULT_ROLES.map((x) => ({ value: x.code, label: x.name }))} />
                <Select label="Division" value={r.departmentCode} onChange={(v) => update(r.id, { departmentCode: v })} options={(divisions.length ? divisions : [{ code: 'hvac_sales', name: 'HVAC Sales' }]).map((x) => ({ value: x.code, label: x.name }))} />
                <Field label="Report category ID" value={r.categoryId} onChange={(v) => update(r.id, { categoryId: v })} />
                <Field label="Report ID" value={r.reportId} onChange={(v) => update(r.id, { reportId: v })} />
                <label className="flex items-end gap-2 text-[12px] text-muted pb-2">
                  <input type="checkbox" checked={r.active} onChange={(e) => update(r.id, { active: e.target.checked })} /> Active
                </label>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" onClick={() => testReport(r)} disabled={!r.reportId || !r.categoryId || testing === r.id}>
                  {testing === r.id ? 'Testing…' : 'Test report / detect columns'}
                </Button>
                {fields.length > 0 && <span className="text-[12px] text-muted">{fields.length} fields detected</span>}
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {KPI_FIELDS.map((f) => (
                  <Select
                    key={f.key}
                    label={f.label}
                    value={r.columnMapping[f.key] ?? ''}
                    onChange={(v) => updateMapping(r.id, f.key, v)}
                    options={[{ value: '', label: 'Not mapped' }, ...(options.length ? options : [{ value: DEFAULT_MAPPING[f.key] ?? '', label: DEFAULT_MAPPING[f.key] ?? '' }])]}
                  />
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-3 flex-wrap">
          <Button type="button" onClick={() => setReports((prev) => [...prev, newReport()])}>
            <Plus className="h-4 w-4" /> Add report
          </Button>
          <Button type="button" variant="primary" disabled={saving || !canSave} onClick={() => onSave({ reports, skip: false })}>
            {saving ? 'Saving…' : 'Save technician reports'}
          </Button>
          <Button type="button" disabled={saving} onClick={() => onSave({ reports: [], skip: true })}>
            Skip for now
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-muted">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="bg-bg border border-border rounded-btn px-3 py-2 text-[13px] text-text focus:outline-none focus:border-accent" />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-muted">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-bg border border-border rounded-btn px-3 py-2 text-[13px] text-text focus:outline-none focus:border-accent">
        {options.map((o) => (
          <option key={`${label}:${o.value}`} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
