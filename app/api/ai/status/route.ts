import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { getAiStatus } from '@/lib/ai/status';
import { getAiUsage } from '@/lib/auth/accounts';
import { currentUser } from '@/lib/auth/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(_request: Request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  const status = getAiStatus();
  return NextResponse.json({ ...status, usage: getAiUsage(user.id, status.dailyLimit) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withAccount(GETHandler);
