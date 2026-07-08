'use client';

/**
 * Optional wizard step: weather locations for the TV weather scene.
 *
 * The tenant enters 1-3 US zip codes (optional display-name override).
 * Saving POSTs to /api/admin/weather-config, which geocodes each zip
 * server-side (all-or-nothing) and persists `weather_cities`. Skipping
 * leaves the built-in defaults in place — this step never blocks setup.
 */
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Field, Input } from '@/components/primitives/input';

export interface WeatherLocationDraft {
  zip: string;
  name: string;
}

const MAX_LOCATIONS = 3;

export function StepWeather({
  initialLocations,
  onSave,
  saving,
}: {
  initialLocations: WeatherLocationDraft[];
  onSave: (payload: { locations: WeatherLocationDraft[]; skip: boolean }) => void | Promise<void>;
  saving?: boolean;
}) {
  const [locations, setLocations] = useState<WeatherLocationDraft[]>(
    initialLocations.length ? initialLocations : [{ zip: '', name: '' }],
  );
  const [localError, setLocalError] = useState<string | null>(null);

  function addLocation() {
    if (locations.length < MAX_LOCATIONS) setLocations([...locations, { zip: '', name: '' }]);
  }

  function updateLocation(i: number, patch: Partial<WeatherLocationDraft>) {
    setLocations((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function removeLocation(i: number) {
    setLocations((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function submit(skip: boolean) {
    setLocalError(null);
    if (skip) {
      void onSave({ locations: [], skip: true });
      return;
    }
    const cleaned = locations
      .map((l) => ({ zip: l.zip.trim(), name: l.name.trim() }))
      .filter((l) => l.zip.length > 0);
    if (cleaned.length === 0) {
      setLocalError('Enter at least one zip code, or skip this step.');
      return;
    }
    const bad = cleaned.find((l) => !/^\d{5}$/.test(l.zip));
    if (bad) {
      setLocalError(`"${bad.zip}" is not a valid 5-digit US zip.`);
      return;
    }
    void onSave({ locations: cleaned, skip: false });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        eyebrow="Step 6 of 6 · Optional"
        title="Weather locations"
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={saving} onClick={() => submit(true)}>
              Skip — use defaults
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => submit(false)}>
              {saving ? 'Saving…' : 'Save & finish'}
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-muted leading-relaxed max-w-2xl mb-4">
          The TV dashboard includes a weather scene. Pick up to {MAX_LOCATIONS} locations
          by US zip code — the city name auto-fills from the zip, or set your own display
          name (e.g. a market name). You can change this later under Admin → Weather.
        </p>

        <div className="flex flex-col gap-2">
          {locations.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={i === 0 ? 'Zip code' : ''} className="w-32">
                <Input
                  value={l.zip}
                  inputMode="numeric"
                  placeholder="75023"
                  onChange={(e) =>
                    updateLocation(i, { zip: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) })
                  }
                />
              </Field>
              <Field label={i === 0 ? 'Display name (optional)' : ''} className="flex-1">
                <Input
                  value={l.name}
                  placeholder="Auto-fills from zip"
                  onChange={(e) => updateLocation(i, { name: e.target.value })}
                />
              </Field>
              <button
                type="button"
                onClick={() => removeLocation(i)}
                disabled={locations.length <= 1}
                className="h-9 w-9 grid place-items-center rounded-btn text-muted hover:text-down disabled:opacity-30"
                aria-label={`Remove location ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={locations.length >= MAX_LOCATIONS}
            onClick={addLocation}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add location
          </Button>
          <span className="text-[11px] text-muted">
            {locations.length}/{MAX_LOCATIONS}
          </span>
        </div>

        {localError && <div className="text-[12px] text-down mt-3">⚠ {localError}</div>}
      </Panel>
    </div>
  );
}
