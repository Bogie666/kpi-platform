'use client';

import { cn } from '@/lib/cn';

/**
 * One selectable facet on the appointments page — a department, or a source
 * class. Shared so both filter rows read as the same control: colour chip,
 * label, count, share of the current scope, and a share bar.
 */
export interface FilterCardProps {
  label: string;
  /** CSS colour for the chip and share bar. */
  color: string;
  count: number;
  /** 0–100, share of the active scope. */
  share: number;
  active: boolean;
  onClick: () => void;
  /** Native tooltip — used to explain what a source class means. */
  title?: string;
  /** `lg` is for the demand/maintenance row, which is the headline read. */
  size?: 'md' | 'lg';
}

export function FilterCard({
  label,
  color,
  count,
  share,
  active,
  onClick,
  title,
  size = 'md',
}: FilterCardProps) {
  const lg = size === 'lg';
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={title ?? `${label} — ${count} appointments (${share}% of scope)`}
      className={cn(
        'flex flex-col text-left rounded-card border transition-colors cursor-pointer',
        lg ? 'gap-2 px-4 py-3' : 'gap-1.5 px-3 py-2.5',
        active ? 'bg-surface-2/40' : 'border-border hover:bg-surface-2/25',
      )}
      style={active ? { borderColor: color } : undefined}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={cn('rounded-[3px] shrink-0', lg ? 'h-3 w-3' : 'h-2.5 w-2.5')}
          style={{ background: color }}
          aria-hidden
        />
        <span
          className={cn(
            'truncate',
            lg ? 'text-[13px]' : 'text-[12px]',
            active ? 'font-medium' : 'text-muted',
          )}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'font-mono tabular-nums font-semibold leading-none',
            lg ? 'text-[26px]' : 'text-[19px]',
          )}
        >
          {count}
        </span>
        <span className={cn('font-mono tabular-nums text-muted', lg ? 'text-[12px]' : 'text-[11px]')}>
          {share}%
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${share}%`, background: color, opacity: active ? 1 : 0.65 }}
        />
      </div>
    </button>
  );
}
