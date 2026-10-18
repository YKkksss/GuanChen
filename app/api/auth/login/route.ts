import { NextResponse } from 'next/server';
import { authenticate, createSession, revokeSession } from '@/lib/auth/accounts';
import { accountError, requestToken, sessionCookie } from '@/lib/auth/route';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await authenticate(body.username, body.password);
    const token = createSession(user.id);
    revokeSession(requestToken(request));
    return sessionCookie(NextResponse.json({ user }), request, token);
  } catch (error) { return accountError(error); }
}
