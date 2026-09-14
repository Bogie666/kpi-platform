'use client';

import { FilterCard } from './filter-card';
import {
  SOURCE_CLASSES,
  SOURCE_CLASS_COLOR,
  SOURCE_CLASS_HINT,
  SOURCE_CLASS_LABEL,
  type SourceClass,
} from '@/lib/kpi/source-class';

/**
 * The appointments page's two filter rows.
 *
 * Source class leads because demand-vs-maintenance is the headline read:
 * maintenance volume is pre-booked weeks out, so the demand count is the
 * number that says how the week is actually going. Department follows.
 *
 * The rows cross-filter each other — class counts are computed within the
 * selected department and vice versa — so the pair always describes the
 * same slice the day rows and job-type panel are showing.
 */

export interface DeptSlice {
  /** Stable key — the division code, or a sentinel for uncategorized. */
  key: string;
  code: string | null;
  name: string;
  total: number;
}

export interface AppointmentFiltersProps {
  /** Divisions with their count under the active class filter, busiest first. */
  depts: DeptSlice[];
  /** Count per source class under the active department filter. */
  classCounts: Record<SourceClass, number>;
  /** Denominator for the class row — total under the active department. */
  classScopeTotal: number;
  /** Denominator for the department row — total under the active class. */
  deptScopeTotal: number;
  selectedClass: SourceClass | null;
  selectedDept: string | null;
  onSelectClass: (cls: SourceClass | null) => void;
  onSelectDept: (key: string | null) => void;
}

function deptColor(code: string | null): string {
  return code ? `var(--d-${code})` : 'var(--muted)';
}

function share(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export function AppointmentFilters({
  depts,
  classCounts,
  classScopeTotal,
  deptScopeTotal,
  selectedClass,
  selectedDept,
  onSelectClass,
  onSelectDept,
}: AppointmentFiltersProps) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <span className="text-eyebrow uppercase tracking-[0.12em] text-muted">
          How the work arrived
        </span>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          <FilterCard
            label="All work"
            color="var(--muted)"
            count={classScopeTotal}
            share={100}
            size="lg"
            active={selectedClass === null}
            title="Every appointment, however it was booked"
            onClick={() => onSelectClass(null)}
          />
          {SOURCE_CLASSES.map((cls) => (
            <FilterCard
              key={cls}
              label={SOURCE_CLASS_LABEL[cls]}
              color={SOURCE_CLASS_COLOR[cls]}
              count={classCounts[cls]}
              share={share(classCounts[cls], classScopeTotal)}
              size="lg"
              active={selectedClass === cls}
              title={SOURCE_CLASS_HINT[cls]}
              onClick={() => onSelectClass(selectedClass === cls ? null : cls)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <span className="text-eyebrow uppercase tracking-[0.12em] text-muted">Department</span>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <FilterCard
            label="All departments"
            color="var(--accent)"
            count={deptScopeTotal}
            share={100}
            active={selectedDept === null}
            onClick={() => onSelectDept(null)}
          />
          {depts.map((d) => (
            <FilterCard
              key={d.key}
              label={d.name}
              color={deptColor(d.code)}
              count={d.total}
              share={share(d.total, deptScopeTotal)}
              active={selectedDept === d.key}
              // Clicking the active card clears the filter, matching the
              // click-again-to-clear behaviour of the day rows.
              onClick={() => onSelectDept(selectedDept === d.key ? null : d.key)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
