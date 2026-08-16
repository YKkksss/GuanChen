import { NextResponse } from 'next/server';
import {
  createRectificationSession,
  findRectificationSessions,
} from '@/lib/rectification/service';
import type { CreateRectificationSessionInput, RectificationStatus } from '@/lib/rectification/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<RectificationStatus>(['draft', 'ready', 'evaluated', 'confirmed', 'archived']);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawStatus = params.get('status');
  if (rawStatus && !VALID_STATUSES.has(rawStatus as RectificationStatus)) {
    return NextResponse.json({ error: '校时会话状态无效' }, { status: 400 });
  }
  const rawLimit = params.get('limit');
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  if (rawLimit && (!/^\d+$/.test(rawLimit) || !limit)) {
    return NextResponse.json({ error: 'limit 必须为正整数' }, { status: 400 });
  }
  const sessions = findRectificationSessions({
    status: rawStatus as RectificationStatus | undefined,
    sourceConversationId: params.get('conversationId') ?? undefined,
    limit,
  });
  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateRectificationSessionInput;
    const session = createRectificationSession(body);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建校时会话失败';
    const status = message.includes('不存在') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
