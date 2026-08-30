import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { confirmLifeEventCandidate, dismissCandidate } from '@/lib/events/candidate-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string; candidateId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { id, candidateId } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  try {
    const body = await request.json().catch(() => ({})) as {
      action?: unknown;
      event?: unknown;
    };
    if (body.action === 'dismiss') {
      return NextResponse.json({ candidate: dismissCandidate({ conversationId: id, candidateId }) });
    }
    if (body.action === 'confirm') {
      if (!body.event || typeof body.event !== 'object' || Array.isArray(body.event)) {
        return NextResponse.json({ error: '缺少待确认的事件内容' }, { status: 400 });
      }
      return NextResponse.json(confirmLifeEventCandidate({
        conversationId: id,
        candidateId,
        event: body.event as Record<string, unknown>,
      }));
    }
    return NextResponse.json({ error: '不支持的候选操作' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '人生事件候选更新失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
