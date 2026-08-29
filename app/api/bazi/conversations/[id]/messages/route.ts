import { NextResponse } from 'next/server';
import { getBaziConversation, listBaziMessages } from '@/lib/db/bazi-conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziConversation(id)) return NextResponse.json({ error: '八字会话不存在' }, { status: 404 });
  return NextResponse.json({ messages: listBaziMessages(id) });
}
