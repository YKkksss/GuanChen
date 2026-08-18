import { NextResponse } from 'next/server';
import { previewCaseFromConversation } from '@/lib/cases/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { conversationId?: unknown };
    if (typeof body.conversationId !== 'string' || !body.conversationId.trim()) {
      return NextResponse.json({ error: '请选择一份已保存命盘' }, { status: 400 });
    }
    return NextResponse.json({ preview: previewCaseFromConversation(body.conversationId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成脱敏预览失败' },
      { status: 400 },
    );
  }
}
