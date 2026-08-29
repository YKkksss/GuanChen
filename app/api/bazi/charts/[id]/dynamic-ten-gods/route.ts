import { NextResponse } from 'next/server';
import { getBaziChartVersion } from '@/lib/db/bazi';
import {
  ensureBaziDynamicTenGodVersion,
  getLatestBaziDynamicTenGodForChart,
  listBaziDynamicTenGodVersions,
} from '@/lib/db/bazi-dynamic-ten-gods';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziChartVersion(id)) return NextResponse.json({ error: '八字命盘版本不存在' }, { status: 404 });
  return NextResponse.json({
    dynamicTenGod: getLatestBaziDynamicTenGodForChart(id),
    versions: listBaziDynamicTenGodVersions(id),
  });
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ dynamicTenGod: ensureBaziDynamicTenGodVersion(id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字动态十神与作用方向审计生成失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
