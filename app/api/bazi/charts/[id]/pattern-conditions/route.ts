import { NextResponse } from 'next/server';
import { getBaziChartVersion } from '@/lib/db/bazi';
import {
  ensureBaziPatternConditionVersion,
  getLatestBaziPatternConditionForChart,
  listBaziPatternConditionVersions,
} from '@/lib/db/bazi-pattern-conditions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziChartVersion(id)) return NextResponse.json({ error: '八字命盘版本不存在' }, { status: 404 });
  return NextResponse.json({
    patternCondition: getLatestBaziPatternConditionForChart(id),
    versions: listBaziPatternConditionVersions(id),
  });
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ patternCondition: ensureBaziPatternConditionVersion(id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字格局条件证据审计生成失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
