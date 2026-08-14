import { NextResponse } from 'next/server';
import { deleteLifeEvent, getLifeEvent } from '@/lib/db/events';
import { updateLifeEventWithTransits } from '@/lib/events/service';
import { parseLifeEventInput } from '@/lib/events/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string; eventId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id, eventId } = await context.params;
  const event = getLifeEvent(eventId);
  if (!event || event.conversationId !== id) {
    return NextResponse.json({ error: '事件不存在' }, { status: 404 });
  }
  return NextResponse.json({ event });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id, eventId } = await context.params;
  const existing = getLifeEvent(eventId);
  if (!existing || existing.conversationId !== id) {
    return NextResponse.json({ error: '事件不存在' }, { status: 404 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const event = updateLifeEventWithTransits(id, eventId, parseLifeEventInput(body));
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '事件更新失败' },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, eventId } = await context.params;
  const existing = getLifeEvent(eventId);
  if (!existing || existing.conversationId !== id) {
    return NextResponse.json({ error: '事件不存在' }, { status: 404 });
  }
  deleteLifeEvent(eventId);
  return new Response(null, { status: 204 });
}
