import { NextResponse, type NextRequest } from 'next/server';

/** 页面做登录引导；API 在 Node 路由内验证会话，写入保留同源检查。 */
export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    if (!['/login', '/register', '/privacy', '/terms'].includes(request.nextUrl.pathname)
      && !request.cookies.has('guanchen_session')) {
      const target = new URL('/login', process.env.APP_PUBLIC_ORIGIN || request.url);
      // Next 的内部请求来源可能是 localhost；直接访问时保留浏览器实际使用的主机与端口。
      if (!process.env.APP_PUBLIC_ORIGIN && request.headers.get('host')) target.host = request.headers.get('host')!;
      target.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      const response = NextResponse.redirect(target);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return NextResponse.next();
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  let allowed = site !== 'cross-site';
  if (origin) {
    try {
      const source = new URL(origin);
      const direct = source.host === request.headers.get('host') && source.protocol === request.nextUrl.protocol;
      const published = process.env.APP_PUBLIC_ORIGIN ? source.origin === new URL(process.env.APP_PUBLIC_ORIGIN).origin : false;
      allowed = allowed && source.origin !== 'null' && (direct || published);
    } catch {
      allowed = false;
    }
  }
  if (!allowed) return NextResponse.json({ error: '已拒绝非同源的数据写入请求' }, { status: 403 });
  // 当前业务 JSON 接口均以对象为根；上传备份的 multipart 请求不在此处解析。
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType === 'application/json') {
    try {
      const text = await request.clone().text();
      if (text.length > 1_048_576) return NextResponse.json({ error: '请求内容过大' }, { status: 413 });
      if (text.trim()) {
        const body: unknown = JSON.parse(text);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_body');
      }
    } catch {
      return NextResponse.json({ error: '请求体必须是有效的 JSON 对象' }, { status: 400 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|assets/|favicon.ico|robots.txt|sitemap.xml).*)'] };
