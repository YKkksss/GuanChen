import { NextResponse } from 'next/server';
import { deleteBaziChartVersion, getBaziChartVersion } from '@/lib/db/bazi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const chart = getBaziChartVersion(id);
  if (!chart) return NextResponse.json({ error: '八字命盘版本不存在' }, { status: 404 });
  return NextResponse.json({ chart });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!deleteBaziChartVersion(id)) return NextResponse.json({ error: '八字命盘版本不存在' }, { status: 404 });
  return new Response(null, { status: 204 });
}
