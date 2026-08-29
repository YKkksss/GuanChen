import { NextResponse } from 'next/server';
import { createBaziConversation, listBaziConversations } from '@/lib/db/bazi-conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit = Number(url.searchParams.get('limit') || 50);
  const offset = Number(url.searchParams.get('offset') || 0);
  return NextResponse.json({
    conversations: listBaziConversations({
      status: status === 'active' || status === 'archived' ? status : undefined,
      chartVersionId: url.searchParams.get('chartVersionId') || undefined,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    }),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { chartVersionId?: unknown; title?: unknown; forceNew?: unknown };
    if (typeof body.chartVersionId !== 'string' || !body.chartVersionId.trim()) {
      return NextResponse.json({ error: '请选择已保存的八字版本' }, { status: 400 });
    }
    const conversation = createBaziConversation({
      chartVersionId: body.chartVersionId,
      title: typeof body.title === 'string' ? body.title : undefined,
      forceNew: body.forceNew === true,
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字会话创建失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
