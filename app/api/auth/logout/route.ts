import { NextResponse } from 'next/server';
import { revokeSession } from '@/lib/auth/accounts';
import { requestToken, sessionCookie } from '@/lib/auth/route';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  revokeSession(requestToken(request));
  return sessionCookie(NextResponse.json({ success: true }), request, '', true);
}
