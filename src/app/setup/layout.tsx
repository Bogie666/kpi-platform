import Link from 'next/link';
import { SignOutButton } from '@/components/setup/sign-out-button';

export const dynamic = 'force-dynamic';

/** Minimal shell for /setup/*. No NavBar (would distract from the wizard). */
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border">
        <div className="flex items-center gap-4 px-4 md:px-[var(--density-pad-x)] h-14 md:h-16">
          <Link href="/setup" className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="h-7 w-7 rounded-md"
              style={{
                background:
                  'linear-gradient(135deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 70%, var(--d-commercial)) 100%)',
              }}
            />
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold tracking-tight">KPI Platform setup</span>
              <span className="text-[11px] text-muted">First-run configuration</span>
            </div>
          </Link>
          <div className="ml-auto">
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="px-4 md:px-[var(--density-pad-x)] py-6 md:py-[var(--density-pad-y)]">
        {children}
      </main>
    </div>
  );
}
