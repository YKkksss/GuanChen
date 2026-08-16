import { NextResponse } from 'next/server';
import { createConversationFromRectificationSelection } from '@/lib/rectification/report-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return NextResponse.json(createConversationFromRectificationSelection(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建工作命盘失败';
    const status = message.includes('不存在') ? 404 : message.includes('请先') || message.includes('重新确认') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
