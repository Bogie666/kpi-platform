import { Suspense } from 'react';
import { WeatherConfigClient } from './weather-client';

export const dynamic = 'force-dynamic';

export default function AdminWeatherPage() {
  return (
    <Suspense fallback={null}>
      <WeatherConfigClient />
    </Suspense>
  );
}
