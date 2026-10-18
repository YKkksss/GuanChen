import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { materializeAllActiveReminders } from '@/lib/db/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(_request: Request) {
  try {
    const result = materializeAllActiveReminders();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '提醒生成失败' }, { status: 500 });
  }
}

export const POST = withAccount(POSTHandler);
