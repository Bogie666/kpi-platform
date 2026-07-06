/**
 * Morning Daily Targets digest — renders the design-handoff email templates
 * (Jun 2026, "Champions Group light system") from the live daily-targets
 * payload and sends them via SendGrid.
 *
 * Audiences:
 *   - Trade emails (HVAC / Plumbing / Electrical): Template A's hero +
 *     essentials for the trade rollup, plus Template B's row table for the
 *     trade's divisions. One render per trade.
 *   - Full digest: Template B verbatim — company strip + every division.
 *
 * Recipients come from env (comma-separated):
 *   DAILY_TARGETS_EMAILS_HVAC / _PLUMBING / _ELECTRICAL / _DIGEST
 * An unset/empty audience is skipped silently.
 *
 * The numbers use the credit-backlog variant — same as the screen's default
 * view and the methodology footnote baked into the templates.
 */
import { DEFAULT_BUSINESS_TZ } from '@/lib/time';
import { fmtMoney } from '@/lib/format/money';
import { getDailyTargets, type DailyTargetsResult } from '@/lib/kpi/daily-targets';
import { sendEmail } from '@/lib/email/send';
import { getConfig } from '@/lib/config-service';
import type { DailyTargetRow, PaceStatus } from '@/lib/targets/compute';

// ── Audience scoping ──────────────────────────────────────────────────────

export interface TradeAudience {
  key: 'hvac' | 'plumbing' | 'electrical';
  label: string;
  envVar: string;
  match: (code: string) => boolean;
}

export const TRADE_AUDIENCES: TradeAudience[] = [
  {
    key: 'hvac',
    label: 'HVAC',
    envVar: 'DAILY_TARGETS_EMAILS_HVAC',
    match: (c) => c.startsWith('hvac_') || c === 'sales',
  },
  {
    key: 'plumbing',
    label: 'Plumbing',
    envVar: 'DAILY_TARGETS_EMAILS_PLUMBING',
    match: (c) => c.startsWith('plumbing_'),
  },
  {
    key: 'electrical',
    label: 'Electrical',
    envVar: 'DAILY_TARGETS_EMAILS_ELECTRICAL',
    match: (c) => c.startsWith('electrical_'),
  },
];

export const DIGEST_ENV_VAR = 'DAILY_TARGETS_EMAILS_DIGEST';

// Plug-and-play branding: bound from company_config at orchestration time
// (see sendDailyTargetsEmails). Defaults keep test renders sane.
let BRAND_NAME = 'KPI Platform';
let BRAND_FOOTER = 'KPI Platform';

async function resolveRecipients(envVar: string): Promise<string[]> {
  // company_config key mirrors the env var name lower-cased
  // (e.g. daily_targets_emails_hvac); env var is the fallback so existing
  // deployments keep working without touching the DB.
  const fromConfig = await getConfig(envVar.toLowerCase());
  const raw = fromConfig ?? process.env[envVar] ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}

// ── Formatting helpers ────────────────────────────────────────────────────

const STATUS_LABEL: Record<PaceStatus, string> = {
  ahead: 'Ahead',
  on_pace: 'On pace',
  behind: 'Behind',
  no_budget: 'No budget',
};

/** Pill palette from the handoff README (text / bg / border). */
const STATUS_COLORS: Record<PaceStatus, [string, string, string]> = {
  ahead: ['#067647', '#ECFDF3', '#ABEFC6'],
  on_pace: ['#175CD3', '#EFF8FF', '#B2DDFF'],
  behind: ['#B42318', '#FEF1F0', '#F4C7C3'],
  no_budget: ['#667085', '#F4F7FB', '#D9E2EC'],
};

const FONT = 'Inter,Arial,sans-serif';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function paceText(r: DailyTargetRow): string {
  const label = STATUS_LABEL[r.status];
  return r.paceRatio != null ? `${label} · ${Math.round(r.paceRatio * 100)}%` : label;
}

function shortText(r: DailyTargetRow, compact = false): string {
  if (r.demandCallsShort == null) return '—';
  if (r.demandCallsShort <= 0) return compact ? 'cov' : 'covered';
  return `+${r.demandCallsShort}`;
}

function shortColor(r: DailyTargetRow): string {
  if (r.demandCallsShort == null) return '#667085';
  return r.demandCallsShort > 0 ? '#B42318' : '#067647';
}

function pillHtml(r: DailyTargetRow, padding = '3px 8px', fontSize = 11): string {
  const [fg, bg, border] = STATUS_COLORS[r.status];
  return `<span style="font-family:${FONT}; font-size:${fontSize}px; font-weight:900; color:${fg}; background-color:${bg}; border:1px solid ${border}; border-radius:999px; padding:${padding}; white-space:nowrap;">${esc(paceText(r))}</span>`;
}

