import type { MetadataRoute } from 'next';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://34.158.47.112').replace(/\/+$/, '');

/**
 * Generates the robots.txt file for the website.
 * This function returns an object that defines the rules for web crawlers,
 * specifies the location of the sitemap, and sets the host.
 * It allows all user agents to crawl the entire site except for the API routes.
 * @returns A MetadataRoute.Robots object.
 */
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
