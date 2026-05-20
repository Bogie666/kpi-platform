'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Field, Input } from '@/components/primitives/input';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/setup';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });
      if (res.status === 401) {
        setError('Wrong password.');
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Unexpected response: ${res.status}`);
        return;
      }
      // Use a full navigation so middleware re-evaluates the new cookie.
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel className="w-full max-w-md">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <h1 className="text-panel mb-1">KPI Platform setup</h1>
          <p className="text-[13px] text-muted leading-relaxed">
            Enter the shared admin password to continue. This protects the setup
            wizard and admin pages while the platform is being configured.
          </p>
        </div>
        <Field label="Admin password">
          <Input
            type="password"
            autoFocus
            placeholder="ADMIN_PASSWORD"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </Field>
        {error && <div className="text-[12px] text-down">{error}</div>}
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Checking…' : 'Unlock'}
        </Button>
      </form>
    </Panel>
  );
}
