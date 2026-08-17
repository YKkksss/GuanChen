import { NextResponse } from 'next/server';
import { retryOpenPracticeFeedback } from '@/lib/learning/open-practice-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const { attemptId } = await context.params;
    const attempt = await retryOpenPracticeFeedback(attemptId);
    return NextResponse.json({ attempt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 反馈重试失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
