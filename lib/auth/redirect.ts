/** URL 解析会规范化控制字符和反斜线，登录后仅返回本站页面。 */
export function safeAccountDestination(next: string | null, origin: string): string {
  if (!next?.startsWith('/')) return '/';
  try {
    const target = new URL(next, origin);
    if (target.origin !== origin || ['/login', '/register'].includes(target.pathname)) return '/';
    return target.pathname + target.search + target.hash;
  } catch { return '/'; }
}
