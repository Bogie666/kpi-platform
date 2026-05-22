import { Suspense } from 'react';
import { DivisionRolesClient } from './division-roles-client';

export const dynamic = 'force-dynamic';

export default function AdminDivisionRolesPage() {
  return (
    <Suspense fallback={null}>
      <DivisionRolesClient />
    </Suspense>
  );
}
