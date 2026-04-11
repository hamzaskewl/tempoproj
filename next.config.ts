import type { NextConfig } from 'next'

const config: NextConfig = {
  trailingSlash: false,
  images: { unoptimized: true },
  serverExternalPackages: ['ws', 'postgres'],
  webpack: (config) => {
    // The src/ modules use .js extensions in imports (ESM convention).
    // Tell webpack to also try .ts when resolving .js files.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
}

export default config
