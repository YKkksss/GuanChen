import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { getFoundationReviewPractice, submitFoundationReview } from '@/lib/learning/practice-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(_request: Request) {
  return NextResponse.json({ practice: getFoundationReviewPractice() });
}

async function POSTHandler(request: Request) {
  try {
    const body = await request.json() as { answers?: unknown };
    if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
      return NextResponse.json({ error: '答题内容无效' }, { status: 400 });
    }
    return NextResponse.json(submitFoundationReview(body.answers as Record<string, string>));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '综合练习提交失败' }, { status: 400 });
  }
}

export const GET = withAccount(GETHandler);
export const POST = withAccount(POSTHandler);
