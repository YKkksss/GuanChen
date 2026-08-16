import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { saveLearningNote } from '@/lib/db/learning';
import { LEARNING_NOTE_KNOWLEDGE_POINT } from '@/lib/learning/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversation = getConversation(id);
  if (!conversation || conversation.type !== 'chart') return NextResponse.json({ error: '单人命盘会话不存在' }, { status: 404 });
  try {
    const body = await request.json() as { branch?: unknown; content?: unknown };
    if (!Number.isInteger(body.branch) || Number(body.branch) < 0 || Number(body.branch) > 11) {
      return NextResponse.json({ error: '宫位参数无效' }, { status: 400 });
    }
    if (typeof body.content !== 'string') return NextResponse.json({ error: '学习笔记内容无效' }, { status: 400 });
    const note = saveLearningNote({ conversationId: id, knowledgePointId: LEARNING_NOTE_KNOWLEDGE_POINT, palaceBranch: Number(body.branch), content: body.content });
    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '学习笔记保存失败' }, { status: 400 });
  }
}
