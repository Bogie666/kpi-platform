'use client';

import { useState } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';

export interface EstimateAnalysisReportValues {
  estimate_analysis_report_category: string;
  estimate_analysis_report_id: string;
  skip: boolean;
}

export function StepEstimateAnalysisReport({
  saving,
  initial,
  onSave,
}: {
  saving: boolean;
  initial: Partial<EstimateAnalysisReportValues>;
  onSave: (values: EstimateAnalysisReportValues) => void | Promise<void>;
}) {
  const [category, setCategory] = useState(initial.estimate_analysis_report_category ?? 'operations');
  const [reportId, setReportId] = useState(initial.estimate_analysis_report_id ?? '');
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function testReport() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/setup/test-estimate-analysis-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categoryId: category, reportId }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: number;
        fields?: Array<{ name: string }>;
      };
      if (!body.ok) throw new Error(body.error ?? `Test failed (${res.status})`);
      const names = (body.fields ?? []).map((f) => f.name);
      const required = ['EstimateId', 'OpportunityStatus', 'CreationDate'];
      const missing = required.filter((name) => !names.includes(name));
      setMessage(
        missing.length
          ? `Connected (${body.rows ?? 0} sample rows), but missing expected fields: ${missing.join(', ')}. Verify this is an Estimate Analysis report.`
          : `Connected: ${body.rows ?? 0} sample rows and ${names.length} columns detected.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  const valid = Boolean(category.trim() && reportId.trim());
  return (
    <Panel eyebrow="Estimate analysis" title="Connect the unsold-estimate report" padding="cozy">
      <div className="flex flex-col gap-5 max-w-3xl">
        <p className="text-[13px] text-muted leading-relaxed">
          The Financial potential-revenue panel and Analyze tab use this saved ServiceTitan report for won, dismissed, and open estimates. Map the report for this tenant before the first sync; the live Open Estimates API remains the Financial fallback between report refreshes.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Report category ID" value={category} onChange={setCategory} />
          <Field label="Report ID" value={reportId} onChange={setReportId} />
        </div>
        {message && <div className="text-[12px] text-muted bg-surface-2 border border-border rounded-btn px-3 py-2">{message}</div>}
        <div className="flex items-center gap-3 flex-wrap">
          <Button type="button" onClick={testReport} disabled={!valid || testing}>
            {testing ? 'Testing…' : 'Test report / detect columns'}
          </Button>
          <Button type="button" variant="primary" disabled={saving || !valid} onClick={() => onSave({ estimate_analysis_report_category: category.trim(), estimate_analysis_report_id: reportId.trim(), skip: false })}>
            {saving ? 'Saving…' : 'Save estimate report'}
          </Button>
          <Button type="button" disabled={saving} onClick={() => onSave({ estimate_analysis_report_category: category.trim(), estimate_analysis_report_id: reportId.trim(), skip: true })}>
            Skip for now
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-muted">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="bg-bg border border-border rounded-btn px-3 py-2 text-[13px] text-text focus:outline-none focus:border-accent" />
    </label>
  );
}
