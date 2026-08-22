import { NextResponse } from 'next/server';
import { materializeAllActiveReminders } from '@/lib/db/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = materializeAllActiveReminders();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '提醒生成失败' }, { status: 500 });
  }
}
