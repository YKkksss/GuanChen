import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import {
  getOrCreateAnnualTransit,
  getOrCreateDailyTransit,
  getOrCreateMonthlyTransit,
} from '@/lib/transits/service';

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
  if (level !== 'year' && level !== 'month' && level !== 'day') {
    return NextResponse.json({ error: '当前仅支持年度、流月或流日分析' }, { status: 400 });
  }

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rawDate = url.searchParams.get('date') ?? (level === 'year' ? String(now.getFullYear()) : today);
  if (level !== 'year' && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return NextResponse.json({ error: '流月或流日观察日期必须使用 YYYY-MM-DD 格式' }, { status: 400 });
  }
  const selectedYear = Number.parseInt(rawDate.slice(0, 4), 10);
  if (!Number.isInteger(selectedYear)) {
    return NextResponse.json({ error: '日期格式不正确' }, { status: 400 });
  }

  try {
    const transit = level === 'month'
      ? getOrCreateMonthlyTransit(id, rawDate)
      : level === 'day'
        ? getOrCreateDailyTransit(id, rawDate)
        : getOrCreateAnnualTransit(id, selectedYear);
    return NextResponse.json({ transit });
  } catch (error) {
    const message = error instanceof Error ? error.message : '运限分析生成失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
