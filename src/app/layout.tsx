import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Providers } from './providers';
import { getConfig, getDivisions } from '@/lib/config-service';
import '@/styles/globals.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // Read company name from the wizard-populated config. Fall back to a neutral
  // platform name so the title is sensible before setup is done.
  let companyName: string | null = null;
  try {
    companyName = await getConfig('company_name');
  } catch {
    /* DB unreachable — fall through to defaults */
  }
  const title = companyName ? `${companyName} KPI` : 'KPI Platform';
  return {
    title,
    description: companyName ? `${companyName} KPI dashboard` : 'KPI Platform dashboard',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Emit `--d-${code}: <hex>` for every division at runtime. Every existing
  // chart and panel references `var(--d-${code})` directly, so this single
  // injected <style> block lets the wizard control colors without a per-
  // component refactor (see Build Spec §9.4).
  let divisionStyles = '';
  try {
    const divisions = await getDivisions(true);
    const decls = divisions
      .filter((d) => d.color)
      .map((d) => `--d-${d.code}: ${d.color};`)
      .join(' ');
    if (decls) divisionStyles = `:root { ${decls} }`;
  } catch {
    /* DB unreachable — tokens.css fallbacks still apply */
  }

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} data-density="cozy">
      <head>
        {divisionStyles && (
          <style
            data-source="company-config-divisions"
            dangerouslySetInnerHTML={{ __html: divisionStyles }}
          />
        )}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
