import { NextResponse } from 'next/server';
import {
  evaluateRectificationSession,
  findRectificationEvaluationState,
} from '@/lib/rectification/evaluation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return NextResponse.json(findRectificationEvaluationState(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取校时评估失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const evaluation = evaluateRectificationSession(id);
    return NextResponse.json({ evaluation });
  } catch (error) {
    const message = error instanceof Error ? error.message : '校时评估失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
