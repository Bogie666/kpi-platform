import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep local QA bounded in shared sandboxes; hosted builds use Next defaults.
  ...(process.env.QA_BUILD_CPUS ? { experimental: { cpus: Number(process.env.QA_BUILD_CPUS) } } : {}),
  // /api/admin/db-setup reads migration SQL files at runtime. Ensure Vercel
  // packages the drizzle/ folder with that serverless function bundle.
  outputFileTracingIncludes: {
    '/api/admin/db-setup': ['./drizzle/**/*'],
  },
};

export default nextConfig;
