import { Suspense } from 'react';
import { SetupWizard } from '@/components/setup/SetupWizard';

export const dynamic = 'force-dynamic';

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupWizard />
    </Suspense>
  );
}
