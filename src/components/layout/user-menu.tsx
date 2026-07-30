'use client';

import { useEffect, useState } from 'react';
import { LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

interface Me {
  email: string;
  name: string | null;
  isAdmin: boolean;
}

/**
 * Right-edge user cluster — admin gear (admins only) + initials chip with
 * click-to-sign-out. Hidden until /api/auth/me confirms a session, so the
 * public TV / widget pages stay clean.
 */
export function UserMenu({ className }: { className?: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j) => {
        if (alive) setMe(j.user ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!me) return null;

  const initials = (me.name ?? me.email)
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    window.location.assign('/login');
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {me.isAdmin && (
        <Link
          href="/admin"
          title="Admin"
          aria-label="Admin"
          className="p-2 rounded-btn text-muted hover:text-text hover:bg-surface-2/60 transition-colors"
        >
          <Settings className="h-4 w-4" />
        </Link>
      )}
      <button
        onClick={signOut}
        disabled={busy}
        title={`${me.email} - click to sign out`}
        aria-label="Sign out"
        className={cn(
          'flex items-center gap-1.5 px-1.5 py-1 rounded-btn',
          'text-muted hover:text-text hover:bg-surface-2/60 transition-colors',
          'disabled:opacity-50',
        )}
      >
        <span
          aria-hidden="true"
          className="h-6 w-6 rounded-full grid place-items-center bg-surface-2 text-[10px] font-medium text-text"
        >
          {initials || '?'}
        </span>
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
