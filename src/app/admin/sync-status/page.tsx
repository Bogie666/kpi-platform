import { Suspense } from 'react';
import { SyncStatusClient } from './sync-status-client';

export const dynamic = 'force-dynamic';

export default function AdminSyncStatusPage() {
  return (
    <Suspense fallback={null}>
      <SyncStatusClient />
    </Suspense>
  );
}
