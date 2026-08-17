import { NextResponse } from 'next/server';
import { submitReviewAnswer } from '@/lib/db/learning-practice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ reviewId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { reviewId } = await context.params;
  try {
    const body = await request.json() as { selectedOptionId?: unknown };
    if (typeof body.selectedOptionId !== 'string' || !body.selectedOptionId.trim()) {
      return NextResponse.json({ error: '请选择一个答案' }, { status: 400 });
    }
    return NextResponse.json(submitReviewAnswer(reviewId, body.selectedOptionId.trim()));
  } catch (error) {
    const message = error instanceof Error ? error.message : '复习答案提交失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
