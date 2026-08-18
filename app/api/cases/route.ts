import { NextResponse } from 'next/server';
import { createCaseFromConversation } from '@/lib/cases/service';
import { listCaseRecords } from '@/lib/db/cases';
import type { CaseConfidence, CaseConsentScope, CaseStatus } from '@/lib/cases/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_SCOPES: CaseConsentScope[] = ['local_only', 'teaching', 'anonymous_export'];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const statusValue = url.searchParams.get('status');
  const status = statusValue === 'draft' || statusValue === 'reviewed' || statusValue === 'archived'
    ? statusValue as CaseStatus
    : undefined;
  const limit = Number(url.searchParams.get('limit') || 50);
  const offset = Number(url.searchParams.get('offset') || 0);
  return NextResponse.json({
    cases: listCaseRecords({
      status,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    }),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      conversationId?: unknown;
      acknowledged?: unknown;
      title?: unknown;
      confidence?: unknown;
      scopes?: unknown;
    };
    if (typeof body.conversationId !== 'string' || !body.conversationId.trim()) {
      return NextResponse.json({ error: '请选择一份已保存命盘' }, { status: 400 });
    }
    const scopes = Array.isArray(body.scopes)
      ? body.scopes.filter((scope): scope is CaseConsentScope => VALID_SCOPES.includes(scope as CaseConsentScope))
      : [];
    const confidence: CaseConfidence = body.confidence === 'low' || body.confidence === 'high'
      ? body.confidence
      : 'medium';
    const record = createCaseFromConversation({
      conversationId: body.conversationId,
      acknowledged: body.acknowledged === true,
      title: typeof body.title === 'string' ? body.title : undefined,
      confidence,
      scopes,
    });
    return NextResponse.json({ case: record }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建匿名案例失败' },
      { status: 400 },
    );
  }
}
