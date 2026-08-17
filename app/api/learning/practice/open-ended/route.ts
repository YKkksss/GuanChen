import { NextResponse } from 'next/server';
import {
  getOpenPracticeWorkspace,
  isOpenExerciseTemplateId,
  submitOpenPractice,
} from '@/lib/learning/open-practice-service';
import { listOpenPracticeTemplates } from '@/lib/learning/open-practice-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const conversationId = params.get('conversationId')?.trim();
  const templateId = params.get('templateId')?.trim() || 'ming-structure';
  if (!conversationId) return NextResponse.json({ templates: listOpenPracticeTemplates() });
  if (!isOpenExerciseTemplateId(templateId)) return NextResponse.json({ error: '开放式练习类型无效' }, { status: 400 });
  try {
    return NextResponse.json(getOpenPracticeWorkspace(conversationId, templateId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '开放式练习加载失败' }, { status: 404 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.conversationId !== 'string' || !body.conversationId.trim()) {
      return NextResponse.json({ error: '请选择单人命盘' }, { status: 400 });
    }
    if (!isOpenExerciseTemplateId(body.templateId)) {
      return NextResponse.json({ error: '开放式练习类型无效' }, { status: 400 });
    }
    if (typeof body.answer !== 'string') {
      return NextResponse.json({ error: '请先填写解盘答案' }, { status: 400 });
    }
    const parentAttemptId = typeof body.parentAttemptId === 'string' && body.parentAttemptId.trim()
      ? body.parentAttemptId.trim()
      : null;
    const attempt = await submitOpenPractice({
      conversationId: body.conversationId.trim(),
      templateId: body.templateId,
      answer: body.answer,
      parentAttemptId,
    });
    return NextResponse.json({ attempt });
  } catch (error) {
    const message = error instanceof Error ? error.message : '开放式练习提交失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
