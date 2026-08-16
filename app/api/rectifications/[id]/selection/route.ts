import { NextResponse } from 'next/server';
import {
  findRectificationSelections,
  selectRectificationCandidate,
} from '@/lib/rectification/selection-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return NextResponse.json({ selections: findRectificationSelections(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取候选选定记录失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.candidateId !== 'string' || typeof body.evaluationId !== 'string') {
      return NextResponse.json({ error: '必须提供 candidateId 和 evaluationId' }, { status: 400 });
    }
    const selection = selectRectificationCandidate(id, {
      candidateId: body.candidateId.trim(),
      evaluationId: body.evaluationId.trim(),
      acknowledgedLimitations: body.acknowledgedLimitations === true,
      note: typeof body.note === 'string' ? body.note : null,
    });
    return NextResponse.json({ selection }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '选定工作命盘失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
