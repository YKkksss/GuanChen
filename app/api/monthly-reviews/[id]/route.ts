import { NextResponse } from 'next/server';
import { deleteMonthlyReview, getMonthlyReview, updateMonthlyReview } from '@/lib/db/monthly-reviews';
import type { MonthlyReviewUpdateInput } from '@/lib/monthly-reviews/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const review = getMonthlyReview(id);
  return review
    ? NextResponse.json({ review })
    : NextResponse.json({ error: '月度复盘不存在' }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const input = await request.json() as MonthlyReviewUpdateInput;
    const review = updateMonthlyReview(id, input);
    return review
      ? NextResponse.json({ review })
      : NextResponse.json({ error: '月度复盘不存在' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '月度复盘更新失败' }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return deleteMonthlyReview(id)
      ? new Response(null, { status: 204 })
      : NextResponse.json({ error: '月度复盘不存在' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '月度复盘删除失败' }, { status: 400 });
  }
}
