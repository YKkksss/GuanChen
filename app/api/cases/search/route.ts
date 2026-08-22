import { NextResponse } from 'next/server';
import { searchTeachingCases } from '@/lib/db/case-search';
import { LIFE_EVENT_CATEGORIES, type LifeEventCategory } from '@/lib/events/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mingValue = url.searchParams.get('mingBranch');
    const mingBranch = mingValue === null ? undefined : Number(mingValue);
    const categoryValue = url.searchParams.get('eventCategory');
    const eventCategory = categoryValue && LIFE_EVENT_CATEGORIES.includes(categoryValue as LifeEventCategory)
      ? categoryValue as LifeEventCategory
      : undefined;
    const limit = Number(url.searchParams.get('limit') || 50);
    const offset = Number(url.searchParams.get('offset') || 0);
    return NextResponse.json(searchTeachingCases({
      query: url.searchParams.get('q') ?? undefined,
      mingBranch: Number.isInteger(mingBranch) && mingBranch! >= 0 && mingBranch! <= 11 ? mingBranch : undefined,
      majorStar: url.searchParams.get('majorStar') ?? undefined,
      sihua: url.searchParams.get('sihua') ?? undefined,
      pattern: url.searchParams.get('pattern') ?? undefined,
      wuxingJu: url.searchParams.get('wuxingJu') ?? undefined,
      eventCategory,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '案例检索失败' },
      { status: 500 },
    );
  }
}
