/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compress responses with gzip — reduces payload size for JS/HTML/JSON
  compress: true,

  // Allow Next.js Image component to serve optimised WebP/AVIF from the API
  images: {
    remotePatterns: [
      { protocol: 'http',  hostname: '34.158.47.112' },
      { protocol: 'https', hostname: '34.158.47.112' },
      { protocol: 'https', hostname: 'schoolcatering.gaiada1.online' },
      { protocol: 'https', hostname: 'blossomcatering.online' },
      { protocol: 'http',  hostname: 'localhost' },
    ],
    // Cache optimised images for 7 days on the client
    minimumCacheTTL: 604800,
  },

  // Aggressive HTTP cache headers for static assets (_next/static/*)
  async headers() {
    return [
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
