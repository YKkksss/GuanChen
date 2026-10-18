import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { getCalendarDay, getCalendarMonth, CalendarError } from '@/lib/fortune-calendar/service';
import { isCalendarTopic } from '@/lib/fortune-calendar/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function GETHandler(request: Request, context: Context) {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams, topic = query.get('topic') ?? 'overview';
  if (!isCalendarTopic(topic)) return NextResponse.json({ error: '请选择有效的解读主题' }, { status: 400 });
  try {
    const date = query.get('date');
    return NextResponse.json(date !== null ? { detail: getCalendarDay(id, date, topic) } : { calendar: getCalendarMonth(id, query.get('month'), topic) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CalendarError ? error.message : '日历读取失败，请稍后重试' }, { status: error instanceof CalendarError ? error.status : 500 });
  }
}
export const GET = withAccount(GETHandler);
