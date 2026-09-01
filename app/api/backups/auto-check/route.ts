import { NextResponse } from 'next/server';
import { ensureAutomaticBackupDue } from '@/lib/backups/lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  try {
    return NextResponse.json({ result: await ensureAutomaticBackupDue() });
  } catch (error) {
    console.error('自动备份检查失败：', error);
    return NextResponse.json({ error: '自动备份检查失败，请稍后重试' }, { status: 500 });
  }
}
