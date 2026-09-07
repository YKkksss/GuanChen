import type { MetadataRoute } from 'next';

// 本地档案工作台不面向搜索引擎；此声明不替代访问控制。
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
