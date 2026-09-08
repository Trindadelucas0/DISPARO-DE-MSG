import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    // O importador recebe planilhas inteiras via Server Action / route handler.
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // exceljs e ioredis só rodam no servidor; evita bundling no cliente.
  serverExternalPackages: ['exceljs', 'ioredis', 'bcryptjs'],
};

export default nextConfig;
