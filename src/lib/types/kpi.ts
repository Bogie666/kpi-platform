export type Unit = 'cents' | 'bps' | 'count' | 'seconds';

export interface CompareValue {
  value: number;
  prev?: number;
  ly?: number;
  ly2?: number;
  unit: Unit;
}

export interface FinancialBusinessUnit {
  id: number;
  name: string;
  revenue: CompareValue;
  spark: number[];
}

export interface FinancialDepartment {
  code: string;
  name: string;
  colorToken: string;
  revenue: CompareValue;
  target: number;
  jobs: number;
  opportunities: number;
  spark: number[];
  lySpark?: number[];
  ly2Spark?: number[];
  businessUnits?: FinancialBusinessUnit[];
}

export interface FinancialTrendPoint {
  date: string;
  actual: number;
  ly?: number;
  ly2?: number;
  target: number;
}

/**
 * Intraday pace: the day target spread evenly across the configured working
 * day, so morning revenue is compared against "what should be in by now"
 * instead of the whole day's number.
 */
export interface IntradayPace {
  /** Cents expected by now — target × elapsed workday fraction. 0 before the
   *  workday starts (and all day on weekends/holidays); equals the full day
   *  target after it ends. */
  expected: number;
  /** Target run rate, cents per working hour (target ÷ workdayHours). */
  hourlyTarget: number;
  /** Working hours elapsed so far, clamped to [0, workdayHours]. */
  elapsedHours: number;
  /** Configured working-day length in hours (admin setting, default 10). */
  workdayHours: number;
  /** Configured workday start as an hour-of-day, business-local (default 8). */
  startHour: number;
  /** False on weekends/holidays — expected stays 0, production is bonus. */
  isWorkday: boolean;
}

export interface DailyPace {
  /** The day being measured, YYYY-MM-DD. */
  date: string;
  /** Cents invoiced that day (partial if `isToday`). */
  revenue: number;
  /** Cents — that day's slice of the monthly target. */
  target: number;
  /** revenue / target, in bps (e.g. 10550 = 105.5%). */
  percentToGoal: number;
  /** true when `date` is the live calendar day (vs. a closed period). */
  isToday: boolean;
  /** Hour-by-hour pacing context. Optional so older cached payloads and
   *  closed-period days (where full-day comparison is right) still parse. */
  pace?: IntradayPace | null;
}

export interface FinancialResponse {
  total: {
    revenue: CompareValue;
    /** Pace-adjusted goal: full target × (days elapsed / days in target) per
     *  applicable target row, summed across the window. Compared against
     *  revenue to compute percentToGoal. */
    target: number;
    /** Full untouched goal: sum of every applicable target row's targetValue
     *  with no pro-rating. The "monthly target" / "annual target" the team
     *  ultimately needs to hit by the end of the window. */
    fullPeriodTarget: number;
    percentToGoal: number;
    /** Single-day pace (today vs today's slice of the monthly target). Null
     *  when the window's last day has no revenue target, so the hero can
     *  simply hide the card. */
    today: DailyPace | null;
  };
  departments: FinancialDepartment[];
  trend: FinancialTrendPoint[];
  kpis: {
    closeRate: CompareValue;
    avgTicket: CompareValue;
    opportunities: CompareValue;
    memberships: CompareValue;
  };
  potential: {
    /** Total averaged unsold pipeline in the last 30 days (hot + warm). */
    total: number;
    /** ≤7 days old — hot pipeline, team should follow up this week. */
    hot: number;
    /** 8–30 days old — warm, still actionable with a callback. */
    warm: number;
    /** Number of distinct jobs (customers) contributing to the pipeline.
     *  Multiple estimates on the same job collapse to the cheapest option. */
    jobCount: number;
    /** Jobs dropped because one of their options already sold — the losing
     *  siblings aren't potential, the sale is already in revenue. Optional
     *  so older cached payloads still parse. */
    soldJobsExcluded?: number;
    byDept: Array<{ code: string; name: string; hot: number; warm: number }>;
  };
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}

export interface ApiEnvelope<T> {
  data: T;
}

// ─── Technicians ─────────────────────────────────────────────────────────────

export interface Role {
  code: string;
  name: string;
  /** Human label for the primary metric column (e.g. "Closed revenue"). */
  primaryMetric: string;
  /** Which field the server sorted technicians by. */
  sortKey: 'revenue' | 'avgTicket' | 'jobs' | 'closeRate';
}

export interface Technician {
  rank: number;
  employeeId: number;
  name: string;
  departmentCode: string;
  photoUrl: string | null;
  revenue: number;           // cents — TotalSales from the report
  ly?: number;               // cents
  closeRate: number;         // bps
  lyCloseRate?: number;      // bps
  /** Sales opportunities. */
  opps: number;
  lyOpps?: number;
  /** Avg sale = TotalSales / ClosedOpportunities, in cents. (CA layout.) */
  avgSale: number;
  lyAvgSale?: number;
  /** Avg ticket = TotalJobAverage from ST, in cents. (Non-CA layout.) */
  avgTicket: number;
  lyAvgTicket?: number;
  /** Options per opportunity × 100. (CA layout.) */
  options: number;
  lyOptions?: number;
  /** CompletedJobs from ST. (Non-CA layout.) */
  jobs: number;
  lyJobs?: number;
  /** Memberships sold. (Non-CA layout.) */
  members: number;
  lyMembers?: number;
  /** Leads set — aka "Flips". (Non-CA layout.) */
  flips: number;
  lyFlips?: number;
  /** Total tech-lead sales in cents — aka "Flip sales". (Non-CA.) */
  flipSales: number;
  lyFlipSales?: number;
  trend: 'up' | 'down' | 'flat';
  spark: number[];
  lySpark?: number[];
  /** YYYY-MM labels aligned to `spark` (this year's trailing months). */
  sparkMonths?: string[];
}

