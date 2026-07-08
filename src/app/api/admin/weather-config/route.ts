/**
 * /api/admin/weather-config — manage the tenant's weather locations.
 *
 * The admin enters 1-3 US zip codes (+ optional display name override).
 * We geocode each zip at SAVE time via Zippopotam (free, no key) and
 * persist `[{key, name, zip, latitude, longitude}]` into company_config
 * `weather_cities`. The runtime /api/kpi/weather route keeps reading
 * lat/lon directly, so weather never depends on the geocoder being up.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getConfigTyped, setConfig } from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LOCATIONS = 3;

export interface WeatherLocationConfig {
  key: string;
  name: string;
  zip?: string;
  latitude: number;
  longitude: number;
}

interface LocationDraft {
  zip: string;
  name?: string;
}

async function geocodeZip(zip: string): Promise<{ name: string; latitude: number; longitude: number }> {
  const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, {
    cache: 'no-store',
  });
  if (res.status === 404) throw new Error(`Zip ${zip} not found`);
  if (!res.ok) throw new Error(`Geocoder error for ${zip} (${res.status})`);
  const json = (await res.json()) as {
    places?: Array<{ 'place name': string; latitude: string; longitude: string }>;
  };
  const place = json.places?.[0];
  const lat = Number(place?.latitude);
  const lon = Number(place?.longitude);
  if (!place || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Zip ${zip} returned no usable coordinates`);
  }
  return { name: place['place name'], latitude: lat, longitude: lon };
}

export async function GET(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  const cfg = await getConfigTyped<WeatherLocationConfig[]>('weather_cities');
  const locations = Array.isArray(cfg) ? cfg : [];
  return NextResponse.json({
    locations: locations.map((l) => ({
      key: l.key,
      name: l.name,
      zip: l.zip ?? '',
      latitude: l.latitude,
      longitude: l.longitude,
    })),
    usingDefaults: locations.length === 0,
  });
}

export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  let body: { locations?: LocationDraft[] };
  try {
    body = (await req.json()) as { locations?: LocationDraft[] };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const drafts = (body.locations ?? [])
    .map((l) => ({ zip: String(l.zip ?? '').trim(), name: String(l.name ?? '').trim() }))
    .filter((l) => l.zip.length > 0);

  if (drafts.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Provide at least one zip code' },
      { status: 400 },
    );
  }
  if (drafts.length > MAX_LOCATIONS) {
    return NextResponse.json(
      { ok: false, error: `Maximum ${MAX_LOCATIONS} locations` },
      { status: 400 },
    );
  }
  for (const d of drafts) {
    if (!/^\d{5}$/.test(d.zip)) {
      return NextResponse.json(
        { ok: false, error: `"${d.zip}" is not a valid 5-digit US zip` },
        { status: 400 },
      );
    }
  }
  const zipSet = new Set(drafts.map((d) => d.zip));
  if (zipSet.size !== drafts.length) {
    return NextResponse.json({ ok: false, error: 'Duplicate zip codes' }, { status: 400 });
  }

  // Geocode every zip before writing anything — all-or-nothing save.
  let resolved: WeatherLocationConfig[];
  try {
    resolved = await Promise.all(
      drafts.map(async (d, i) => {
        const geo = await geocodeZip(d.zip);
        const name = d.name || geo.name;
        return {
          key: `${d.zip}-${i}`,
          name,
          zip: d.zip,
          latitude: geo.latitude,
          longitude: geo.longitude,
        };
      }),
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Geocoding failed' },
      { status: 422 },
    );
  }

  await setConfig('weather_cities', JSON.stringify(resolved), {
    type: 'json',
    updatedBy: 'admin:weather',
  });

  return NextResponse.json({ ok: true, locations: resolved });
}
