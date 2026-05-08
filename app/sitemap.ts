import fs from 'fs';
import path from 'path';

import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://ksef-saas.pl';

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, priority: 1.0, changeFrequency: 'weekly' },
    { url: `${baseUrl}/pricing`, priority: 0.9, changeFrequency: 'weekly' },
    {
      url: `${baseUrl}/kalkulator-oszczednosci`,
      priority: 0.8,
      changeFrequency: 'monthly',
    },
    { url: `${baseUrl}/blog`, priority: 0.8, changeFrequency: 'weekly' },
    { url: `${baseUrl}/vs/fakturownia`, priority: 0.9, changeFrequency: 'monthly' },
    { url: `${baseUrl}/vs/infakt`, priority: 0.9, changeFrequency: 'monthly' },
    { url: `${baseUrl}/vs/wfirma`, priority: 0.9, changeFrequency: 'monthly' },
    { url: `${baseUrl}/vs/ifirma`, priority: 0.9, changeFrequency: 'monthly' },
    { url: `${baseUrl}/kontakt`, priority: 0.5, changeFrequency: 'yearly' },
    { url: `${baseUrl}/legal/regulamin`, priority: 0.3, changeFrequency: 'yearly' },
    {
      url: `${baseUrl}/legal/polityka-prywatnosci`,
      priority: 0.3,
      changeFrequency: 'yearly',
    },
    { url: `${baseUrl}/legal/rodo`, priority: 0.3, changeFrequency: 'yearly' },
  ];

  const blogDir = path.join(process.cwd(), 'content/blog');
  const blogPages: MetadataRoute.Sitemap = fs.existsSync(blogDir)
    ? fs
        .readdirSync(blogDir)
        .filter((f) => f.endsWith('.mdx'))
        .map((f) => ({
          url: `${baseUrl}/blog/${f.replace(/\.mdx$/, '')}`,
          priority: 0.7,
          changeFrequency: 'monthly' as const,
        }))
    : [];

  return [...staticPages, ...blogPages];
}
