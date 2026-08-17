import { NextResponse } from 'next/server';
import { getChartPractice, submitChartPractice } from '@/lib/learning/practice-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const conversationId = new URL(request.url).searchParams.get('conversationId')?.trim();
  if (!conversationId) return NextResponse.json({ error: '请选择单人命盘' }, { status: 400 });
  try {
    return NextResponse.json({ practice: getChartPractice(conversationId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '命盘练习生成失败' }, { status: 404 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { conversationId?: unknown; answers?: unknown };
    if (typeof body.conversationId !== 'string' || !body.conversationId.trim()) {
      return NextResponse.json({ error: '请选择单人命盘' }, { status: 400 });
    }
    if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
      return NextResponse.json({ error: '答题内容无效' }, { status: 400 });
    }
    return NextResponse.json(submitChartPractice(body.conversationId.trim(), body.answers as Record<string, string>));
  } catch (error) {
    const message = error instanceof Error ? error.message : '命盘练习提交失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
