import { NextResponse } from 'next/server';
import { getLocalDataSummary } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ summary: await getLocalDataSummary() });
  } catch (error) {
    console.error('本地数据概览读取失败：', error);
    return NextResponse.json({ error: '本地数据概览读取失败' }, { status: 500 });
  }
}
