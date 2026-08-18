import { NextResponse } from 'next/server';
import { setCaseConsent } from '@/lib/db/cases';
import type { CaseConsentScope } from '@/lib/cases/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { scope?: unknown; active?: unknown };
    const validScopes: CaseConsentScope[] = ['local_only', 'teaching', 'anonymous_export', 'public_release'];
    if (!validScopes.includes(body.scope as CaseConsentScope) || typeof body.active !== 'boolean') {
      return NextResponse.json({ error: '授权参数不合法' }, { status: 400 });
    }
    const record = setCaseConsent({
      caseId: id,
      scope: body.scope as CaseConsentScope,
      active: body.active,
    });
    if (!record) return NextResponse.json({ error: '案例不存在' }, { status: 404 });
    return NextResponse.json({ case: record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新授权失败' },
      { status: 400 },
    );
  }
}
