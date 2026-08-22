import { NextResponse } from 'next/server';
import type { CaseComparisonStatus } from '@/lib/cases/types';
import { getCaseComparison, setCaseComparisonStatus } from '@/lib/db/case-comparisons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const comparison = getCaseComparison(id);
    if (!comparison) return NextResponse.json({ error: '对比记录不存在' }, { status: 404 });
    return NextResponse.json({ comparison });
  } catch (error) {
    const message = error instanceof Error ? error.message : '对比记录加载失败';
    const status = message.includes('不存在') ? 404 : message.includes('授权') || message.includes('复核') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { status?: CaseComparisonStatus };
    if (body.status !== 'active' && body.status !== 'archived') {
      return NextResponse.json({ error: '对比记录状态无效' }, { status: 400 });
    }
    const comparison = setCaseComparisonStatus(id, body.status);
    if (!comparison) return NextResponse.json({ error: '对比记录不存在' }, { status: 404 });
    return NextResponse.json({ comparison });
  } catch (error) {
    const message = error instanceof Error ? error.message : '对比记录更新失败';
    const status = message.includes('不存在') ? 404 : message.includes('授权') || message.includes('复核') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
