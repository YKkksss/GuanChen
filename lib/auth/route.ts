import { NextResponse } from 'next/server';
import { AccountError, SESSION_COOKIE, SESSION_SECONDS, userForSession } from './accounts';
import { runAsUser } from './scope';
import { leaseDatabaseScope } from '@/lib/db/client';

export function requestToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}
export function sessionCookie(response: NextResponse, request: Request, token: string, clear = false) {
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.AUTH_COOKIE_SECURE === '1' || new URL(request.url).protocol === 'https:', path: '/', maxAge: clear ? 0 : SESSION_SECONDS });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export function accountError(error: unknown) {
  return NextResponse.json({ error: error instanceof AccountError ? error.message : '账号操作失败，请稍后重试' }, { status: error instanceof AccountError ? error.status : 500, headers: { 'Cache-Control': 'private, no-store' } });
}
/** 所有业务接口在访问数据库前确认身份，路径、查询和请求体都无法指定其他用户。 */
export function withAccount<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const request = args[0] as Request;
    const user = userForSession(requestToken(request));
    if (!user) return NextResponse.json({ error: '请先登录', code: 'AUTH_REQUIRED' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    return runAsUser(user, async () => {
      const release = leaseDatabaseScope();
      try {
        const response = await handler(...args);
        response.headers.set('Cache-Control', 'private, no-store');
        if (!response.body || request.method === 'HEAD') {
          if (request.method === 'HEAD') {
            await response.body?.cancel();
            release();
            return new Response(null, { status: response.status, headers: response.headers });
          }
          release(); return response;
        }
        const reader = response.body.getReader();
        // 网络层读取/取消响应时仍进入原请求的用户空间。
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            return runAsUser(user, async () => {
              try {
                const chunk = await reader.read();
                if (chunk.done) { release(); controller.close(); }
                else controller.enqueue(chunk.value);
              } catch (error) { release(); controller.error(error); }
            });
          },
          cancel(reason) { return runAsUser(user, async () => { try { await reader.cancel(reason); } finally { release(); } }); },
        });
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      } catch (error) { release(); throw error; }
    });
  };
}
