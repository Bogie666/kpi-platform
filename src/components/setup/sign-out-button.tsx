'use client';

export function SignOutButton() {
  async function onClick() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/setup/login';
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] text-muted hover:text-text transition-colors"
    >
      Sign out
    </button>
  );
}
