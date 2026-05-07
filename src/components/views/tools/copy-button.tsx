'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* noop */
        }
      }}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-btn bg-surface-2 hover:bg-surface-2/70 text-text border border-border transition-colors"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-up" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> {label}
        </>
      )}
    </button>
  );
}
