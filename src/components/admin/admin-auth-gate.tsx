'use client';

/**
 * Admin auth is enforced by the edge middleware (session cookie whose email
 * is in ADMIN_EMAILS). By the time this renders, the user is already a
 * verified admin, so the gate is a pass-through. Kept as a component so the
 * /admin layout import stays stable.
 */
export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
