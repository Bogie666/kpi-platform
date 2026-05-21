import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { DashboardClient } from './dashboard-client';
import { isSetupCompleted } from '@/lib/config-service';

// The dashboard is entirely URL-state + client-fetched KPI data. Pre-rendering
// gains nothing and has caused Vercel edge routing to intermittently 503 on
// the static shell. Force dynamic so every request goes through the SSR path.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // First-run redirect: a freshly-deployed instance with no `setup_completed`
  // flag bounces the operator into the wizard. Once the wizard finishes,
  // the flag is true forever (the admin can still revisit /setup directly).
  // We do this here (server component) rather than in Edge middleware to
  // avoid an extra DB roundtrip on every middleware-gated request.
  //
  // CRITICAL: `redirect()` throws a NEXT_REDIRECT control-flow error that
  // Next.js handles at the route boundary. It MUST propagate — wrapping it
  // in a try/catch swallows the redirect, which is why this is split into
  // a separate read + check.
  let completed = false;
  try {
    completed = await isSetupCompleted();
  } catch {
    // DB unreachable (e.g. DATABASE_URL not wired yet) — fall through to
    // the dashboard; the panels themselves surface the connection error.
  }
  if (!completed) redirect('/setup');

  return (
    <Suspense fallback={null}>
      <DashboardClient />
    </Suspense>
  );
}
