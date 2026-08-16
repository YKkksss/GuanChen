import { NextResponse } from 'next/server';
import { getOrCreateHemingAnnualTransit } from '@/lib/heming/transit-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const rawYear = new URL(request.url).searchParams.get('year') ?? String(new Date().getFullYear());
  const selectedYear = Number.parseInt(rawYear, 10);
  if (!/^\d{4}$/.test(rawYear) || !Number.isInteger(selectedYear)) {
    return NextResponse.json({ error: '年份格式不正确' }, { status: 400 });
  }
  try {
    const transit = getOrCreateHemingAnnualTransit(id, selectedYear);
    return NextResponse.json({ transit });
  } catch (error) {
    const message = error instanceof Error ? error.message : '双人年度运限生成失败';
    const status = message.includes('不存在') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
