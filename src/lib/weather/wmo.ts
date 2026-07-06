/**
 * WMO weather interpretation codes → short label + icon key.
 * Open-Meteo returns these `weather_code` integers for current + daily.
 * Icon keys map to lucide-react icons in the weather scene.
 * https://open-meteo.com/en/docs (WMO Weather interpretation codes)
 */

export type WeatherIconKey =
  | 'sun'
  | 'cloud-sun'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'freezing-rain'
  | 'snow'
  | 'showers'
  | 'thunderstorm';

export interface WeatherCondition {
  label: string;
  icon: WeatherIconKey;
}

const TABLE: Record<number, WeatherCondition> = {
  0: { label: 'Clear', icon: 'sun' },
  1: { label: 'Mostly Clear', icon: 'cloud-sun' },
  2: { label: 'Partly Cloudy', icon: 'cloud-sun' },
  3: { label: 'Overcast', icon: 'cloud' },
  45: { label: 'Fog', icon: 'fog' },
  48: { label: 'Rime Fog', icon: 'fog' },
  51: { label: 'Light Drizzle', icon: 'drizzle' },
  53: { label: 'Drizzle', icon: 'drizzle' },
  55: { label: 'Heavy Drizzle', icon: 'drizzle' },
  56: { label: 'Freezing Drizzle', icon: 'freezing-rain' },
  57: { label: 'Freezing Drizzle', icon: 'freezing-rain' },
  61: { label: 'Light Rain', icon: 'rain' },
  63: { label: 'Rain', icon: 'rain' },
  65: { label: 'Heavy Rain', icon: 'rain' },
  66: { label: 'Freezing Rain', icon: 'freezing-rain' },
  67: { label: 'Freezing Rain', icon: 'freezing-rain' },
  71: { label: 'Light Snow', icon: 'snow' },
  73: { label: 'Snow', icon: 'snow' },
  75: { label: 'Heavy Snow', icon: 'snow' },
  77: { label: 'Snow Grains', icon: 'snow' },
  80: { label: 'Light Showers', icon: 'showers' },
  81: { label: 'Showers', icon: 'showers' },
  82: { label: 'Heavy Showers', icon: 'showers' },
  85: { label: 'Snow Showers', icon: 'snow' },
  86: { label: 'Snow Showers', icon: 'snow' },
  95: { label: 'Thunderstorm', icon: 'thunderstorm' },
  96: { label: 'Thunderstorm', icon: 'thunderstorm' },
  99: { label: 'Thunderstorm', icon: 'thunderstorm' },
};

export function describeWeather(code: number | null | undefined): WeatherCondition {
  if (code == null) return { label: 'Unknown', icon: 'cloud' };
  return TABLE[code] ?? { label: 'Unknown', icon: 'cloud' };
}
