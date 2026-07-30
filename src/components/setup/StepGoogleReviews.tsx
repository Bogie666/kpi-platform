'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
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

interface DiscoveredLocation {
  name: string;
  accountId: string;
  locationId: string;
  title: string;
  address?: string;
  phone?: string;
  slug: string;
}

export function StepGoogleReviews({
  initialCreds,
  initialLocations,
  onSave,
  saving,
  mode = 'wizard',
  connectedEmail = null,
  hasConnection = false,
}: {
  initialCreds: Partial<StepGoogleValues>;
  initialLocations: GoogleLocationDraft[];
  onSave: (payload: {
    creds: StepGoogleValues;
    locations: GoogleLocationDraft[];
    skip: boolean;
  }) => void | Promise<void>;
  saving?: boolean;
  mode?: 'wizard' | 'admin';
  // When the server already has a stored refresh token, we show "connected"
  // state and let the admin re-discover locations without re-authorizing.
  connectedEmail?: string | null;
  hasConnection?: boolean;
}) {
  const [creds] = useState<StepGoogleValues>({
    google_client_id: initialCreds.google_client_id ?? '',
    google_client_secret: initialCreds.google_client_secret ?? '',
    google_refresh_token: initialCreds.google_refresh_token ?? '',
  });
  const [locations, setLocations] = useState<GoogleLocationDraft[]>(
    initialLocations.length ? initialLocations : [],
  );
  const [discovered, setDiscovered] = useState<DiscoveredLocation[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  // Read ?gconnect=success|failed from the OAuth callback redirect so we can
  // surface the result and auto-run discovery on success.
  const [connectFlash, setConnectFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('gconnect');
    if (g === 'success') {
      const email = params.get('email');
      setConnectFlash({ ok: true, msg: email ? `Connected as ${email}.` : 'Connected to Google.' });
      void discover();
    } else if (g === 'failed') {
      setConnectFlash({ ok: false, msg: `Google connection failed: ${params.get('reason') ?? 'unknown'}` });
    }
    // clean the query so a refresh doesn't re-trigger
    if (g) {
      const u = new URL(window.location.href);
      ['gconnect', 'reason', 'email', 'step'].forEach((k) => u.searchParams.delete(k));
      window.history.replaceState({}, '', u.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function discover() {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const res = await fetch('/api/setup/google-discover');
      const j = (await res.json()) as { ok?: boolean; error?: string; locations?: DiscoveredLocation[] };
      if (!j.ok) throw new Error(j.error ?? 'Discovery failed');
      setDiscovered(j.locations ?? []);
      // Pre-select any locations already saved (match on locationId).
      const savedIds = new Set(locations.map((l) => l.locationId));
      const preselected = (j.locations ?? [])
        .filter((d) => savedIds.has(d.locationId))
        .map((d) => toDraft(d));
      if (preselected.length) setLocations(preselected);
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(false);
    }
  }

  function toDraft(d: DiscoveredLocation): GoogleLocationDraft {
    return { name: d.title, accountId: d.accountId, locationId: d.locationId, slug: d.slug };
  }

  function toggleDiscovered(d: DiscoveredLocation, checked: boolean) {
    setLocations((prev) => {
      if (checked) {
        if (prev.some((l) => l.locationId === d.locationId)) return prev;
        return [...prev, toDraft(d)];
      }
      return prev.filter((l) => l.locationId !== d.locationId);
    });
  }

  // manual editing helpers
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
    const cleaned = locations.filter(
      (l) => l.slug.trim() && l.accountId.trim() && l.locationId.trim(),
    );
    void onSave({ creds, locations: cleaned, skip: false });
  }

  const isSelected = (d: DiscoveredLocation) => locations.some((l) => l.locationId === d.locationId);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        eyebrow={mode === 'wizard' ? 'Step 5 of 6' : 'Settings'}
        title="Google reviews"
        right={
          <div className="flex items-center gap-2">
            {mode === 'wizard' && (
              <Button variant="ghost" disabled={saving} onClick={() => submit(true)}>
                Skip for now
              </Button>
            )}
            <Button variant="primary" disabled={saving} onClick={() => submit(false)}>
              {saving ? 'Saving…' : mode === 'wizard' ? 'Save and continue' : 'Save changes'}
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
          Connect Google Business Profile to sync customer reviews into the dashboard.
          Just click <strong>Sign in with Google</strong> and authorize the account that
          manages your locations — no API keys or developer setup required. This step is
          optional; you can finish it later from Admin → Google reviews.
        </p>
      </Panel>

      {connectFlash && (
        <div
          className={
            connectFlash.ok
              ? 'text-[12px] text-up bg-up-bg border border-up/30 rounded-btn px-3 py-2'
              : 'text-[12px] text-down bg-down-bg border border-down/30 rounded-btn px-3 py-2'
          }
        >
          {connectFlash.msg}
        </div>
      )}

      <Panel eyebrow="Connection" title="Google account">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/google/oauth/start">
            <Button variant="primary">
              {/* simple G glyph */}
              <span
                aria-hidden="true"
                className="inline-grid place-items-center h-4 w-4 rounded-full bg-white text-[10px] font-bold text-black mr-1.5"
              >
                G
              </span>
              {hasConnection || connectFlash?.ok ? 'Reconnect Google' : 'Sign in with Google'}
            </Button>
          </a>

          {(hasConnection || connectFlash?.ok) && (
            <Button variant="default" disabled={discovering} onClick={() => void discover()}>
              <RefreshCw className={`h-3.5 w-3.5 ${discovering ? 'animate-spin' : ''}`} />
              {discovering ? 'Loading locations…' : 'Refresh locations'}
            </Button>
          )}

          {connectedEmail && !connectFlash && (
            <span className="text-[12px] text-muted">
              Connected as <strong className="text-text">{connectedEmail}</strong>
            </span>
          )}
        </div>

        {discoverError && (
          <div className="mt-3 text-[12px] text-down bg-down-bg border border-down/30 rounded-btn px-3 py-2">
            {discoverError}
          </div>
        )}
      </Panel>

      {/* Discovered location picker */}
      {discovered && (
        <Panel eyebrow="Review locations" title={`Found ${discovered.length} location${discovered.length === 1 ? '' : 's'}`}>
          {discovered.length === 0 ? (
            <p className="text-[13px] text-muted">
              No Google Business Profile locations found for this account. Make sure you
              signed in with the Google account that manages the business listings.
            </p>
          ) : (
            <>
              <p className="text-[13px] text-muted leading-relaxed mb-3 max-w-2xl">
                Check the locations you want the dashboard to track reviews for.
              </p>
              <div className="flex flex-col gap-2">
                {discovered.map((d) => (
                  <label
                    key={d.locationId}
                    className="flex items-start gap-3 border border-border rounded-panel p-3 cursor-pointer hover:bg-surface-2/40 transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={isSelected(d)}
                      onChange={(e) => toggleDiscovered(d, e.target.checked)}
                    />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-text">{d.title}</div>
                      {d.address && <div className="text-[12px] text-muted">{d.address}</div>}
                      <div className="text-[11px] text-muted font-mono mt-0.5">
                        {d.accountId} · {d.name}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </Panel>
      )}

      {/* Manual fallback — collapsed by default */}
      <Panel
        eyebrow="Advanced"
        title="Enter locations manually"
        right={
          <Button variant="ghost" size="sm" onClick={() => setShowManual((v) => !v)}>
            {showManual ? 'Hide' : 'Show'}
          </Button>
        }
      >
        {showManual && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
                Fallback for edge cases. Each row is one Google Business Profile location;
                the slug is the short id used in dashboard filters (e.g. "main", "east-side").
              </p>
              <Button variant="default" size="sm" onClick={addLocation}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
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
                        updateLocation(i, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-') })
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
              {locations.length === 0 && (
                <p className="text-[12px] text-muted">No locations yet.</p>
              )}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
