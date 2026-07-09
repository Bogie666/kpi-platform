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
import { TECHNICIANS, CALL_AGENTS, DEPARTMENTS } from '../src/db/seed/data';
import { resolvePeriod } from '../src/lib/period';
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

  // ── Augment the seed so every panel is populated ──────────────────────────
  // 1. technician_period: the Technicians tab + Top Performers podium read this
  //    table but the base seed never fills it. Insert one row per (window, tech)
  //    for every preset's cur/ly/ly2 window, scaling the tech's MTD numbers by
  //    window length so bigger periods show proportionally bigger output.
  console.log('• Augmenting technician_period for all preset windows…');
  const dayCount = (from: string, to: string) =>
    Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
  const esc = (s: string) => s.replace(/'/g, "''");
  {
    const stmts: string[] = [];
    for (const p of PRESETS) {
      const period = await resolvePeriod({ preset: p });
      const windows = [
        { w: period.cur, f: 1.0 },
        { w: period.ly, f: 0.87 },
        { w: period.ly2, f: 0.76 },
      ];
      for (const { w, f } of windows) {
        const scale = (dayCount(w.from, w.to) / 21) * f;
        for (const t of TECHNICIANS) {
          const revenueCents = Math.round(t.revenue * 100 * scale);
          const jobs = Math.max(1, Math.round(t.jobs * scale));
          const closeBps = Math.round(t.closeRate * 100 * (f === 1 ? 1 : 0.94));
          const opps = Math.max(jobs, Math.round(jobs / Math.max(0.05, t.closeRate / 100)));
          const closed = Math.max(1, Math.round(opps * (closeBps / 10000)));
          const avgTicketCents = Math.round(t.avgTicket * 100);
          const members = Math.max(0, Math.round(t.memberships * scale));
          stmts.push(
            `INSERT INTO technician_period (role_code, period_start, period_end, employee_id, employee_name,
              completed_jobs, completed_revenue_cents, opportunity, sales_opportunity, closed_opportunities,
              close_rate_bps, total_sales_cents, total_job_average_cents, options_per_opportunity_x100,
              memberships_sold, leads_set, total_lead_sales_cents, source_report_id)
             VALUES ('${t.role}', '${w.from}', '${w.to}', ${t.id}, '${esc(t.name)}',
              ${jobs}, ${revenueCents}, ${opps}, ${opps}, ${closed},
              ${closeBps}, ${revenueCents}, ${avgTicketCents}, ${180 + (t.id % 90)},
              ${members}, ${Math.round(jobs * 0.18)}, ${Math.round(revenueCents * 0.12)}, 'seed-demo')
             ON CONFLICT DO NOTHING;`,
          );
        }
      }
    }
    for (const s of stmts) await pg.exec(s);
    console.log(`   inserted up to ${stmts.length} technician_period rows`);
  }

  // 2. call_center_daily: backfill ~2.3 years so LY/LY2 compares and the
  //    last_month preset all have data (base seed only writes one day).
  console.log('• Backfilling call_center_daily 2024-01-01 → 2026-04-21…');
  {
    const stmts: string[] = [];
    const start = Date.parse('2024-01-01T00:00:00Z');
    const end = Date.parse('2026-04-21T00:00:00Z');
    for (let ts = start; ts <= end; ts += 86_400_000) {
      const d = new Date(ts);
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      const wk = dow === 0 ? 0.35 : dow === 6 ? 0.55 : 1.0;
      // gentle YoY growth: 2024 ≈ 0.82x, 2025 ≈ 0.91x, 2026 = 1.0x
      const yr = d.getUTCFullYear();
      const g = yr === 2024 ? 0.82 : yr === 2025 ? 0.91 : 1.0;
      // deterministic wobble ±10%
      const wob = 0.9 + ((ts / 86_400_000) % 7) * 0.03;
      for (const a of CALL_AGENTS) {
        const calls = Math.max(2, Math.round(a.calls * wk * g * wob * 0.45));
        const booked = Math.max(1, Math.round(calls * (a.ratePct / 100)));
        stmts.push(
          `INSERT INTO call_center_daily (employee_name, report_date, total_calls, calls_booked,
            booking_rate_bps, avg_wait_sec, avg_call_time_sec, abandon_rate_bps, source_report_id)
           VALUES ('${esc(a.name)}', '${iso}', ${calls}, ${booked},
            ${Math.round((booked / calls) * 10000)}, ${28 + (ts / 86_400_000) % 20}, ${210 + (ts / 86_400_000) % 60}, ${250 + (ts / 86_400_000) % 140}, 'seed-demo')
           ON CONFLICT (employee_name, report_date) DO NOTHING;`,
        );
      }
    }
    for (const s of stmts) await pg.exec(s);
    console.log(`   inserted up to ${stmts.length} call_center_daily rows`);
  }

  // 3. financial_daily "today" rows: the base seed leaves the capture date
  //    empty, so Today panels + the last spark point render as zero. Clone
  //    yesterday at ~62% (mid-afternoon partial day).
  console.log('• Inserting financial_daily rows for today (partial day)…');
  await pg.exec(`
    INSERT INTO financial_daily (department_code, business_unit_id, report_date,
      total_revenue_cents, jobs, opportunities, closed_opportunities, source_report_id)
    SELECT department_code, business_unit_id, DATE '2026-04-21',
      CAST(total_revenue_cents * 0.62 AS bigint),
      GREATEST(1, CAST(jobs * 0.6 AS int)),
      GREATEST(1, CAST(opportunities * 0.6 AS int)),
      CAST(closed_opportunities * 0.6 AS int), 'seed-demo-today'
    FROM financial_daily WHERE report_date = DATE '2026-04-20'
    ON CONFLICT (business_unit_id, report_date) DO UPDATE
      SET total_revenue_cents = EXCLUDED.total_revenue_cents,
          jobs = EXCLUDED.jobs,
          opportunities = EXCLUDED.opportunities,
          closed_opportunities = EXCLUDED.closed_opportunities;
  `);
  void DEPARTMENTS;

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
