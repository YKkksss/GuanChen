import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { listLifeEventCandidates } from '@/lib/db/event-candidates';
import { extractLifeEventCandidates } from '@/lib/events/candidate-service';
import type { LifeEventCandidateStatus } from '@/lib/events/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  const rawStatus = new URL(request.url).searchParams.get('status');
  const status = rawStatus === 'pending' || rawStatus === 'confirmed' || rawStatus === 'dismissed'
    ? rawStatus as LifeEventCandidateStatus
    : undefined;
  return NextResponse.json({
    candidates: listLifeEventCandidates({ conversationId: id, status, limit: 100 }),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  try {
    const body = await request.json().catch(() => ({})) as { sourceMessageId?: unknown };
    const sourceMessageId = typeof body.sourceMessageId === 'string' ? body.sourceMessageId : '';
    if (!sourceMessageId) return NextResponse.json({ error: '缺少来源消息' }, { status: 400 });
    const result = await extractLifeEventCandidates({ conversationId: id, sourceMessageId });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '人生事件候选提取失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 422 });
  }
}
