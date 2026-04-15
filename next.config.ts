import type { NextConfig } from 'next'

const config: NextConfig = {
  trailingSlash: false,
  images: { unoptimized: true },
  serverExternalPackages: [
    'ws',
    'postgres',
    'express',
    'drizzle-orm',
    '@anthropic-ai/sdk',
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
}

export default config
