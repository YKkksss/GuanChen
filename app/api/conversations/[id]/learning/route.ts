import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { getLearningNote } from '@/lib/db/learning';
import { LEARNING_NOTE_KNOWLEDGE_POINT, buildPalaceLearningLesson } from '@/lib/learning/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversation = getConversation(id);
  if (!conversation || conversation.type !== 'chart' || !conversation.chartSnapshot) {
    return NextResponse.json({ error: '单人命盘会话不存在' }, { status: 404 });
  }
  const rawBranch = new URL(request.url).searchParams.get('branch');
  const branch = rawBranch === null ? conversation.chartSnapshot.mingGongBranch : Number(rawBranch);
  if (!Number.isInteger(branch) || branch < 0 || branch > 11) {
    return NextResponse.json({ error: '宫位参数无效' }, { status: 400 });
  }
  try {
    return NextResponse.json({
      lesson: buildPalaceLearningLesson(conversation.chartSnapshot, branch),
      note: getLearningNote({ conversationId: id, knowledgePointId: LEARNING_NOTE_KNOWLEDGE_POINT, palaceBranch: branch }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '学习讲解生成失败' }, { status: 400 });
  }
}
