/**
 * /api/kpi/weather — current conditions + 7-day forecast for the tenant's
 * market cities from Open-Meteo.
 *
 * Open-Meteo is free, requires no API key, and has no signup. This route
 * fans out one request per city, normalizes the payload, and returns it in
 * the dashboard's standard `{ data }` envelope. Used by the TV weather scene.
 *
 * Plug-and-play: cities come from company_config key `weather_cities`
 * (config_type='json', shape: [{key,name,latitude,longitude}, ...]) with
 * the tenant timezone from `timezone`. Falls back to DFW-market defaults
 * when unset.
 */
import { NextResponse } from 'next/server';
import { getConfigTyped } from '@/lib/config-service';

export const dynamic = 'force-dynamic';
// Cache at the edge for 10 minutes — weather doesn't need per-request freshness
// and this protects Open-Meteo from a wall of TVs hammering it.
export const revalidate = 600;

interface CityConfig {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
}

const DEFAULT_CITIES: CityConfig[] = [
  { key: 'plano', name: 'Plano', latitude: 33.0198, longitude: -96.6989 },
  { key: 'rockwall', name: 'Rockwall', latitude: 32.9312, longitude: -96.4597 },
  { key: 'tyler', name: 'Tyler', latitude: 32.3513, longitude: -95.3011 },
];

export interface WeatherDay {
  date: string; // ISO yyyy-mm-dd, local to America/Chicago
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipProbability: number;
}

export interface CityWeather {
  key: string;
  name: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    weatherCode: number;
    humidity: number;
    windSpeed: number;
  };
  daily: WeatherDay[];
  error?: string;
}

export interface WeatherResponse {
  cities: CityWeather[];
  asOf: string;
}

async function loadCities(): Promise<CityConfig[]> {
  try {
    const cfg = await getConfigTyped<CityConfig[]>('weather_cities');
    if (Array.isArray(cfg) && cfg.length > 0) {
      const valid = cfg.filter(
        (c) => c && typeof c.key === 'string' && typeof c.name === 'string'
          && Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
      );
      if (valid.length > 0) return valid.slice(0, 3);
    }
  } catch {
    // fall through to defaults — weather must never hard-fail the TV
  }
  return DEFAULT_CITIES;
}

async function loadTz(): Promise<string> {
  try {
    return (await getConfigTyped<string>('timezone')) ?? 'America/Chicago';
  } catch {
    return 'America/Chicago';
  }
}

function buildUrl(city: CityConfig, tz: string): string {
  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: tz,
    forecast_days: '7',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function fetchCity(city: CityConfig, tz: string): Promise<CityWeather> {
  try {
    const res = await fetch(buildUrl(city, tz), { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const json = await res.json();
    const cur = json.current ?? {};
    const d = json.daily ?? {};
    const days: WeatherDay[] = (d.time ?? []).map((date: string, i: number) => ({
      date,
      weatherCode: d.weather_code?.[i] ?? 0,
      tempMax: Math.round(d.temperature_2m_max?.[i] ?? 0),
      tempMin: Math.round(d.temperature_2m_min?.[i] ?? 0),
      precipProbability: d.precipitation_probability_max?.[i] ?? 0,
    }));
    return {
      key: city.key,
      name: city.name,
      current: {
        temperature: Math.round(cur.temperature_2m ?? 0),
        apparentTemperature: Math.round(cur.apparent_temperature ?? 0),
        weatherCode: cur.weather_code ?? 0,
        humidity: Math.round(cur.relative_humidity_2m ?? 0),
        windSpeed: Math.round(cur.wind_speed_10m ?? 0),
      },
      daily: days,
    };
  } catch (err) {
    return {
      key: city.key,
      name: city.name,
      current: { temperature: 0, apparentTemperature: 0, weatherCode: 0, humidity: 0, windSpeed: 0 },
      daily: [],
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}

export async function GET() {
  const [cityList, tz] = await Promise.all([loadCities(), loadTz()]);
  const cities = await Promise.all(cityList.map((c) => fetchCity(c, tz)));
  const body: WeatherResponse = { cities, asOf: new Date().toISOString() };
  return NextResponse.json({ data: body });
}
