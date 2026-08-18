import { NextResponse } from 'next/server';
import { deleteCaseRecord, getCaseRecord, updateCaseRecord } from '@/lib/db/cases';
import type { CaseConfidence, CaseStatus } from '@/lib/cases/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const record = getCaseRecord(id);
  if (!record) return NextResponse.json({ error: '案例不存在' }, { status: 404 });
  return NextResponse.json({ case: record });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json() as { title?: unknown; status?: unknown; confidence?: unknown };
  const status: CaseStatus | undefined = body.status === 'draft' || body.status === 'reviewed' || body.status === 'archived'
    ? body.status
    : undefined;
  const confidence: CaseConfidence | undefined = body.confidence === 'low' || body.confidence === 'medium' || body.confidence === 'high'
    ? body.confidence
    : undefined;
  const title = typeof body.title === 'string' ? body.title : undefined;
  if (title === undefined && status === undefined && confidence === undefined) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  }
  const record = updateCaseRecord(id, { title, status, confidence });
  if (!record) return NextResponse.json({ error: '案例不存在' }, { status: 404 });
  return NextResponse.json({ case: record });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { caseCode?: unknown };
  if (typeof body.caseCode !== 'string' || !deleteCaseRecord(id, body.caseCode)) {
    return NextResponse.json({ error: '案例编号不匹配，未执行删除' }, { status: 400 });
  }
  return new Response(null, { status: 204 });
}
