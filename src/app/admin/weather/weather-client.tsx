'use client';

/**
 * /admin/weather — configure the TV weather scene's locations.
 *
 * The tenant enters 1-3 US zip codes with an optional display-name
 * override. Zips are geocoded server-side on save; the runtime weather
 * route reads the stored coordinates so display never depends on the
 * geocoder being reachable.
 */
import { useEffect, useState } from 'react';
import { SectionHead } from '@/components/primitives/section-head';
import { Button } from '@/components/primitives/button';

interface SavedLocation {
  key: string;
  name: string;
  zip: string;
  latitude: number;
  longitude: number;
}

interface Draft {
  zip: string;
  name: string;
}

const MAX_LOCATIONS = 3;

export function WeatherConfigClient() {
  const [drafts, setDrafts] = useState<Draft[]>([{ zip: '', name: '' }]);
  const [saved, setSaved] = useState<SavedLocation[] | null>(null);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/weather-config');
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const j = (await res.json()) as { locations: SavedLocation[]; usingDefaults: boolean };
        setSaved(j.locations);
        setUsingDefaults(j.usingDefaults);
        if (j.locations.length > 0) {
          setDrafts(j.locations.map((l) => ({ zip: l.zip, name: l.name })));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const setDraft = (i: number, field: keyof Draft, value: string) => {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)));
  };

  const addRow = () => {
    if (drafts.length < MAX_LOCATIONS) setDrafts((prev) => [...prev, { zip: '', name: '' }]);
  };

  const removeRow = (i: number) => {
    setDrafts((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/weather-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locations: drafts.filter((d) => d.zip.trim().length > 0),
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; locations?: SavedLocation[] };
      if (!j.ok) throw new Error(j.error ?? `Failed (${res.status})`);
      setSaved(j.locations ?? []);
      setUsingDefaults(false);
      if (j.locations) setDrafts(j.locations.map((l) => ({ zip: l.zip, name: l.name })));
      setFlash('Saved. The TV weather scene will pick this up within 10 minutes (edge cache).');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <SectionHead
        eyebrow="Display"
        title="Weather locations"
      />
      <p className="text-[13px] text-muted -mt-3 max-w-xl">
        Choose up to 3 locations for the TV weather scene. Enter a US zip code; the city
        name auto-fills from the zip but you can override it (e.g. show a market name
        instead of the zip&apos;s city).
      </p>

      {!loaded && <div className="text-[13px] text-muted">Loading…</div>}

      {loaded && (
        <>
          {usingDefaults && (
            <div className="text-[12px] text-muted rounded-panel border border-border bg-surface px-3 py-2">
              No locations configured yet — the weather scene is showing built-in defaults.
            </div>
          )}

          <div className="flex flex-col gap-2">
            {drafts.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={d.zip}
                  onChange={(e) => setDraft(i, 'zip', e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                  placeholder="Zip code"
                  inputMode="numeric"
                  className="w-28 rounded-btn border border-border bg-surface px-3 py-2 text-[13px] font-mono tabular-nums outline-none focus:border-[color:var(--accent)]"
                />
                <input
                  value={d.name}
                  onChange={(e) => setDraft(i, 'name', e.target.value)}
                  placeholder="Display name (optional)"
                  className="flex-1 rounded-btn border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-[color:var(--accent)]"
                />
                <button
                  onClick={() => removeRow(i)}
                  disabled={drafts.length <= 1}
                  className="text-[12px] text-muted hover:text-down disabled:opacity-30 px-2 py-1"
                  aria-label={`Remove location ${i + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={addRow} disabled={drafts.length >= MAX_LOCATIONS}>
              + Add location
            </Button>
            <span className="text-[11px] text-muted">
              {drafts.length}/{MAX_LOCATIONS}
            </span>
            <div className="ml-auto">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>

          {error && <div className="text-[12px] text-down">⚠ {error}</div>}
          {flash && <div className="text-[12px] text-up">{flash}</div>}

          {saved && saved.length > 0 && (
            <div className="flex flex-col gap-1 text-[12px] text-muted font-mono tabular-nums">
              <span className="text-eyebrow uppercase tracking-[0.08em] not-italic">Currently saved</span>
              {saved.map((l) => (
                <span key={l.key}>
                  {l.name} · {l.zip} · {l.latitude.toFixed(4)}, {l.longitude.toFixed(4)}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
