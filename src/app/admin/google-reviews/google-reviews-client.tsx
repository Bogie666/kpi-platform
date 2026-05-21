'use client';

import { useEffect, useState } from 'react';
import { SectionHead } from '@/components/primitives/section-head';
import {
  StepGoogleReviews,
  type GoogleLocationDraft,
  type StepGoogleValues,
} from '@/components/setup/StepGoogleReviews';

interface ServerState {
  hasCreds: {
    google_client_id: boolean;
    google_client_secret: boolean;
    google_refresh_token: boolean;
  };
  locations: GoogleLocationDraft[];
}

export function GoogleReviewsClient() {
  const [state, setState] = useState<ServerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch('/api/admin/google-config');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const j = (await res.json()) as ServerState;
      setState(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSave(payload: {
    creds: StepGoogleValues;
    locations: GoogleLocationDraft[];
    skip: boolean;
  }) {
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/google-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          creds: payload.creds,
          locations: payload.locations,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? `Failed (${res.status})`);
      setFlash('Saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!state && !error) {
    return <div className="text-[13px] text-muted">Loading…</div>;
  }

  // Inputs always start empty for the cred fields (they're sensitive — we
  // don't ship the existing values back to the client). The form hints
  // tell the admin which ones are already set so they know they can leave
  // them alone.
  const initialCreds: Partial<StepGoogleValues> = {
    google_client_id: '',
    google_client_secret: '',
    google_refresh_token: '',
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHead eyebrow="Admin" title="Google reviews" />

      {state && (
        <div className="text-[12px] text-muted bg-surface border border-border rounded-btn px-3 py-2 max-w-2xl">
          Currently set: client ID{' '}
          <strong className={state.hasCreds.google_client_id ? 'text-up' : 'text-down'}>
            {state.hasCreds.google_client_id ? 'yes' : 'no'}
          </strong>
          {' · '}
          client secret{' '}
          <strong className={state.hasCreds.google_client_secret ? 'text-up' : 'text-down'}>
            {state.hasCreds.google_client_secret ? 'yes' : 'no'}
          </strong>
          {' · '}
          refresh token{' '}
          <strong className={state.hasCreds.google_refresh_token ? 'text-up' : 'text-down'}>
            {state.hasCreds.google_refresh_token ? 'yes' : 'no'}
          </strong>
          <div className="mt-1">
            Leave a credential field blank to keep the existing value; type a new value to replace it.
          </div>
        </div>
      )}

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

      {state && (
        <StepGoogleReviews
          mode="admin"
          saving={saving}
          initialCreds={initialCreds}
          initialLocations={state.locations}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
