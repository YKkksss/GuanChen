import { NextResponse } from 'next/server';
import { userForSession } from '@/lib/auth/accounts';
import { requestToken } from '@/lib/auth/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return NextResponse.json({ user: userForSession(requestToken(request)), registrationEnabled: process.env.AUTH_REGISTRATION_ENABLED !== '0' }, { headers: { 'Cache-Control': 'private, no-store' } });
}
