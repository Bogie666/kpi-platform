/**
 * Demo mode — when DEMO_MODE=true, every KPI/config route early-returns a
 * static fixture captured at build time (scripts/capture-demo-fixtures.ts)
 * instead of querying a database. No DATABASE_URL, no ServiceTitan creds,
 * no external calls. The live platform is completely unaffected: without
 * the env var this module is a no-op.
 */
import { NextResponse } from 'next/server';
import fixtures from '@/demo-fixtures/index.json';

export const DEMO_MODE = process.env.DEMO_MODE === 'true';

const fx = fixtures as Record<string, unknown>;

/**
 * Return the fixture response for a route, or null when demo mode is off.
 * Lookup order: exact preset+role key → preset key → mtd fallback → bare name.
 * In demo mode a missing fixture returns a 404 JSON error rather than falling
 * through to real (DB-backed) logic.
 */
export function demoResponse(
  name: string,
  opts?: { preset?: string | null; role?: string | null },
): NextResponse | null {
  if (!DEMO_MODE) return null;

  const candidates: string[] = [];
  const preset = opts?.preset || 'mtd';
  if (opts && 'role' in opts) {
    const role = opts.role || 'hvac_tech';
    candidates.push(`${name}__${preset}__${role}`);
    candidates.push(`${name}__mtd__${role}`);
    candidates.push(`${name}__mtd__hvac_tech`);
  }
  if (opts) {
    candidates.push(`${name}__${preset}`);
    candidates.push(`${name}__mtd`);
  }
  candidates.push(name);

  for (const key of candidates) {
    if (key in fx) return NextResponse.json(fx[key]);
  }
  return NextResponse.json(
    { error: `Demo fixture not found for ${name}` },
    { status: 404 },
  );
}

/** Company name for layout metadata in demo mode. */
export function demoCompanyName(): string | null {
  if (!DEMO_MODE) return null;
  const cfg = fx['config'] as { config?: { company_name?: string } } | undefined;
  return cfg?.config?.company_name ?? 'Summit Air & Plumbing';
}
