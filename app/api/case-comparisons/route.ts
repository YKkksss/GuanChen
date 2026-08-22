import { NextResponse } from 'next/server';
import type { CaseComparisonMode, CaseComparisonStatus } from '@/lib/cases/types';
import { createOrRefreshCaseComparison, listCaseComparisons } from '@/lib/db/case-comparisons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusValue = url.searchParams.get('status');
    const status: CaseComparisonStatus = statusValue === 'archived' ? 'archived' : 'active';
    const limit = Number(url.searchParams.get('limit') || 50);
    const offset = Number(url.searchParams.get('offset') || 0);
    return NextResponse.json({
      comparisons: listCaseComparisons({
        status,
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '对比记录加载失败' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      mode?: CaseComparisonMode;
      leftCaseId?: string;
      rightCaseId?: string;
      leftStageKey?: string | null;
      rightStageKey?: string | null;
    };
    if (body.mode !== 'chart_to_chart' && body.mode !== 'daxian_to_daxian') {
      return NextResponse.json({ error: '请选择有效的对比方式' }, { status: 400 });
    }
    if (!body.leftCaseId) {
      return NextResponse.json({ error: '请选择左侧匿名案例' }, { status: 400 });
    }
    const comparison = createOrRefreshCaseComparison({
      mode: body.mode,
      leftCaseId: body.leftCaseId,
      rightCaseId: body.rightCaseId,
      leftStageKey: body.leftStageKey,
      rightStageKey: body.rightStageKey,
    });
    return NextResponse.json({ comparison }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '案例对比创建失败';
    const status = message.includes('不存在') ? 404 : message.includes('授权') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
