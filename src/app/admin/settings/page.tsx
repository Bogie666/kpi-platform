import { Suspense } from 'react';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsClient />
    </Suspense>
  );
}
