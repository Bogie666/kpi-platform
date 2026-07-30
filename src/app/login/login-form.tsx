'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Login failed');
        setBusy(false);
        return;
      }
      window.location.assign(next);
    } catch {
      setError('Network error');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-bg px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm flex flex-col gap-4 bg-surface border border-border rounded-panel p-6"
      >
        <h1 className="text-panel font-semibold">Sign in</h1>
        <label className="flex flex-col gap-1">
          <span className="text-meta text-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-surface-2 border border-border rounded-btn px-3 py-2 text-[14px] focus:outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-meta text-muted">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-surface-2 border border-border rounded-btn px-3 py-2 text-[14px] focus:outline-none focus:border-accent"
          />
        </label>
        {error && <div className="text-meta text-down">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="bg-accent text-bg font-medium rounded-btn px-4 py-2 text-[14px] disabled:opacity-50"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
        <div className="text-meta text-muted text-center pt-2">
          Don&apos;t have an account? Ask your admin.
        </div>
      </form>
    </div>
  );
}
