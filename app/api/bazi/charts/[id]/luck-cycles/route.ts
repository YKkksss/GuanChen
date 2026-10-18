import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { getBaziChartVersion } from '@/lib/db/bazi';
import {
  ensureBaziLuckCycleVersion,
  getLatestBaziLuckCyclesForChart,
  listBaziLuckCycleVersions,
} from '@/lib/db/bazi-luck-cycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

async function GETHandler(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziChartVersion(id)) return NextResponse.json({ error: '八字命盘版本不存在' }, { status: 404 });
  return NextResponse.json({
    luckCycles: getLatestBaziLuckCyclesForChart(id),
    versions: listBaziLuckCycleVersions(id),
  });
}

async function POSTHandler(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ luckCycles: ensureBaziLuckCycleVersion(id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字大运排期生成失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

export const GET = withAccount(GETHandler);
export const POST = withAccount(POSTHandler);
