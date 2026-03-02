import type { MetadataRoute } from 'next';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://34.124.244.233').replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/schoolcatering/api/'],
    },
    sitemap: `${siteUrl}/schoolcatering/sitemap.xml`,
    host: siteUrl,
  };
}
