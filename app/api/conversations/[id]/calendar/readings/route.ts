import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { CalendarError, generateCalendarReading } from '@/lib/fortune-calendar/service';
import { isCalendarTopic } from '@/lib/fortune-calendar/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function POSTHandler(request: Request, context: Context) {
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: '请求体必须是有效 JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: '解读参数格式错误' }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.date !== 'string' || !isCalendarTopic(input.topic)) return NextResponse.json({ error: '请指定日期和有效主题' }, { status: 400 });
  try {
    const reading = await generateCalendarReading(id, input.date, input.topic, request.signal);
    return NextResponse.json({ reading }, { status: reading.status === 'generating' ? 202 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CalendarError ? error.message : '日期或解读参数不正确' }, { status: error instanceof CalendarError ? error.status : 400 });
  }
}
export const POST = withAccount(POSTHandler);
