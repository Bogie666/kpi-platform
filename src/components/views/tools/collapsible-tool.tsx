'use client';

import { useState, type ReactNode, type ComponentType } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';

export interface CollapsibleToolProps {
  icon: ComponentType<{ className?: string }>;
  iconColorVar: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleTool({
  icon: Icon,
  iconColorVar,
  title,
  description,
  defaultOpen = false,
  children,
}: CollapsibleToolProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Panel padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted shrink-0" />
        )}
        <span
          className="shrink-0 inline-flex"
          style={{ color: `var(${iconColorVar})` }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-semibold leading-tight">{title}</span>
          {description && (
            <span className="text-[12px] text-muted leading-tight mt-0.5">{description}</span>
          )}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-border/60">{children}</div>
      )}
    </Panel>
  );
}
