import { NextResponse } from 'next/server';
import { listActiveMemories, listContextRuns } from '@/lib/db/context';
import {
  rebuildConversationMemories,
  rebuildConversationSummary,
} from '@/lib/context/maintenance';
import { getConversation } from '@/lib/db/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || 20);
  return NextResponse.json({
    summary: conversation.summary,
    summaryThroughSeq: conversation.summaryThroughSeq,
    summaryVersion: conversation.summaryVersion,
    summaryUpdatedAt: conversation.summaryUpdatedAt,
    memories: listActiveMemories(id),
    contextRuns: listContextRuns(id, Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 20, 1), 100)),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  if (body.action !== 'rebuild_summary' && body.action !== 'rebuild_memories') {
    return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
  }
  try {
    if (body.action === 'rebuild_memories') {
      const result = await rebuildConversationMemories(id);
      return NextResponse.json({ ...result, memories: listActiveMemories(id) });
    }
    const batches = await rebuildConversationSummary(id);
    const conversation = getConversation(id)!;
    return NextResponse.json({
      summary: conversation.summary,
      summaryThroughSeq: conversation.summaryThroughSeq,
      summaryVersion: conversation.summaryVersion,
      summaryUpdatedAt: conversation.summaryUpdatedAt,
      batches,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '摘要重建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
