import { NextResponse } from 'next/server';
import { AccountError, createSession, registerUser, revokeSession } from '@/lib/auth/accounts';
import { accountError, requestToken, sessionCookie } from '@/lib/auth/route';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (process.env.AUTH_REGISTRATION_ENABLED === '0') throw new AccountError('当前服务暂不开放注册', 403);
    const body = await request.json();
    const user = await registerUser(body);
    const token = createSession(user.id);
    revokeSession(requestToken(request));
    return sessionCookie(NextResponse.json({ user }, { status: 201 }), request, token);
  } catch (error) { return accountError(error); }
}
