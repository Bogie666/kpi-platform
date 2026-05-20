'use client';

import { useState } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Field, Input, Select } from '@/components/primitives/input';

const TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
] as const;

export interface StepCompanyValues {
  company_name: string;
  company_logo_url: string;
  timezone: string;
}

export function StepCompany({
  initial,
  onSave,
  saving,
}: {
  initial: Partial<StepCompanyValues>;
  onSave: (v: StepCompanyValues) => void | Promise<void>;
  saving?: boolean;
}) {
  const [values, setValues] = useState<StepCompanyValues>({
    company_name: initial.company_name ?? '',
    company_logo_url: initial.company_logo_url ?? '',
    timezone: initial.timezone ?? 'America/Chicago',
  });
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!values.company_name.trim()) {
      setError('Company name is required');
      return;
    }
    setError(null);
    void onSave(values);
  }

  return (
    <Panel
      eyebrow="Step 1 of 4"
      title="Company"
      right={
        <Button variant="primary" disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : 'Save & continue'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 max-w-2xl">
        <p className="text-[13px] text-muted leading-relaxed">
          Basic identity for your dashboard. The name appears in the nav bar and
          browser title; the timezone determines which day "today" rolls over on.
        </p>
        <Field label="Company name" hint="Shown in the dashboard header.">
          <Input
            placeholder="e.g. Acme Heating & Air"
            value={values.company_name}
            onChange={(e) => setValues({ ...values, company_name: e.target.value })}
          />
        </Field>
        <Field label="Logo URL" hint="Optional — paste a URL to your logo (PNG/SVG recommended).">
          <Input
            type="url"
            placeholder="https://…/logo.png"
            value={values.company_logo_url}
            onChange={(e) => setValues({ ...values, company_logo_url: e.target.value })}
          />
        </Field>
        <Field label="Timezone" hint="Used for every date-rollover calculation in the dashboard.">
          <Select
            value={values.timezone}
            onChange={(e) => setValues({ ...values, timezone: e.target.value })}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        {error && <div className="text-[12px] text-down">{error}</div>}
      </div>
    </Panel>
  );
}
