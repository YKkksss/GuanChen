import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { getMonthlyTransitYearOverview } from '@/lib/transits/service';

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
  const rawYear = url.searchParams.get('year') ?? '';
  if (!/^\d{4}$/.test(rawYear)) {
    return NextResponse.json({ error: '农历流年必须使用四位年份' }, { status: 400 });
  }

  try {
    const overview = getMonthlyTransitYearOverview(id, Number.parseInt(rawYear, 10));
    return NextResponse.json({ overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : '全年流月生成失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
