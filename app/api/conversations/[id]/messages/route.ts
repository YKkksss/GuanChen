import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { getConversation, listMessages } from '@/lib/db/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  return NextResponse.json({ messages: listMessages(id) });
}

export const GET = withAccount(GETHandler);
