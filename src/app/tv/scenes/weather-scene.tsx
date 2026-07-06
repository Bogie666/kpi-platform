'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudHail,
  Snowflake,
  CloudRainWind,
  CloudLightning,
  Droplets,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { ApiEnvelope } from '@/lib/types/kpi';
import type { CityWeather, WeatherResponse, WeatherDay } from '@/app/api/kpi/weather/route';
import { describeWeather, type WeatherIconKey } from '@/lib/weather/wmo';
import { TvHeader } from './tv-header';

const ICONS: Record<WeatherIconKey, LucideIcon> = {
  sun: Sun,
  'cloud-sun': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  'freezing-rain': CloudHail,
  snow: Snowflake,
  showers: CloudRainWind,
  thunderstorm: CloudLightning,
};

function WeatherGlyph({ code, size }: { code: number; size: number }) {
  const { icon } = describeWeather(code);
  const Icon = ICONS[icon] ?? Cloud;
  // Sunny = warm amber, stormy = accent blue, everything else muted-bright.
  const color =
    icon === 'sun' || icon === 'cloud-sun'
      ? 'var(--warning)'
      : icon === 'thunderstorm' || icon === 'rain' || icon === 'showers'
        ? 'var(--accent)'
        : 'var(--text)';
  return <Icon size={size} strokeWidth={1.5} style={{ color }} aria-hidden />;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(iso: string, index: number): string {
  if (index === 0) return 'Today';
  const d = new Date(`${iso}T12:00:00`);
  return DOW[d.getDay()] ?? '';
}

export function WeatherScene() {
  const { data } = useQuery<WeatherResponse>({
    queryKey: ['tv-weather'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/weather');
      if (!res.ok) throw new Error(`weather: ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<WeatherResponse>;
      return json.data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  if (!data) return <TvHeader eyebrow="Weather" title="Loading…" />;

  // Plug-and-play: header derives from whatever cities the tenant configured
  // (company_config `weather_cities`) instead of hardcoded market names.
  const cityNames = data.cities.map((c) => c.name).join(' · ');

  return (
    <div className="flex flex-col h-full gap-6">
      <TvHeader
        eyebrow="Markets · Weather"
        title={cityNames || 'Weather'}
        right="Open-Meteo"
      />

      {/* Three big current-condition cards */}
      <div className="grid grid-cols-3 gap-6 flex-[1.1]">
        {data.cities.map((city) => (
          <CityCard key={city.key} city={city} />
        ))}
      </div>

      {/* 7-day forecast strip — one column per city, aligned by day */}
      <div className="grid grid-cols-3 gap-6 flex-1">
        {data.cities.map((city) => (
          <ForecastStrip key={city.key} city={city} />
        ))}
      </div>
    </div>
  );
}

function CityCard({ city }: { city: CityWeather }) {
  const { label } = describeWeather(city.current.weatherCode);
  if (city.error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-panel border border-border bg-surface p-8">
        <span className="text-section font-semibold">{city.name}</span>
        <span className="text-[16px] text-muted mt-2">Weather unavailable</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col rounded-panel border border-border bg-surface p-8 shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between">
        <span className="text-[28px] font-semibold tracking-tight">{city.name}</span>
        <WeatherGlyph code={city.current.weatherCode} size={64} />
      </div>

      <div className="flex items-start gap-2 mt-2">
        <span className="font-mono tabular-nums leading-none" style={{ fontSize: 'clamp(72px, 9vw, 150px)' }}>
          {city.current.temperature}
        </span>
        <span className="text-[40px] text-muted font-mono mt-2">°F</span>
      </div>

      <span className="text-[24px] text-muted -mt-1">{label}</span>

      <div className="flex items-center gap-6 mt-auto pt-6 text-[18px] text-muted font-mono tabular-nums">
        <span>Feels {city.current.apparentTemperature}°</span>
        <span className="flex items-center gap-1.5">
          <Droplets size={18} strokeWidth={1.8} aria-hidden /> {city.current.humidity}%
        </span>
        <span className="flex items-center gap-1.5">
          <Wind size={18} strokeWidth={1.8} aria-hidden /> {city.current.windSpeed} mph
        </span>
      </div>
    </div>
  );
}

function ForecastStrip({ city }: { city: CityWeather }) {
  // Skip "Today" (index 0, shown big above) and render the next 6 days.
  const days = city.daily.slice(0, 7);
  return (
    <div className="grid grid-cols-7 gap-2 rounded-panel border border-border bg-surface p-4">
      {days.map((d: WeatherDay, i: number) => (
        <div
          key={d.date}
          className={`flex flex-col items-center gap-2 py-2 rounded-[10px] ${
            i === 0 ? 'bg-surface-2' : ''
          }`}
        >
          <span className="text-eyebrow uppercase text-muted tracking-[0.08em]">
            {dayLabel(d.date, i)}
          </span>
          <WeatherGlyph code={d.weatherCode} size={30} />
          <div className="flex flex-col items-center leading-tight font-mono tabular-nums">
            <span className="text-[18px] font-semibold">{d.tempMax}°</span>
            <span className="text-[14px] text-muted">{d.tempMin}°</span>
          </div>
          {d.precipProbability > 0 && (
            <span className="text-[12px] font-mono tabular-nums" style={{ color: 'var(--accent)' }}>
              {d.precipProbability}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
