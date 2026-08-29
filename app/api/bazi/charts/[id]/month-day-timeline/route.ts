import { NextResponse } from 'next/server';
import { getBaziChartVersion } from '@/lib/db/bazi';
import {
  ensureBaziMonthDayTimelineVersion,
  getBaziMonthDayTimelineForChartYear,
  listBaziMonthDayTimelineVersions,
} from '@/lib/db/bazi-month-day-timelines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziChartVersion(id)) return NextResponse.json({ error: '八字命盘版本不存在' }, { status: 404 });
  const rawYear = new URL(request.url).searchParams.get('year');
  const targetYear = rawYear ? Number(rawYear) : null;
  if (rawYear && !Number.isInteger(targetYear)) {
    return NextResponse.json({ error: '目标流年必须是整数年份' }, { status: 400 });
  }
  return NextResponse.json({
    monthDayTimeline: targetYear === null ? null : getBaziMonthDayTimelineForChartYear(id, targetYear),
    versions: listBaziMonthDayTimelineVersions(id),
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { targetYear?: unknown };
    const targetYear = body.targetYear === undefined ? undefined : Number(body.targetYear);
    if (targetYear !== undefined && !Number.isInteger(targetYear)) throw new Error('目标流年必须是整数年份');
    return NextResponse.json({
      monthDayTimeline: ensureBaziMonthDayTimelineVersion(id, targetYear),
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字流月流日时间轴生成失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
