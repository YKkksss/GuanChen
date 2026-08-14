import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { getOrCreateAnnualTransit } from '@/lib/transits/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversation = getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  }

  const url = new URL(request.url);
  const level = url.searchParams.get('level') ?? 'year';
  if (level !== 'year') {
    return NextResponse.json({ error: '第一版暂时只支持年度分析' }, { status: 400 });
  }

  const rawDate = url.searchParams.get('date') ?? String(new Date().getFullYear());
  const selectedYear = Number.parseInt(rawDate.slice(0, 4), 10);
  if (!Number.isInteger(selectedYear)) {
    return NextResponse.json({ error: '日期格式不正确' }, { status: 400 });
  }

  try {
    const transit = getOrCreateAnnualTransit(id, selectedYear);
    return NextResponse.json({ transit });
  } catch (error) {
    const message = error instanceof Error ? error.message : '年度分析生成失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
