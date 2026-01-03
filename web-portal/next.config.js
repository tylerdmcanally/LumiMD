/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      // These rewrites are checked after pages/public files
      // but before dynamic routes
      beforeFiles: [
        // Root path serves the marketing landing page
        {
          source: '/',
          destination: '/landing.html',
        },
        // Get-started page
        {
          source: '/get-started',
          destination: '/get-started.html',
        },
        // Provider page
        {
          source: '/providers',
          destination: '/provider.html',
        },
      ],
    };
  },
}

module.exports = nextConfig


