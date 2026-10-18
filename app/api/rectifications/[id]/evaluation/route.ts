import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import {
  evaluateRectificationSession,
  findRectificationEvaluationState,
} from '@/lib/rectification/evaluation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

async function GETHandler(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return NextResponse.json(findRectificationEvaluationState(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取校时评估失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

async function POSTHandler(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const evaluation = evaluateRectificationSession(id);
    return NextResponse.json({ evaluation });
  } catch (error) {
    const message = error instanceof Error ? error.message : '校时评估失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

export const GET = withAccount(GETHandler);
export const POST = withAccount(POSTHandler);
