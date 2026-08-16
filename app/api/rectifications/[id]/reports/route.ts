import { NextResponse } from 'next/server';
import { listRectificationReports } from '@/lib/db/rectification-reports';
import { findRectificationSession } from '@/lib/rectification/service';
import { generateRectificationReport } from '@/lib/rectification/report-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!findRectificationSession(id)) return NextResponse.json({ error: '校时会话不存在' }, { status: 404 });
  return NextResponse.json({ reports: listRectificationReports(id) });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => ({})) as { regenerate?: unknown };
    const detail = await generateRectificationReport({ sessionId: id, regenerate: body.regenerate === true });
    return NextResponse.json(detail, { status: detail.version?.status === 'generating' ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '校时报告生成失败';
    const status = message.includes('不存在') ? 404 : message.includes('请先') || message.includes('尚未') || message.includes('变化') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
