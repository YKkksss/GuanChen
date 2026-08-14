import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { listReports } from '@/lib/db/reports';
import { generateTopicReport } from '@/lib/reports/service';
import { isReportType } from '@/lib/reports/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getConversation(id)) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  return NextResponse.json({ reports: listReports(id) });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json() as { type?: unknown; regenerate?: unknown };
    if (!isReportType(body.type)) {
      return NextResponse.json({ error: '不支持的报告类型' }, { status: 400 });
    }
    const detail = await generateTopicReport({
      conversationId: id,
      type: body.type,
      regenerate: body.regenerate === true,
    });
    return NextResponse.json(detail, { status: detail.version?.status === 'generating' ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '报告生成失败';
    const status = message.includes('不存在') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
