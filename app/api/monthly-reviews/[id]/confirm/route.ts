import { NextResponse } from 'next/server';
import { confirmMonthlyReview } from '@/lib/db/monthly-reviews';
import type { ConfirmMonthlyReviewInput } from '@/lib/monthly-reviews/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const input = await request.json().catch(() => ({})) as ConfirmMonthlyReviewInput;
    const review = confirmMonthlyReview(id, input);
    return review
      ? NextResponse.json({ review })
      : NextResponse.json({ error: '月度复盘不存在' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '月度复盘确认失败' }, { status: 400 });
  }
}
