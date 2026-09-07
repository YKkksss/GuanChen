import { NextResponse } from 'next/server';
import { createConversation, listConversations, countConversations } from '@/lib/db/conversations';
import type { ConversationStatus, ConversationType } from '@/lib/conversations/types';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import {
  normalizeHemingTitle,
  normalizeRelationshipContext,
} from '@/lib/conversations/heming-input';
import {
  isRelationshipType,
  type RelationshipType,
} from '@/lib/heming';

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

  const input = {
    type: type as ConversationType | undefined,
    status: status as ConversationStatus | undefined,
    query: (url.searchParams.get('q') || '').trim().slice(0, 100),
    limit: Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 50, 1), 100),
    offset: Math.max(Number.isFinite(offset) ? Math.trunc(offset) : 0, 0),
  };
  try {
    const conversations = listConversations(input);
    const total = countConversations(input);
    return NextResponse.json({ conversations, total, limit: input.limit, offset: input.offset, hasMore: input.offset + conversations.length < total });
  } catch {
    return NextResponse.json({ error: '档案读取失败，请稍后重试' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      type?: unknown;
      title?: unknown;
      birthInfo?: BirthInfo;
      chartSnapshot?: ZiweiChart;
      birthInfoA?: BirthInfo;
      birthInfoB?: BirthInfo;
      chartSnapshotA?: ZiweiChart;
      chartSnapshotB?: ZiweiChart;
      relationshipType?: unknown;
      relationshipContext?: unknown;
    };
    const type: ConversationType = body.type === 'heming' ? 'heming' : 'chart';
    if (type === 'chart' && (!body.chartSnapshot || !Array.isArray(body.chartSnapshot.palaces))) {
      return NextResponse.json({ error: '命盘数据缺失' }, { status: 400 });
    }

    if (type === 'heming') {
      if (!isChartSnapshot(body.chartSnapshotA) || !isChartSnapshot(body.chartSnapshotB)) {
        return NextResponse.json({ error: '双方命盘数据缺失' }, { status: 400 });
      }
      if (!isRelationshipType(body.relationshipType)) {
        return NextResponse.json({ error: '请选择有效的关系类型' }, { status: 400 });
      }
    }

    const birthInfo = body.birthInfo ?? body.chartSnapshot?.birthInfo ?? null;
    const relationshipType = type === 'heming' ? body.relationshipType as RelationshipType : null;
    const birthInfoA = body.birthInfoA ?? body.chartSnapshotA?.birthInfo ?? null;
    const birthInfoB = body.birthInfoB ?? body.chartSnapshotB?.birthInfo ?? null;
    const relationshipContext = relationshipType
      ? normalizeRelationshipContext(body.relationshipContext, relationshipType)
      : null;
    const title = type === 'heming'
      ? normalizeHemingTitle(body.title, birthInfoA, birthInfoB, relationshipType!)
      : normalizeTitle(body.title, birthInfo);
    const conversation = createConversation({
      type,
      title,
      birthInfo,
      chartSnapshot: body.chartSnapshot ?? null,
      birthInfoA,
      birthInfoB,
      chartSnapshotA: body.chartSnapshotA ?? null,
      chartSnapshotB: body.chartSnapshotB ?? null,
      relationshipType,
      relationshipContext,
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建会话失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isChartSnapshot(value: unknown): value is ZiweiChart {
  return !!value && typeof value === 'object'
    && Array.isArray((value as ZiweiChart).palaces)
    && (value as ZiweiChart).palaces.length === 12;
}

function normalizeTitle(value: unknown, birthInfo: BirthInfo | null): string {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  if (!birthInfo) return '新的命盘解读';
  const owner = birthInfo.name?.trim() ? `${birthInfo.name.trim()}的命盘` : '命盘解读';
  return `${owner} · ${birthInfo.year}-${String(birthInfo.month).padStart(2, '0')}-${String(birthInfo.day).padStart(2, '0')}`;
}
