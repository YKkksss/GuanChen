import { NextResponse } from 'next/server';
import { getBaziConversation, listBaziContextRuns } from '@/lib/db/bazi-conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversation = getBaziConversation(id);
  if (!conversation) return NextResponse.json({ error: '八字会话不存在' }, { status: 404 });
  return NextResponse.json({
    summary: conversation.summary,
    summaryThroughSeq: conversation.summaryThroughSeq,
    summaryVersion: conversation.summaryVersion,
    promptVersion: conversation.promptVersion,
    runs: listBaziContextRuns(id),
  });
}
