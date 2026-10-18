import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { getBaziChartVersion } from '@/lib/db/bazi';
import {
  ensureBaziTenGodRepeatVersion,
  getLatestBaziTenGodRepeatForChart,
  listBaziTenGodRepeatVersions,
} from '@/lib/db/bazi-ten-god-repeats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

async function GETHandler(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziChartVersion(id)) return NextResponse.json({ error: '八字命盘版本不存在' }, { status: 404 });
  return NextResponse.json({
    tenGodRepeat: getLatestBaziTenGodRepeatForChart(id),
    versions: listBaziTenGodRepeatVersions(id),
  });
}

async function POSTHandler(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ tenGodRepeat: ensureBaziTenGodRepeatVersion(id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字十神显隐重复审计生成失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

export const GET = withAccount(GETHandler);
export const POST = withAccount(POSTHandler);
