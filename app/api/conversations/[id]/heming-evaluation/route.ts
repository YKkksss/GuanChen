import { NextResponse } from 'next/server';
import {
  evaluateHemingConversation,
  HemingEvaluationError,
} from '@/lib/heming/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ evaluation: evaluateHemingConversation(id) });
  } catch (error) {
    if (error instanceof HemingEvaluationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : '合盘规则评估失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
