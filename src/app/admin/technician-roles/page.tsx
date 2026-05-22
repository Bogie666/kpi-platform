import { Suspense } from 'react';
import { TechnicianRolesClient } from './technician-roles-client';

export const dynamic = 'force-dynamic';

export default function AdminTechnicianRolesPage() {
  return (
    <Suspense fallback={null}>
      <TechnicianRolesClient />
    </Suspense>
  );
}
