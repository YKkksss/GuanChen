import { NextResponse } from 'next/server';
import { getBackupLifecycleSummary } from '@/lib/backups/lifecycle';
import { getLocalDataSummary } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [data, lifecycle] = await Promise.all([
      getLocalDataSummary(),
      getBackupLifecycleSummary(),
    ]);
    return NextResponse.json({ summary: { ...data, ...lifecycle } });
  } catch (error) {
    console.error('本地数据概览读取失败：', error);
    return NextResponse.json({ error: '本地数据概览读取失败' }, { status: 500 });
  }
}
