import { NextResponse } from 'next/server';
import { regenerateRectificationReport } from '@/lib/rectification/report-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ reportId: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  try {
    const detail = await regenerateRectificationReport(reportId);
    return NextResponse.json(detail, { status: detail.version?.status === 'generating' ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '校时报告重新生成失败';
    const status = message.includes('不存在') ? 404 : message.includes('请先') || message.includes('变化') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
