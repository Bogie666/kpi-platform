import { Suspense } from 'react';
import { GoogleReviewsClient } from './google-reviews-client';

export const dynamic = 'force-dynamic';

export default function AdminGoogleReviewsPage() {
  return (
    <Suspense fallback={null}>
      <GoogleReviewsClient />
    </Suspense>
  );
}
