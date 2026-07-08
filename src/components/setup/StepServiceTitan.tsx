'use client';

import { useState } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Field, Input } from '@/components/primitives/input';

export interface StepServiceTitanValues {
  st_tenant_id: string;
  st_client_id: string;
  st_client_secret: string;
  st_app_key: string;
}

type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' } | { kind: 'err'; msg: string };

export function StepServiceTitan({
  initial,
  onSave,
  saving,
}: {
  initial: Partial<StepServiceTitanValues>;
  onSave: (v: StepServiceTitanValues) => void | Promise<void>;
  saving?: boolean;
}) {
  const [values, setValues] = useState<StepServiceTitanValues>({
    st_tenant_id: initial.st_tenant_id ?? '',
    st_client_id: initial.st_client_id ?? '',
    st_client_secret: initial.st_client_secret ?? '',
    st_app_key: initial.st_app_key ?? '',
  });
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  function set<K extends keyof StepServiceTitanValues>(k: K, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
    if (test.kind === 'ok' || test.kind === 'err') setTest({ kind: 'idle' });
  }

  async function runTest() {
    setTest({ kind: 'testing' });
    try {
      const res = await fetch('/api/setup/test-st', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: values.st_tenant_id.trim(),
          clientId: values.st_client_id.trim(),
          clientSecret: values.st_client_secret.trim(),
          appKey: values.st_app_key.trim(),
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (j.ok) setTest({ kind: 'ok' });
      else setTest({ kind: 'err', msg: j.error ?? `Request failed (${res.status})` });
    } catch (err) {
      setTest({ kind: 'err', msg: err instanceof Error ? err.message : String(err) });
    }
  }

  const canContinue = test.kind === 'ok';
  const canTest =
    !!values.st_tenant_id.trim() &&
    !!values.st_client_id.trim() &&
    !!values.st_client_secret.trim() &&
    !!values.st_app_key.trim();

  return (
    <Panel
      eyebrow="Step 2 of 6"
      title="ServiceTitan"
      right={
        <div className="flex items-center gap-2">
          <Button variant="default" disabled={!canTest || test.kind === 'testing'} onClick={runTest}>
            {test.kind === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
          <Button
            variant="primary"
            disabled={saving || !canContinue}
            onClick={() => void onSave(values)}
          >
            {saving ? 'Saving…' : 'Save & continue'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 max-w-2xl">
        <p className="text-[13px] text-muted leading-relaxed">
          Paste your ServiceTitan API credentials. Test the connection — it must
          pass before you can continue. Credentials are stored encrypted at rest
          in your database and never leave it except to call ST's API.
        </p>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <Field label="Tenant ID">
            <Input value={values.st_tenant_id} onChange={(e) => set('st_tenant_id', e.target.value)} />
          </Field>
          <Field label="App key">
            <Input
              type="password"
              value={values.st_app_key}
              onChange={(e) => set('st_app_key', e.target.value)}
            />
          </Field>
          <Field label="Client ID">
            <Input value={values.st_client_id} onChange={(e) => set('st_client_id', e.target.value)} />
          </Field>
          <Field label="Client secret">
            <Input
              type="password"
              value={values.st_client_secret}
              onChange={(e) => set('st_client_secret', e.target.value)}
            />
          </Field>
        </div>
        {test.kind === 'ok' && (
          <div className="text-[12px] text-up bg-up-bg border border-up/30 rounded-btn px-3 py-2">
            Connection successful — tenant ID and app key both verified.
          </div>
        )}
        {test.kind === 'err' && (
          <div className="text-[12px] text-down bg-down-bg border border-down/30 rounded-btn px-3 py-2">
            {test.msg}
          </div>
        )}
      </div>
    </Panel>
  );
}
