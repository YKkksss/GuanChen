import { NextResponse } from 'next/server';
import { getCaseTeachingDetail } from '@/lib/cases/teaching-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ teaching: getCaseTeachingDetail(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '教学案例加载失败';
    const status = message === '案例不存在' ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
