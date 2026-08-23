import { NextResponse } from 'next/server';
import { createMonthlyReview, listMonthlyReviews } from '@/lib/db/monthly-reviews';
import type { MonthlyReviewDraftInput, MonthlyReviewStatus } from '@/lib/monthly-reviews/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusValue = url.searchParams.get('status');
    const status = statusValue === 'draft' || statusValue === 'confirmed'
      ? statusValue as MonthlyReviewStatus
      : undefined;
    const limit = Number(url.searchParams.get('limit') || 50);
    const offset = Number(url.searchParams.get('offset') || 0);
    return NextResponse.json({
      reviews: listMonthlyReviews({
        conversationId: url.searchParams.get('conversationId') ?? undefined,
        status,
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '月度复盘加载失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as MonthlyReviewDraftInput;
    const review = createMonthlyReview(input);
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '月度复盘创建失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
