import { NextResponse } from 'next/server';
import { createBaziChartVersion } from '@/lib/db/bazi';
import type { CreateBaziChartVersionInput } from '@/lib/bazi/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as CreateBaziChartVersionInput;
    const chart = createBaziChartVersion(id, body);
    return NextResponse.json({ chart }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字版本保存失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
