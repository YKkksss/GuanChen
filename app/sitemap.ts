import type { MetadataRoute } from 'next';

// 本地版不发布页面索引。
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
