import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // Type checking is done separately via `npm run typecheck`
    // Skipping here to avoid Next.js internal type generation bugs
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.whatsapp-session/**',
        '**/.next/**',
        '**/dist-electron/**',
        '**/.data/**',
        '**/resources/**',
        '**/node-runtime.exe',
        '**/dist/**',
      ],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json', '.css'],
  },
};

export default nextConfig;
