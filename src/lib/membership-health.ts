/** Aggregate-only membership snapshots. Contract from/to fields are calendar dates. */
export interface StMembership {
  id: number;
  status?: string;
  membershipTypeId?: number | null;
  from?: string | null;
  to?: string | null;
  cancellationDate?: string | null;
}
export interface StMembershipType { id: number; name: string; }
export interface MembershipEvents { starts: number; cancellations: number; expirations: number; }
export interface MembershipHealthCounts {
  active: number;
  suspended: number;
  endDatePastDue: number;
  endDate0To7: number;
  endDate8To30: number;
  endDate31To60: number;
  endDateOver60: number;
  noEndDate: number;
  expiringUnder30: number;
}
export interface MembershipPlanHealth extends MembershipHealthCounts {
  name: string;
  events: Record<string, MembershipEvents>;
}
export interface MembershipHealth extends MembershipHealthCounts {
  version: 1;
  snapshotDate: string;
  fetchedAt: string;
  timezone: string;
  membershipsFetched: number;
  missingStartDate: number;
  missingCancellationDate: number;
  missingExpirationDate: number;
  plans: MembershipPlanHealth[];
  events: Record<string, MembershipEvents>;
}
export function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function membershipDate(value: string | null | undefined, timezone: string, contract = false): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const day = value.slice(0, 10);
  if (day.startsWith('0001-') || day.startsWith('9999-')) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== day) return null;
  // ST contract dates and timezone-less timestamps represent calendar dates,
  // not instants. Never shift a date-only contract to the preceding day.
  if (contract || value.length === 10 || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return day;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? localDate(instant, timezone) : null;
}
export function shiftMembershipDate(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
const emptyCounts = (): MembershipHealthCounts => ({ active: 0, suspended: 0, endDatePastDue: 0, endDate0To7: 0, endDate8To30: 0, endDate31To60: 0, endDateOver60: 0, noEndDate: 0, expiringUnder30: 0 });
const emptyEvents = (): MembershipEvents => ({ starts: 0, cancellations: 0, expirations: 0 });
export function eventsInWindow(health: Pick<MembershipHealth, 'events' | 'snapshotDate'> | null, from: string, to: string): MembershipEvents | null {
  if (!health || to > health.snapshotDate) return null;
  const total = emptyEvents();
  for (const [day, counts] of Object.entries(health.events)) {
    if (day < from || day > to) continue;
    total.starts += counts.starts;
    total.cancellations += counts.cancellations;
    total.expirations += counts.expirations;
  }
  return total;
}
export function buildMembershipHealth(memberships: StMembership[], types: StMembershipType[], existingNames: string[], snapshotDate: string, timezone: string, fetchedAt = new Date().toISOString()): MembershipHealth {
  const names = new Map(types.map((type) => [type.id, type.name.trim() || `Membership type ${type.id}`]));
  const plans = new Map<string, MembershipPlanHealth>();
  const ensure = (name: string) => {
    if (!plans.has(name)) plans.set(name, { name, ...emptyCounts(), events: {} });
    return plans.get(name)!;
  };
  // Include inactive/empty types and formerly observed plans with explicit zeros.
  for (const name of [...names.values(), ...existingNames]) ensure(name);
  const result: MembershipHealth = { version: 1, snapshotDate, fetchedAt, timezone, membershipsFetched: memberships.length, ...emptyCounts(), missingStartDate: 0, missingCancellationDate: 0, missingExpirationDate: 0, plans: [], events: {} };
  const addEvent = (plan: MembershipPlanHealth, day: string | null, field: keyof MembershipEvents) => {
    if (!day || day > snapshotDate) return;
    const all = result.events[day] ?? (result.events[day] = emptyEvents());
    const perPlan = plan.events[day] ?? (plan.events[day] = emptyEvents());
    all[field]++;
    perPlan[field]++;
  };
  for (const membership of memberships) {
    const plan = ensure(membership.membershipTypeId == null ? 'Unknown membership type' : names.get(membership.membershipTypeId) ?? `Membership type ${membership.membershipTypeId}`);
    const status = membership.status?.toLowerCase();
    const from = membershipDate(membership.from, timezone, true);
    const end = membershipDate(membership.to, timezone, true);
    const canceled = membershipDate(membership.cancellationDate, timezone);
    if (!from) result.missingStartDate++;
    addEvent(plan, from, 'starts');
    if (status === 'canceled' || status === 'cancelled') {
      if (!canceled) result.missingCancellationDate++;
      addEvent(plan, canceled, 'cancellations');
    }
    if (status === 'expired') {
      if (!end) result.missingExpirationDate++;
      addEvent(plan, end, 'expirations');
    }
    if (status === 'suspended') plan.suspended++;
    if (status !== 'active') continue;
    // Count ST Active status even when the start date is absent.
    plan.active++;
    if (!end) { plan.noEndDate++; continue; }
    const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${snapshotDate}T00:00:00Z`)) / 86_400_000);
    if (days < 0) plan.endDatePastDue++;
    else if (days <= 7) plan.endDate0To7++;
    else if (days <= 30) plan.endDate8To30++;
    else if (days <= 60) plan.endDate31To60++;
    else plan.endDateOver60++;
    if (days >= 0 && days < 30) plan.expiringUnder30++;
  }
  result.plans = [...plans.values()].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  for (const plan of result.plans) {
    for (const key of Object.keys(emptyCounts()) as (keyof MembershipHealthCounts)[]) result[key] += plan[key];
  }
  return result;
}
export function parseMembershipHealth(value: unknown): MembershipHealth | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as MembershipHealth;
  if (candidate.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.snapshotDate) || !Array.isArray(candidate.plans) || !candidate.events || !Number.isFinite(candidate.active)) return null;
  return candidate;
}
/** Only complete, observed snapshots are eligible. No stock reconstruction. */
export function membershipSnapshotAsOf(snapshots: MembershipHealth[], asOf: string): MembershipHealth | null {
  return snapshots.filter((snapshot) => snapshot.snapshotDate <= asOf).sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate))[0] ?? null;
}
