import { NextResponse } from 'next/server';
import {
  deleteConversation,
  getConversation,
  listMessages,
  updateConversation,
} from '@/lib/db/conversations';
import type { ConversationStatus } from '@/lib/conversations/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  return NextResponse.json({ conversation, messages: listMessages(id) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json() as { title?: unknown; status?: unknown };
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : undefined;
  const status: ConversationStatus | undefined = body.status === 'active' || body.status === 'archived'
    ? body.status
    : undefined;
  if (!title && !status) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  }
  const conversation = updateConversation(id, { title, status });
  if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!deleteConversation(id)) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