export interface TeamRollup {
  revenue: CompareValue;
  closeRate: CompareValue;
  /** Avg sale = SUM(revenue) / SUM(closed_opps). Primary for CA. */
  avgSale: CompareValue;
  /** Avg ticket = SUM(revenue) / SUM(completed_jobs). Primary for non-CA. */
  avgTicket: CompareValue;
  /** Sum of sales opps across techs. Primary 4th metric for CA. */
  oppsDone: CompareValue;
  /** Sum of completed jobs across techs. Primary 4th metric for non-CA. */
  jobsDone: CompareValue;
}

export interface TechniciansResponse {
  role: Role;
  /** All roles — for sub-tab rendering on the client. */
  roles: Role[];
  team: TeamRollup;
  technicians: Technician[];
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}

// ─── Call Center ────────────────────────────────────────────────────────────

export interface HourlyCall {
  hr: string;
  calls: number;
  booked: number;
  lyCalls?: number;
  lyBooked?: number;
}

export interface Agent {
  name: string;
  calls: number;
  booked: number;
  rate: number;    // bps
  lyRate?: number; // bps
}

export interface CallCenterResponse {
  kpis: {
    booked: CompareValue;       // count
    bookRate: CompareValue;     // bps
    avgCallTime: CompareValue;  // seconds — duration of an average call
    abandonRate: CompareValue;  // bps
  };
  hourly: HourlyCall[];
  agents: Agent[];
  byDay: Array<{
    date: string;
    total: number;
    booked: number;
    bookRateBps: number;
    avgCallTimeSec: number;
    abandonRateBps: number;
  }>;
  /** Unbooked inbound lead calls grouped by ST call reason (what the
   *  customer called about), sorted by unbooked count desc. */
  unbookedReasons: Array<{ reason: string; leads: number; unbooked: number }>;
  /** Jobs canceled in the window grouped by cancel reason, sorted desc. */
  cancelReasons: Array<{ reason: string; count: number }>;
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}

// ─── Memberships ────────────────────────────────────────────────────────────

export interface MembershipSnapshot {
  active: number;
  newMonth: number;
  churnMonth: number;
  netMonth: number;
}

export interface MembershipTier {
  tier: string;
  count: number;
  lyCount?: number;
  price: number;                 // whole dollars
  colorToken: string;            // e.g. '--d-hvac'
}

// ─── Analyze (estimates) ────────────────────────────────────────────────────

export interface SeasonalityPoint {
  month: string; // 'Apr', 'May', ...
  /** Distinct opportunities (jobs) created that month. */
  opportunities: number;
  /** Of those, how many won. */
  won: number;
  /** Won revenue attributed to that month (cents). */
  wonRevenueCents: number;
  closeRateBps: number;
  avgTicketCents: number;
}

/** Close rate sliced by the size of the offer (avg option value per job). */
export interface AnalyzeValueBand {
  band: string; // 'Under $1k', '$1k–5k', ...
  opportunities: number;
  won: number;
  closeRateBps: number;
}

export interface AnalyzeDeptRow {
  code: string;
  name: string;
  opportunities: number;
  closeRateBps: number;
  avgTicketCents: number;
  wonRevenueCents: number;
  unsoldCents: number;
}

export interface AnalyzeResponse {
  totals: {
    opportunities: number;
    closeRateBps: number;
    unsoldCents: number;
    avgTicketCents: number;
    /** Funnel counts: opportunities = won + unsold + dismissed. */
    wonCount: number;
    unsoldCount: number;
    dismissedCount: number;
    wonRevenueCents: number;
    /** Median days from estimate creation to sale, won jobs only. */
    medianTtcDays: number | null;
  };
  tierSelection: Array<{
    tier: 'low' | 'mid' | 'high';
    count: number;
    pct: number;
    /** Average won ticket for jobs where this tier was picked. */
    avgTicketCents: number;
  }>;
  timeToClose: Array<{ bucket: 'same_day' | 'one_to_7' | 'over_7'; count: number; pct: number }>;
  valueBands: AnalyzeValueBand[];
  seasonality: SeasonalityPoint[];
  byDept: AnalyzeDeptRow[];
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}

export interface MembershipsResponse {
  active: number;
  goal: number;
  newMonth: number;
  churnMonth: number;
  netMonth: number;
  newWeek: number;
  ly?: MembershipSnapshot;
  ly2?: MembershipSnapshot;
  history: number[];             // 12-month active counts
  lyHistory?: number[];
  breakdown: MembershipTier[];
  meta: {
    period: string;
    asOf: string;
    from: string;
    to: string;
  };
}
