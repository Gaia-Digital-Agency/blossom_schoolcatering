import type { MetadataRoute } from 'next';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://34.124.244.233').replace(/\/+$/, '');
const base = `${siteUrl}/schoolcatering`;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
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
    '/parent/login',
    '/youngster/login',
    '/admin/login',
    '/kitchen/login',
    '/delivery/login',
  ];

  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 0.8 : 0.6,
  }));
}
