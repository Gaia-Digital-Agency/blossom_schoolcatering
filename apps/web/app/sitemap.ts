import type { MetadataRoute } from 'next';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://34.124.244.233').replace(/\/+$/, '');
const base = `${siteUrl}/schoolcatering`;

/**
 * Generates the sitemap.xml file for the website.
 * This function returns an array of URL objects that represent the public pages of the site.
 * It helps search engines understand the structure of the site and discover all the pages.
 * @returns A MetadataRoute.Sitemap array.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // List of public routes to be included in the sitemap.
  const routes = [
    '/',
    '/home',
    '/menu',
    '/guide',
    '/privacy-and-confidentiality',
    '/login',
    '/register',
    '/register/youngster',
    '/register/delivery',
    '/student/login',
    '/family/login',
    '/admin/login',
    '/kitchen/login',
    '/delivery/login',
  ];

  // Map over the routes to create the sitemap structure.
  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 0.8 : 0.6,
  }));
}