function ctDate(result: DailyTargetsResult): string {
  // e.g. "Fri, Jun 12" — from the business-local target date.
  const d = new Date(`${result.date}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Bound from company_config `timezone` in sendDailyTargetsEmails; the
// default keeps standalone renders (tests, previews) sane.
let RENDER_TZ = DEFAULT_BUSINESS_TZ;

function asOfCT(result: DailyTargetsResult): string {
  return new Date(result.asOf).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: RENDER_TZ,
  });
}

interface Summary {
  jobsNeeded: number;
  dailyTargetCents: number;
  booked: number;
  short: number;
  onPaceOrAhead: number;
  withBudget: number;
}

function summarize(rows: DailyTargetRow[]): Summary {
  const out: Summary = {
    jobsNeeded: 0,
    dailyTargetCents: 0,
    booked: 0,
    short: 0,
    onPaceOrAhead: 0,
    withBudget: 0,
  };
  for (const r of rows) {
    out.jobsNeeded += r.jobsNeededToday ?? 0;
    out.dailyTargetCents += r.dailyTargetCents;
    out.booked += r.demandCallsBooked + r.maintScheduledToday;
    out.short += r.demandCallsShort ?? 0;
    if (r.status !== 'no_budget') {
      out.withBudget += 1;
      if (r.status === 'ahead' || r.status === 'on_pace') out.onPaceOrAhead += 1;
    }
  }
  return out;
}

// ── Shared HTML chrome ────────────────────────────────────────────────────

function shell(result: DailyTargetsResult, preheader: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Daily Targets</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap" rel="stylesheet">
  <!--<![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#F4F7FB;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F7FB">
    <tr>
      <td align="center" style="padding:32px 12px 48px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
          <tr>
            <td bgcolor="#124696" style="border-radius:16px 16px 0 0; padding:22px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle" style="font-family:${FONT}; font-size:16px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#FFFFFF; white-space:nowrap;">
                    ${esc(BRAND_NAME)}
                  </td>
                  <td align="right" valign="middle" style="font-family:${FONT}; font-size:11px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:#BFD2EA; white-space:nowrap;">
                    Daily Targets &middot; ${esc(ctDate(result))}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${body}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function methodologyHtml(result: DailyTargetsResult, perDivision: boolean): string {
  const days = result.calendar.remainingWorkdays;
  const whose = perDivision ? "each division's" : 'your';
  return `Daily target = (budget &minus; MTD &minus; scheduled backlog) &divide; ${days} remaining workday${days === 1 ? '' : 's'}. Jobs needed uses ${whose} trailing 30-day revenue per completed job; calls short credits today's booked maintenance and demand calls. Install divisions count Sales estimate runs as calls. Pace: ahead &ge; 105% of expected-to-date, behind &le; 95%.`;
}

function footerHtml(result: DailyTargetsResult, allLine: string): string {
  return `<tr>
            <td bgcolor="#FBFDFF" style="border-top:1px solid #D9E2EC; border-radius:0 0 16px 16px; padding:18px 32px;">
              ${allLine}
              <div style="font-family:${FONT}; font-size:11px; color:#98A2B3;">
                ${esc(BRAND_FOOTER)} &middot; sent every working morning &mdash; data as of ${esc(asOfCT(result))}
              </div>
            </td>
          </tr>`;
}

function divisionRowsHtml(rows: DailyTargetRow[]): string {
  const head = `<tr>
                  <td style="padding:0 0 10px 14px; border-bottom:1px solid #D9E2EC; font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085;">Division</td>
                  <td align="right" width="50" style="padding:0 0 10px; border-bottom:1px solid #D9E2EC; font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085;">Jobs</td>
                  <td align="right" width="74" style="padding:0 0 10px; border-bottom:1px solid #D9E2EC; font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085;">Target</td>
                  <td align="right" width="60" style="padding:0 0 10px; border-bottom:1px solid #D9E2EC; font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085;">Short</td>
                  <td align="right" width="104" style="padding:0 14px 10px 0; border-bottom:1px solid #D9E2EC; font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085;">Pace</td>
                </tr>`;
  const body = rows
    .map(
      (r) => `<tr>
                  <td style="padding:13px 0 13px 14px; border-bottom:1px solid #EDF1F6; border-left:4px solid #124696;">
                    <span style="font-family:${FONT}; font-size:14px; font-weight:800; color:#0C1F3A; white-space:nowrap;">${esc(r.name)}</span>
                  </td>
                  <td align="right" style="padding:13px 0; border-bottom:1px solid #EDF1F6; font-family:${FONT}; font-size:18px; font-weight:900; color:#124696;">${r.jobsNeededToday ?? '—'}</td>
                  <td align="right" style="padding:13px 0; border-bottom:1px solid #EDF1F6; font-family:${FONT}; font-size:13px; font-weight:700; color:#475467;">${fmtMoney(r.dailyTargetCents)}</td>
                  <td align="right" style="padding:13px 0; border-bottom:1px solid #EDF1F6; font-family:${FONT}; font-size:14px; font-weight:900; color:${shortColor(r)};">${esc(shortText(r))}</td>
                  <td align="right" style="padding:13px 14px 13px 0; border-bottom:1px solid #EDF1F6;">${pillHtml(r)}</td>
                </tr>`,
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">${head}${body}</table>`;
}

// ── Variation B: full digest ──────────────────────────────────────────────

export function renderDigest(result: DailyTargetsResult): {
  subject: string;
  html: string;
  text: string;
} {
  const rows = result.divisions;
  const s = summarize(rows);
  const subject = `Daily Targets · ${ctDate(result)} — ${s.jobsNeeded} jobs needed across ${rows.length} divisions`;
  const preheader = `${s.jobsNeeded} jobs needed · ${fmtMoney(s.dailyTargetCents)} daily target · ${s.onPaceOrAhead} of ${s.withBudget} on pace`;

  const body = `<tr>
            <td bgcolor="#FFFFFF" style="padding:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #D9E2EC; border-radius:14px;">
                <tr>
                  <td width="33%" align="center" style="padding:20px; border-right:1px solid #D9E2EC;">
                    <div style="font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085; white-space:nowrap; padding-bottom:5px;">Jobs needed</div>
                    <div style="font-family:${FONT}; font-size:28px; font-weight:900; color:#124696;">${s.jobsNeeded}</div>
                  </td>
                  <td width="33%" align="center" style="padding:20px; border-right:1px solid #D9E2EC;">
                    <div style="font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085; white-space:nowrap; padding-bottom:5px;">Daily target</div>
                    <div style="font-family:${FONT}; font-size:28px; font-weight:900; color:#0C1F3A;">${fmtMoney(s.dailyTargetCents)}</div>
                  </td>
                  <td align="center" style="padding:20px;">
                    <div style="font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085; white-space:nowrap; padding-bottom:5px;">On pace</div>
                    <div style="font-family:${FONT}; font-size:28px; font-weight:900; color:#0C1F3A;">${s.onPaceOrAhead}<span style="color:#98A2B3; font-size:20px;">/${s.withBudget}</span></div>
                  </td>
                </tr>
              </table>
              ${divisionRowsHtml(rows)}
              <div style="font-family:${FONT}; font-size:12px; line-height:1.6; color:#667085; padding-top:24px;">
                ${methodologyHtml(result, true)}
              </div>
            </td>
          </tr>
          ${footerHtml(result, '')}`;

  const pad = (v: string, n: number) => v.padEnd(n);
  const rpad = (v: string, n: number) => v.padStart(n);
  const textRows = rows
    .map(
      (r) =>
        `${pad(r.name.slice(0, 21), 21)}${rpad(String(r.jobsNeededToday ?? '—'), 5)}  ${rpad(fmtMoney(r.dailyTargetCents), 7)}  ${rpad(shortText(r, true), 6)}   ${paceText(r)}`,
    )
    .join('\n');
  const text = `DAILY TARGETS · ${ctDate(result).toUpperCase()}
${BRAND_FOOTER}

ALL DIVISIONS
Jobs needed ....... ${s.jobsNeeded}
Daily target ...... ${fmtMoney(s.dailyTargetCents)}
On pace ........... ${s.onPaceOrAhead} of ${s.withBudget}

${pad('DIVISION', 21)}${rpad('JOBS', 5)}  ${rpad('TARGET', 7)}  ${rpad('SHORT', 6)}   PACE
${textRows}

(cov = covered: today's board already covers the daily target)

--
Daily target = (budget − MTD − scheduled backlog) ÷ ${result.calendar.remainingWorkdays} remaining workdays.
Jobs needed uses each division's trailing 30-day revenue per completed job;
calls short credits today's booked maintenance and demand calls. Install
divisions count Sales estimate runs as calls.
Pace: ahead ≥ 105% of expected-to-date, behind ≤ 95%.

${BRAND_FOOTER} · data as of ${asOfCT(result)}`;

  return { subject, html: shell(result, preheader, body), text };
}

// ── Variation A (adapted): trade-scoped email ─────────────────────────────

export function renderTrade(
  trade: TradeAudience,
  result: DailyTargetsResult,
): { subject: string; html: string; text: string } | null {
  const rows = result.divisions.filter((r) => trade.match(r.code));
  if (rows.length === 0) return null;
  const s = summarize(rows);
  const all = summarize(result.divisions);

  const subject = `Daily Targets · ${trade.label} — ${s.jobsNeeded} jobs needed today`;
  const shortPhrase =
    s.short > 0
      ? `${s.short} more to find`
      : 'today&rsquo;s board covers the target';
  const shortPhrasePlain = s.short > 0 ? `${s.short} more to find` : "today's board covers the target";
  const preheader = `${s.booked} calls booked · ${shortPhrasePlain} · daily target ${fmtMoney(s.dailyTargetCents)}`;

  // Trade-level pace pill: a synthetic row carrying the aggregate ratio.
  const expected = rows.reduce(
    (sum, r) =>
      sum +
      (result.calendar.totalWorkdays > 0
        ? r.monthlyBudgetCents * (result.calendar.elapsedWorkdays / result.calendar.totalWorkdays)
        : 0),
    0,
  );
  const mtd = rows.reduce((sum, r) => sum + r.mtdRevenueCents, 0);
  const tradeRatio = expected > 0 ? mtd / expected : null;
  const tradeStatus: PaceStatus =
    tradeRatio == null
      ? 'on_pace'
      : tradeRatio >= 1.05
        ? 'ahead'
        : tradeRatio <= 0.95
          ? 'behind'
          : 'on_pace';
  const tradePill = pillHtml(
    { ...rows[0], status: tradeStatus, paceRatio: tradeRatio } as DailyTargetRow,
    '4px 12px',
    12,
  );

  const allLine = `<div style="font-family:${FONT}; font-size:12px; color:#667085; padding-bottom:4px;">
                <strong style="color:#0C1F3A;">All divisions:</strong> ${all.jobsNeeded} jobs needed &middot; ${fmtMoney(all.dailyTargetCents)} daily target &middot; ${all.onPaceOrAhead} of ${all.withBudget} on pace or ahead
              </div>`;

  const body = `<tr>
            <td bgcolor="#FFFFFF" style="padding:36px 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:2px; text-transform:uppercase; color:#667085; padding-bottom:6px;">
                    Your division
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${FONT}; font-size:28px; font-weight:900; color:#0C1F3A; padding-bottom:26px;">
                    ${esc(trade.label)}
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EEF4FB" style="border:1px solid #D3E2F2; border-radius:16px;">
                <tr>
                  <td width="120" align="center" valign="middle" style="padding:28px 0 28px 28px; font-family:${FONT}; font-size:64px; font-weight:900; line-height:1; color:#124696;">
                    ${s.jobsNeeded}
                  </td>
                  <td valign="middle" style="padding:28px 28px 28px 22px;">
                    <div style="font-family:${FONT}; font-size:16px; font-weight:900; color:#0C1F3A; padding-bottom:4px;">jobs needed today</div>
                    <div style="font-family:${FONT}; font-size:13px; line-height:1.5; color:#667085;">to hit your ${fmtMoney(s.dailyTargetCents)} daily target. ${s.booked} calls are booked &mdash; <strong style="color:${s.short > 0 ? '#B42318' : '#067647'};">${shortPhrase}</strong>.</div>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #D9E2EC; border-radius:14px; margin-top:24px;">
                <tr>
                  <td width="33%" style="padding:18px 20px; border-right:1px solid #D9E2EC;">
                    <div style="font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085; white-space:nowrap; padding-bottom:5px;">Daily target</div>
                    <div style="font-family:${FONT}; font-size:22px; font-weight:900; color:#0C1F3A;">${fmtMoney(s.dailyTargetCents)}</div>
                  </td>
                  <td width="30%" style="padding:18px 20px; border-right:1px solid #D9E2EC;">
                    <div style="font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085; white-space:nowrap; padding-bottom:5px;">Calls short</div>
                    <div style="font-family:${FONT}; font-size:22px; font-weight:900; color:${s.short > 0 ? '#B42318' : '#067647'};">${s.short > 0 ? `+${s.short}` : 'covered'}</div>
                  </td>
                  <td style="padding:18px 20px;">
                    <div style="font-family:${FONT}; font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#667085; white-space:nowrap; padding-bottom:7px;">Month pace</div>
                    <div>${tradePill}</div>
                  </td>
                </tr>
              </table>
              ${rows.length > 1 ? divisionRowsHtml(rows) : ''}
              <div style="font-family:${FONT}; font-size:12px; line-height:1.6; color:#667085; padding-top:24px;">
                ${methodologyHtml(result, rows.length > 1)}
              </div>
            </td>
          </tr>
          ${footerHtml(result, allLine)}`;

  const textRows =
    rows.length > 1
      ? '\n' +
        rows
          .map(
            (r) =>
              `${r.name.slice(0, 21).padEnd(21)}${String(r.jobsNeededToday ?? '—').padStart(5)}  ${fmtMoney(r.dailyTargetCents).padStart(7)}  ${shortText(r, true).padStart(6)}   ${paceText(r)}`,
          )
          .join('\n') +
        '\n'
      : '';
  const text = `DAILY TARGETS · ${ctDate(result).toUpperCase()}
${BRAND_FOOTER}

YOUR DIVISION: ${trade.label.toUpperCase()}

${s.jobsNeeded} JOBS NEEDED TODAY
to hit your ${fmtMoney(s.dailyTargetCents)} daily target.
${s.booked} calls are booked — ${shortPhrasePlain}.

Daily target ...... ${fmtMoney(s.dailyTargetCents)}
Calls short ....... ${s.short > 0 ? `+${s.short}` : 'covered'}
Month pace ........ ${tradeRatio != null ? `${STATUS_LABEL[tradeStatus]} · ${Math.round(tradeRatio * 100)}%` : STATUS_LABEL[tradeStatus]}
${textRows}
All divisions: ${all.jobsNeeded} jobs needed · ${fmtMoney(all.dailyTargetCents)} daily target · ${all.onPaceOrAhead} of ${all.withBudget} on pace or ahead

--
Daily target = (budget − MTD − scheduled backlog) ÷ ${result.calendar.remainingWorkdays} remaining workdays.
Jobs needed uses trailing 30-day revenue per completed job. Calls short
credits today's booked maintenance and demand calls. Install divisions
count Sales estimate runs as calls.

${BRAND_FOOTER} · data as of ${asOfCT(result)}`;

  return { subject, html: shell(result, preheader, body), text };
}

// ── Orchestrator ──────────────────────────────────────────────────────────

export interface SendResultEntry {
  audience: string;
  to: string[];
  subject: string;
  status: 'sent' | 'skipped_no_recipients' | 'skipped_no_divisions' | 'error';
  error?: string;
}

export async function sendDailyTargetsEmails(opts: {
  /** Override every audience's recipients — for test sends. */
  toOverride?: string[];
  /** Render and report without calling SendGrid. */
  dryRun?: boolean;
} = {}): Promise<{ asOf: string; date: string; results: SendResultEntry[] }> {
  // Bind tenant branding for this render pass.
  const companyName = (await getConfig('company_name')) ?? 'KPI Platform';
  BRAND_NAME = `${companyName} KPI`;
  BRAND_FOOTER = (await getConfig('email_footer_text')) ?? BRAND_NAME;
  RENDER_TZ = (await getConfig('timezone')) ?? DEFAULT_BUSINESS_TZ;

  // Force a fresh compute so the morning email never ships last evening's cache.
  const result = await getDailyTargets({ maxAgeMin: 20 });

  const planned: Array<{ audience: string; envVar: string; rendered: { subject: string; html: string; text: string } | null }> = [
    ...TRADE_AUDIENCES.map((t) => ({
      audience: t.label,
      envVar: t.envVar,
      rendered: renderTrade(t, result),
    })),
    { audience: 'Digest', envVar: DIGEST_ENV_VAR, rendered: renderDigest(result) },
  ];

  const results: SendResultEntry[] = [];
  for (const p of planned) {
    const to = opts.toOverride ?? (await resolveRecipients(p.envVar));
    if (!p.rendered) {
      results.push({ audience: p.audience, to, subject: '', status: 'skipped_no_divisions' });
      continue;
    }
    if (to.length === 0) {
      results.push({ audience: p.audience, to, subject: p.rendered.subject, status: 'skipped_no_recipients' });
      continue;
    }
    if (opts.dryRun) {
      results.push({ audience: p.audience, to, subject: p.rendered.subject, status: 'sent' });
      continue;
    }
    try {
      await sendEmail({ to, ...p.rendered });
      results.push({ audience: p.audience, to, subject: p.rendered.subject, status: 'sent' });
    } catch (err) {
      results.push({
        audience: p.audience,
        to,
        subject: p.rendered.subject,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { asOf: result.asOf, date: result.date, results };
}
