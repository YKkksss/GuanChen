import { NextResponse, type NextRequest } from 'next/server';

/** 本地数据写入只接受同源网页；无来源头的命令行调用仍可使用。 */
export async function middleware(request: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return NextResponse.next();
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  let allowed = site !== 'cross-site';
  if (origin) {
    try {
      const source = new URL(origin);
      allowed = allowed && source.origin !== 'null'
        && source.host === request.headers.get('host')
        && source.protocol === request.nextUrl.protocol;
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

export const config = { matcher: '/api/:path*' };
