import { NextResponse } from 'next/server';
import { updateMemoryItem } from '@/lib/db/context';
import { getConversation } from '@/lib/db/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string; memoryId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id, memoryId } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  const body = await request.json() as { content?: unknown };
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return NextResponse.json({ error: '记忆内容不能为空' }, { status: 400 });
  const memory = updateMemoryItem({ id: memoryId, conversationId: id, content });
  if (!memory) return NextResponse.json({ error: '记忆不存在' }, { status: 404 });
  return NextResponse.json({ memory });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, memoryId } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  const memory = updateMemoryItem({ id: memoryId, conversationId: id, status: 'deleted' });
  if (!memory) return NextResponse.json({ error: '记忆不存在' }, { status: 404 });
  return new Response(null, { status: 204 });
}
