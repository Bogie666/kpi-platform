import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import {
  getAllConfig,
  getSetupStep,
  isSetupCompleted,
  logSetupStep,
  markSetupCompleted,
  setManyConfig,
  setSetupStep,
} from '@/lib/config-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/setup
 * Returns wizard state — current step, completion flag, and all
 * (non-sensitive) config values so the UI can prefill fields on resume.
 */
export async function GET(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  const [step, completed, config] = await Promise.all([
    getSetupStep(),
    isSetupCompleted(),
    getAllConfig({ includeSensitive: false }),
  ]);
  return NextResponse.json({ step, completed, config });
}

/**
 * POST /api/setup
 * Body: { step: number, data: Record<string, string|number|boolean|null>, complete?: boolean }
 * Persists the step's data, bumps setup_step, optionally marks setup complete.
 */
export async function POST(req: NextRequest) {
  const fail = await requireAdminAuth(req);
  if (fail) return fail;

  type Payload = {
    step?: number;
    stepName?: string;
    data?: Record<string, string | number | boolean | null>;
    complete?: boolean;
  };
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const step = typeof body.step === 'number' ? body.step : null;
  if (step == null) return NextResponse.json({ error: 'step required' }, { status: 400 });

  const entries = Object.entries(body.data ?? {}).map(([key, value]) => ({ key, value }));
  await setManyConfig(entries, { updatedBy: 'wizard' });

  // Bump setup_step to max(current, step + 1) so resuming respects manual progression.
  const current = await getSetupStep();
  const next = Math.max(current, step + 1);
  await setSetupStep(next);

  if (body.complete) await markSetupCompleted();

  await logSetupStep(step, body.stepName ?? `step-${step}`, body.complete ? 'completed' : 'started', {
    keys: entries.map((e) => e.key),
  });

  return NextResponse.json({ ok: true, step: next, completed: body.complete === true });
}
