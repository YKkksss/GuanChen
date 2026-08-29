import { NextResponse } from 'next/server';
import {
  deleteBaziConversation,
  getBaziConversation,
  listBaziMessages,
  updateBaziConversation,
} from '@/lib/db/bazi-conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversation = getBaziConversation(id);
  if (!conversation) return NextResponse.json({ error: '八字会话不存在' }, { status: 404 });
  return NextResponse.json({ conversation, messages: listBaziMessages(id) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json() as { title?: unknown; status?: unknown };
  const status = body.status === 'active' || body.status === 'archived' ? body.status : undefined;
  const conversation = updateBaziConversation(id, {
    title: typeof body.title === 'string' ? body.title : undefined,
    status,
  });
  if (!conversation) return NextResponse.json({ error: '八字会话不存在' }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!deleteBaziConversation(id)) return NextResponse.json({ error: '八字会话不存在' }, { status: 404 });
  return new Response(null, { status: 204 });
}
