import { NextResponse } from 'next/server';
import { createConversation, listConversations } from '@/lib/db/conversations';
import type { ConversationStatus, ConversationType } from '@/lib/conversations/types';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const typeValue = url.searchParams.get('type');
  const statusValue = url.searchParams.get('status');
  const type = typeValue === 'chart' || typeValue === 'heming' ? typeValue : undefined;
  const status = statusValue === 'active' || statusValue === 'archived' ? statusValue : undefined;
  const limit = Number(url.searchParams.get('limit') || 50);
  const offset = Number(url.searchParams.get('offset') || 0);

  return NextResponse.json({
    conversations: listConversations({
      type: type as ConversationType | undefined,
      status: status as ConversationStatus | undefined,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    }),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      type?: unknown;
      title?: unknown;
      birthInfo?: BirthInfo;
      chartSnapshot?: ZiweiChart;
    };
    const type: ConversationType = body.type === 'heming' ? 'heming' : 'chart';
    if (type === 'chart' && (!body.chartSnapshot || !Array.isArray(body.chartSnapshot.palaces))) {
      return NextResponse.json({ error: '命盘数据缺失' }, { status: 400 });
    }

    const birthInfo = body.birthInfo ?? body.chartSnapshot?.birthInfo ?? null;
    const title = normalizeTitle(body.title, birthInfo);
    const conversation = createConversation({
      type,
      title,
      birthInfo,
      chartSnapshot: body.chartSnapshot ?? null,
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建会话失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeTitle(value: unknown, birthInfo: BirthInfo | null): string {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  if (!birthInfo) return '新的命盘解读';
  const owner = birthInfo.name?.trim() ? `${birthInfo.name.trim()}的命盘` : '命盘解读';
  return `${owner} · ${birthInfo.year}-${String(birthInfo.month).padStart(2, '0')}-${String(birthInfo.day).padStart(2, '0')}`;
}
