/**
 * Render all trade emails (per TRADE_AUDIENCES) to /workspace/tmp/ so the
 * template can be eyeballed without a live ServiceTitan pull or SendGrid send.
 *
 * Sample data below is illustrative (generic HVAC/Plumbing/Electrical
 * divisions) — swap in your own division codes to preview a specific tenant.
 * Branding uses the module default ('KPI Platform') since this runs outside a
 * request; sendDailyTargetsEmails() binds the real tenant brand at send time.
 *
 *   npx tsx scripts/preview-trade-emails.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { renderTrade, TRADE_AUDIENCES } from '../src/lib/email/daily-targets-email';
import type { DailyTargetsResult } from '../src/lib/kpi/daily-targets';
import type { DailyTargetRow } from '../src/lib/targets/compute';

const row = (o: Partial<DailyTargetRow>): DailyTargetRow =>
  ({
    code: 'hvac_service',
    name: 'HVAC - Maint/Service',
    monthlyBudgetCents: 0,
    mtdRevenueCents: 0,
    dailyTargetCents: 0,
    jobsNeededToday: 0,
    demandCallsBooked: 0,
    maintScheduledToday: 0,
    demandCallsShort: 0,
    status: 'ahead',
    paceRatio: 1.07,
    ...o,
  }) as DailyTargetRow;

const result = {
  date: '2026-07-09',
  asOf: new Date().toISOString(),
  calendar: { remainingWorkdays: 17, elapsedWorkdays: 6, totalWorkdays: 23 },
  divisions: [
    row({ code: 'hvac_service', name: 'HVAC - Maint/Service', jobsNeededToday: 70, dailyTargetCents: 2800000, demandCallsShort: -3, demandCallsBooked: 60, maintScheduledToday: 13, monthlyBudgetCents: 90000000, mtdRevenueCents: 28000000, status: 'ahead', paceRatio: 1.07 }),
    row({ code: 'sales', name: 'HVAC - Sales', jobsNeededToday: 10, dailyTargetCents: 7300000, demandCallsShort: 10, demandCallsBooked: 0, monthlyBudgetCents: 200000000, mtdRevenueCents: 40000000, status: 'behind', paceRatio: 0.73 }),
    row({ code: 'plumbing_service', name: 'Plumbing', jobsNeededToday: 2, dailyTargetCents: 200000, demandCallsShort: -1, demandCallsBooked: 3, monthlyBudgetCents: 3000000, mtdRevenueCents: 900000, status: 'ahead', paceRatio: 1.29 }),
    row({ code: 'electrical_service', name: 'Electrical - Maint/Service', jobsNeededToday: 0, dailyTargetCents: 0, demandCallsShort: 0, monthlyBudgetCents: 1500000, mtdRevenueCents: 1200000, status: 'ahead', paceRatio: 2.66 }),
  ],
} as unknown as DailyTargetsResult;

mkdirSync('/workspace/tmp', { recursive: true });
for (const trade of TRADE_AUDIENCES) {
  const r = renderTrade(trade, result);
  if (!r) {
    console.log(trade.label, 'skipped (no divisions)');
    continue;
  }
  const path = `/workspace/tmp/daily-targets-${trade.key}.html`;
  writeFileSync(path, r.html);
  console.log(trade.label, '->', path, '   subject:', r.subject);
}
