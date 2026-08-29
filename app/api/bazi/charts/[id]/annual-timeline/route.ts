import { NextResponse } from 'next/server';
import { getBaziChartVersion } from '@/lib/db/bazi';
import {
  ensureBaziAnnualTimelineVersion,
  getLatestBaziAnnualTimelineForChart,
  listBaziAnnualTimelineVersions,
} from '@/lib/db/bazi-annual-timelines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziChartVersion(id)) return NextResponse.json({ error: '八字命盘版本不存在' }, { status: 404 });
  return NextResponse.json({
    annualTimeline: getLatestBaziAnnualTimelineForChart(id),
    versions: listBaziAnnualTimelineVersions(id),
  });
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ annualTimeline: ensureBaziAnnualTimelineVersion(id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字流年时间轴生成失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
