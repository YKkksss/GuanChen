import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { getBaziConversation } from '@/lib/db/bazi-conversations';
import { findChatRequest, type ChatKind } from '@/lib/db/chat-replies';
import { cancelGeneration, isRequestId } from './generations';

export async function cancelChatRequest(request: Request, id: string, kind: ChatKind) {
  const conversation = kind === 'bazi' ? getBaziConversation(id) : getConversation(id);
  if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  const body = await request.json().catch(() => null) as { requestId?: unknown } | null;
  if (!isRequestId(body?.requestId)) return NextResponse.json({ error: '请求标识无效' }, { status: 400 });
  const saved = findChatRequest(kind, body.requestId);
  if (saved && saved.conversationId !== id) return NextResponse.json({ error: '请求不属于此会话' }, { status: 404 });
  if (saved && saved.status !== 'streaming') return NextResponse.json({ status: saved.status });
  const stopped = cancelGeneration(kind, id, body.requestId);
  return NextResponse.json({ status: stopped ? 'cancelled' : 'cancellation_requested' });
}
