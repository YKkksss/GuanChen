import { NextResponse } from 'next/server';
import { getBaziChartVersion } from '@/lib/db/bazi';
import {
  ensureBaziMonthDayVisibilityVersion,
  getBaziMonthDayVisibilityForChartDate,
  listBaziMonthDayVisibilityVersions,
} from '@/lib/db/bazi-month-day-visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziChartVersion(id)) return NextResponse.json({ error: '八字命盘版本不存在' }, { status: 404 });
  const targetDate = new URL(request.url).searchParams.get('date');
  return NextResponse.json({
    monthDayVisibility: targetDate ? getBaziMonthDayVisibilityForChartDate(id, targetDate) : null,
    versions: listBaziMonthDayVisibilityVersions(id),
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { targetDate?: unknown; targetYear?: unknown };
    const targetDate = body.targetDate === undefined ? undefined : String(body.targetDate);
    const targetYear = body.targetYear === undefined ? undefined : Number(body.targetYear);
    if (targetYear !== undefined && !Number.isInteger(targetYear)) throw new Error('目标流年必须是整数年份');
    return NextResponse.json({
      monthDayVisibility: ensureBaziMonthDayVisibilityVersion(id, targetDate, targetYear),
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字流月流日显隐条件生成失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
