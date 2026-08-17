import { NextResponse } from 'next/server';
import { setReviewItemStatus } from '@/lib/db/learning-practice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ reviewId: string }> }

export async function PUT(request: Request, context: RouteContext) {
  const { reviewId } = await context.params;
  try {
    const body = await request.json() as { status?: unknown };
    if (body.status !== 'due' && body.status !== 'mastered') {
      return NextResponse.json({ error: '复习状态无效' }, { status: 400 });
    }
    const item = setReviewItemStatus(reviewId, body.status);
    return item ? NextResponse.json({ item }) : NextResponse.json({ error: '复习题不存在' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '复习状态更新失败' }, { status: 400 });
  }
}
