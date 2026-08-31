import { NextResponse } from 'next/server';
import {
  findEventAnalysisDetail,
  generateEventAnalysis,
} from '@/lib/events/analysis-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface RouteContext {
  params: Promise<{ id: string; eventId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id, eventId } = await context.params;
  const rawVersion = new URL(request.url).searchParams.get('version');
  const version = rawVersion ? Number(rawVersion) : undefined;
  if (rawVersion && (!Number.isInteger(version) || (version ?? 0) < 1)) {
    return NextResponse.json({ error: '回溯分析版本无效' }, { status: 400 });
  }
  try {
    const detail = findEventAnalysisDetail({ conversationId: id, eventId, version });
    if (version && (!detail || detail.version?.version !== version)) {
      return NextResponse.json({ error: '回溯分析版本不存在' }, { status: 404 });
    }
    return NextResponse.json({ detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : '事件回溯读取失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id, eventId } = await context.params;
  const body = await request.json().catch(() => ({})) as { regenerate?: unknown };
  try {
    const detail = await generateEventAnalysis({
      conversationId: id,
      eventId,
      regenerate: body.regenerate === true,
    });
    return NextResponse.json(
      { detail },
      { status: detail.version?.status === 'generating' ? 202 : 200 },
    );
  } catch (error) {
    console.error('事件回溯分析生成失败：', error);
    const message = error instanceof Error ? error.message : '事件回溯分析生成失败';
    const status = message.includes('不存在') ? 404 : message.includes('确认') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
