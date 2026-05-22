import { Suspense } from 'react';
import { EmployeesClient } from './employees-client';

export const dynamic = 'force-dynamic';

export default function AdminEmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesClient />
    </Suspense>
  );
}
