/**
 * POST /api/admin/create-user
 *
 * Creates or updates a dashboard login. Auth either:
 *   - CRON_SECRET (bootstrap path), OR
 *   - Active session whose email is in ADMIN_EMAILS.
 *
 * Body: { email, password, name? } JSON. Existing user -> password reset.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { authorizeAdmin, isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Body {
  email?: string;
  password?: string;
  name?: string | null;
}

export async function POST(req: NextRequest) {
  if (!(await authorizeAdmin(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = body.name == null ? null : String(body.name).trim() || null;
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'password must be >=8 chars' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const inserted = await db()
    .insert(users)
    .values({ email, passwordHash, name })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        passwordHash: sql.raw('excluded.password_hash'),
        ...(name !== null ? { name: sql.raw('excluded.name') } : {}),
        active: true,
      },
    })
    .returning({ id: users.id, email: users.email, name: users.name });

  return NextResponse.json({
    ok: true,
    user: inserted[0],
    isAdmin: isAdmin(email),
  });
}
