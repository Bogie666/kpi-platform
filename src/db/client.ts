import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Lazy-initialized Drizzle client over Neon's serverless HTTP driver.
 *
 * Neon-HTTP is cold-start friendly (no long-lived connection pool) and fast
 * enough for the ~15 queries per dashboard request. For scripts that need
 * a session (`BEGIN`, advisory locks, etc.) import neon-ws instead.
 *
 * The client is lazy so that route files can be imported during `next build`
 * without DATABASE_URL being set — only runtime queries actually reach Neon.
 */
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

// Test/capture hook: allows a build-time script (e.g. the demo fixture
// capture) to inject an alternative Drizzle instance — such as one backed by
// in-process PGlite — without any route handler code changing. Runtime on
// Vercel never calls this, so production behaviour is identical to before.
let _injected: unknown = null;
export function __setDbForCapture(instance: unknown) {
  _injected = instance;
}

export function db() {
  if (_injected) return _injected as ReturnType<typeof drizzle<typeof schema>>;
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. In Vercel this is wired automatically by the Neon integration. Locally, run `vercel env pull .env.local` in the repo root.',
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}
