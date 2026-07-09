/**
 * Build-time demo fixture capture.
 *
 * Spins up in-process PGlite, applies the committed Drizzle migrations, runs
 * the repo's synthetic seed against it, injects that PGlite-backed Drizzle
 * instance into @/db/client, then invokes every KPI route handler across the
 * full matrix of UI states (period presets x roles) plus the setup/config
 * endpoints. Each response is written to src/demo-fixtures/<key>.json.
 *
 * The demo build then serves these static fixtures instead of touching a DB.
 *
 * Run: npx tsx scripts/capture-demo-fixtures.ts
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../src/db/schema';
import { runSeed } from '../src/db/seed/run';
import { __setDbForCapture } from '../src/db/client';
import { __setResourceFetcherForCapture } from '../src/lib/sync/servicetitan/raw-client';
import { syntheticStFetch } from './synthetic-st';

const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src', 'demo-fixtures');

// The synthetic seed pins all data to April 2026 (today = 2026-04-21). Fixtures
// are keyed by PRESET, not by date, so we pin the process clock into that window
// during capture — this makes every period (today/MTD/QTD/L30/last_month/etc.)
// resolve to populated data instead of zeros. At demo runtime the routes
// short-circuit to fixtures before reading the clock, so this only affects capture.
const CAPTURE_NOW = new Date('2026-04-21T15:00:00.000Z');
const RealDate = Date;
class PinnedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) {
      super(CAPTURE_NOW.getTime());
    } else {
      // @ts-expect-error passthrough to the real Date constructor
      super(...args);
    }
  }
  static now() {
    return CAPTURE_NOW.getTime();
  }
}
// @ts-expect-error install the pinned clock for the capture run
globalThis.Date = PinnedDate;

async function main() {
  console.log('• Booting in-process PGlite…');
  const pg = new PGlite();
  const db = drizzle(pg, { schema });

  // Apply committed migrations in order.
  const migDir = join(ROOT, 'drizzle');
  const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  console.log(`• Applying ${files.length} migrations…`);
  for (const f of files) {
    const sqlText = readFileSync(join(migDir, f), 'utf8');
    // drizzle migration files separate statements with the statement-breakpoint marker
    const statements = sqlText.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) await pg.exec(trimmed);
    }
  }

  console.log('• Seeding synthetic data…');
  const report = await runSeed((m) => console.log('   ' + m), db);
  console.log('   seed report:', JSON.stringify(report));

  // Wire the seeded PGlite db into the app's client accessor so route
  // handlers query it transparently.
  __setDbForCapture(db);

  // Wire the synthetic ServiceTitan fetcher so the four ST-live routes run
  // their real logic against believable in-memory records (no creds/network).
  __setResourceFetcherForCapture(syntheticStFetch);

  mkdirSync(OUT, { recursive: true });

  // Set demo branding config BEFORE capturing /api/config so the fixture
  // carries the white-label identity (no real LEX branding in the demo).
  console.log('• Writing demo company config…');
  await pg.exec(`
    INSERT INTO company_config (config_key, config_value, config_type, is_sensitive)
    VALUES
      ('company_name', 'Summit Air & Plumbing', 'string', false),
      ('setup_completed', 'true', 'boolean', false),
      ('timezone', 'America/Chicago', 'string', false)
    ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;
  `);

  const PRESETS = ['today', 'l7', 'mtd', 'qtd', 'ytd', 'l30', 'l90', 'ttm', 'last_month'];
  const ROLES = ['all', 'comfort_advisor', 'hvac_tech', 'hvac_maintenance', 'commercial_hvac', 'plumbing', 'electrical'];

  const captured: Record<string, unknown> = {};

  async function hit(routePath: string, mod: { GET: (req: unknown) => Promise<Response> }, params: Record<string, string>, key: string) {
    const url = new URL('http://demo.local' + routePath);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const req = { nextUrl: url, url: url.toString(), headers: new Map() };
    const res = await mod.GET(req as never);
    const json = await (res as Response).json();
    captured[key] = json;
    return json;
  }

  // Import handlers lazily (after db injection).
  const routes: Array<{ name: string; path: string; matrix: 'period' | 'periodrole' | 'none' }> = [
    { name: 'financial', path: '/api/kpi/financial', matrix: 'period' },
    { name: 'technicians', path: '/api/kpi/technicians', matrix: 'periodrole' },
    { name: 'top-performers', path: '/api/kpi/top-performers', matrix: 'period' },
    { name: 'callcenter', path: '/api/kpi/callcenter', matrix: 'period' },
    { name: 'memberships', path: '/api/kpi/memberships', matrix: 'period' },
    { name: 'estimates', path: '/api/kpi/estimates', matrix: 'period' },
    { name: 'pipeline-revenue', path: '/api/kpi/pipeline-revenue', matrix: 'period' },
    { name: 'new-customers', path: '/api/kpi/new-customers', matrix: 'period' },
    { name: 'daily-targets', path: '/api/kpi/daily-targets', matrix: 'period' },
    { name: 'upcoming-appointments', path: '/api/kpi/upcoming-appointments', matrix: 'none' },
    { name: 'reviews', path: '/api/kpi/reviews', matrix: 'none' },
    { name: 'weather', path: '/api/kpi/weather', matrix: 'none' },
    { name: 'config', path: '/api/config', matrix: 'none' },
  ];

  // Routes that call the live ServiceTitan API can't be captured from seed
  // data — they get hand-authored demo fixtures instead. Everything else is
  // DB-backed and captured here from PGlite.
  // All routes are now capturable: DB-backed via PGlite, ST-live via the
  // synthetic fetcher. Keep the set empty but retain the mechanism.
  const ST_LIVE = new Set<string>([]);
  const failed: string[] = [];

  for (const r of routes) {
    if (ST_LIVE.has(r.name)) {
      console.log(`   ⤼ ${r.name} (ServiceTitan-live — hand-authored fixture)`);
      continue;
    }
    try {
      const mod = await import(join(ROOT, 'src/app' + r.path.replace('/api', '/api') + '/route.ts'));
      if (r.matrix === 'none') {
        await hit(r.path, mod, {}, `${r.name}`);
        console.log(`   ✓ ${r.name}`);
      } else if (r.matrix === 'period') {
        for (const p of PRESETS) await hit(r.path, mod, { preset: p }, `${r.name}__${p}`);
        console.log(`   ✓ ${r.name} (${PRESETS.length} periods)`);
      } else {
        for (const p of PRESETS)
          for (const role of ROLES)
            await hit(r.path, mod, { preset: p, role }, `${r.name}__${p}__${role}`);
        console.log(`   ✓ ${r.name} (${PRESETS.length}x${ROLES.length})`);
      }
    } catch (e) {
      failed.push(r.name);
      console.log(`   ✗ ${r.name} FAILED: ${(e as Error).message.split('\n')[0]}`);
    }
  }
  if (failed.length) console.log(`\n⚠ routes needing hand-authored fixtures: ${failed.join(', ')}`);

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(captured, null, 0));
  console.log(`\n• Wrote ${Object.keys(captured).length} fixtures to src/demo-fixtures/index.json`);
  await pg.close();
}

main().catch((e) => {
  console.error('CAPTURE FAILED:', e);
  process.exit(1);
});
