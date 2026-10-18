import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { findRectificationEventMatrix } from '@/lib/rectification/event-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

async function GETHandler(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return NextResponse.json({ matrix: findRectificationEventMatrix(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成候选事件矩阵失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

export const GET = withAccount(GETHandler);
