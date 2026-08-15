import { NextResponse } from 'next/server';
import { createConversation, listConversations } from '@/lib/db/conversations';
import type { ConversationStatus, ConversationType } from '@/lib/conversations/types';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import {
  getRelationshipDefinition,
  isRelationshipType,
  type HemingRelationshipContext,
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

function normalizeHemingTitle(
  value: unknown,
  birthInfoA: BirthInfo | null,
  birthInfoB: BirthInfo | null,
  relationshipType: RelationshipType,
): string {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  const ownerA = birthInfoA?.name?.trim() || '甲方';
  const ownerB = birthInfoB?.name?.trim() || '乙方';
  return `${ownerA} × ${ownerB} · ${getRelationshipDefinition(relationshipType).label}`.slice(0, 80);
}

function normalizeRelationshipContext(
  value: unknown,
  relationshipType: RelationshipType,
): HemingRelationshipContext {
  const definition = getRelationshipDefinition(relationshipType);
  const input = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const confirmedFactsInput = input.confirmedFacts && typeof input.confirmedFacts === 'object'
    ? input.confirmedFacts as Record<string, unknown>
    : {};
  const confirmedFacts = Object.fromEntries(
    Object.entries(confirmedFactsInput)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim())
      .slice(0, 20)
      .map(([key, fact]) => [key.slice(0, 60), fact.trim().slice(0, 500)]),
  );

  return {
    ownerARole: normalizeText(input.ownerARole, 40) || definition.roles[0].label,
    ownerBRole: normalizeText(input.ownerBRole, 40) || definition.roles[1].label,
    customRelationshipLabel: relationshipType === 'custom'
      ? normalizeText(input.customRelationshipLabel, 40)
      : null,
    mainConcern: normalizeText(input.mainConcern, 300),
    confirmedFacts,
  };
}

function normalizeText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}
