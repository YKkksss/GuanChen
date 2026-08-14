import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { listLifeEvents } from '@/lib/db/events';
import { LIFE_EVENT_CATEGORIES, type LifeEventCategory } from '@/lib/events/types';
import { createLifeEventWithTransits } from '@/lib/events/service';
import { parseLifeEventInput } from '@/lib/events/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  const url = new URL(request.url);
  const rawCategory = url.searchParams.get('category');
  const category = rawCategory && LIFE_EVENT_CATEGORIES.includes(rawCategory as LifeEventCategory)
    ? rawCategory as LifeEventCategory
    : undefined;
  const rawYear = url.searchParams.get('year');
  const year = rawYear ? Number.parseInt(rawYear, 10) : undefined;
  if (rawYear && !Number.isInteger(year)) {
    return NextResponse.json({ error: '年份格式不正确' }, { status: 400 });
  }
  const events = listLifeEvents({ conversationId: id, category, year });
  if (url.searchParams.get('format') === 'json') {
    return new Response(JSON.stringify({
      exportedAt: new Date().toISOString(),
      conversation: { id: conversation.id, title: conversation.title },
      events,
    }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="life-events-${id}.json"`,
      },
    });
  }
  return NextResponse.json({ events });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const event = createLifeEventWithTransits(id, parseLifeEventInput(body));
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '事件创建失败' },
      { status: 400 },
    );
  }
}
