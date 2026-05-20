'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Field, Input } from '@/components/primitives/input';

export interface StepGoogleValues {
  google_client_id: string;
  google_client_secret: string;
  google_refresh_token: string;
}

export interface GoogleLocationDraft {
  name: string;
  accountId: string;
  locationId: string;
  slug: string;
}

export function StepGoogleReviews({
  initialCreds,
  initialLocations,
  onSave,
  saving,
}: {
  initialCreds: Partial<StepGoogleValues>;
  initialLocations: GoogleLocationDraft[];
  onSave: (payload: {
    creds: StepGoogleValues;
    locations: GoogleLocationDraft[];
    skip: boolean;
  }) => void | Promise<void>;
  saving?: boolean;
}) {
  const [creds, setCreds] = useState<StepGoogleValues>({
    google_client_id: initialCreds.google_client_id ?? '',
    google_client_secret: initialCreds.google_client_secret ?? '',
    google_refresh_token: initialCreds.google_refresh_token ?? '',
  });
  const [locations, setLocations] = useState<GoogleLocationDraft[]>(
    initialLocations.length ? initialLocations : [{ name: '', accountId: '', locationId: '', slug: '' }],
  );

  function addLocation() {
    setLocations([...locations, { name: '', accountId: '', locationId: '', slug: '' }]);
  }

  function updateLocation(i: number, patch: Partial<GoogleLocationDraft>) {
    setLocations((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function removeLocation(i: number) {
    setLocations((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit(skip: boolean) {
    if (skip) {
      void onSave({ creds, locations: [], skip: true });
      return;
    }
    // Drop empty rows.
    const cleaned = locations.filter((l) => l.slug.trim() && l.accountId.trim() && l.locationId.trim());
    void onSave({ creds, locations: cleaned, skip: false });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        eyebrow="Step 4 of 4"
        title="Google reviews"
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={saving} onClick={() => submit(true)}>
              Skip for now
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => submit(false)}>
              {saving ? 'Saving…' : 'Finish setup'}
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
          Connect Google Business Profile to sync customer reviews into the
          dashboard. You'll need an OAuth refresh token for an account that
          owns the locations you want to track. If you don't have these set
          up yet, skip — you can finish this step from the admin page later.
        </p>
      </Panel>

      <Panel eyebrow="OAuth credentials" title="Google API">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 max-w-3xl">
          <Field label="Client ID">
            <Input
              value={creds.google_client_id}
              onChange={(e) => setCreds({ ...creds, google_client_id: e.target.value })}
            />
          </Field>
          <Field label="Client secret">
            <Input
              type="password"
              value={creds.google_client_secret}
              onChange={(e) => setCreds({ ...creds, google_client_secret: e.target.value })}
            />
          </Field>
          <Field label="Refresh token" className="sm:col-span-2">
            <Input
              type="password"
              value={creds.google_refresh_token}
              onChange={(e) => setCreds({ ...creds, google_refresh_token: e.target.value })}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        eyebrow="Review locations"
        title="Locations to monitor"
        right={
          <Button variant="default" onClick={addLocation}>
            <Plus className="h-3.5 w-3.5" />
            Add location
          </Button>
        }
      >
        <p className="text-[13px] text-muted leading-relaxed mb-3 max-w-2xl">
          Each row is one Google Business Profile location. The slug is the
          short id used in dashboard filters (e.g. "main", "east-side").
        </p>
        <div className="flex flex-col gap-2">
          {locations.map((loc, i) => (
            <div
              key={i}
              className="border border-border rounded-panel p-3 grid gap-3"
              style={{ gridTemplateColumns: 'repeat(4, 1fr) auto' }}
            >
              <Field label="Display name">
                <Input value={loc.name} onChange={(e) => updateLocation(i, { name: e.target.value })} />
              </Field>
              <Field label="Account ID">
                <Input value={loc.accountId} onChange={(e) => updateLocation(i, { accountId: e.target.value })} />
              </Field>
              <Field label="Location ID">
                <Input value={loc.locationId} onChange={(e) => updateLocation(i, { locationId: e.target.value })} />
              </Field>
              <Field label="Slug">
                <Input
                  value={loc.slug}
                  onChange={(e) =>
                    updateLocation(i, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })
                  }
                />
              </Field>
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={() => removeLocation(i)}>
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
