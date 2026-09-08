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
    const parsed = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: '请求体必须是有效的 JSON 对象' }, { status: 400 });
    }
    const body = parsed as {
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
    if (type === 'chart' && !isChartSnapshot(body.chartSnapshot)) {
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
    if ([birthInfo, birthInfoA, birthInfoB].some(value => value !== null && !isBirthInfo(value))) {
      return NextResponse.json({ error: '出生信息格式无效' }, { status: 400 });
    }
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
  if (!value || typeof value !== 'object') return false;
  const chart = value as ZiweiChart;
  return isBirthInfo(chart.birthInfo)
    && !!chart.lunarInfo && typeof chart.lunarInfo === 'object'
    && Array.isArray(chart.daXians)
    && typeof chart.wuxingJuName === 'string'
    && Array.isArray(chart.palaces) && chart.palaces.length === 12
    && chart.palaces.every(palace => palace && typeof palace.name === 'string'
      && Number.isInteger(palace.branch) && palace.branch >= 0 && palace.branch <= 11
      && Array.isArray(palace.stars) && palace.stars.every(star => star && typeof star.name === 'string'))
    && new Set(chart.palaces.map(palace => palace.branch)).size === 12;
}

function isBirthInfo(value: unknown): value is BirthInfo {
  if (!value || typeof value !== 'object') return false;
  const birth = value as BirthInfo;
  return Number.isInteger(birth.year) && birth.year >= 1900 && birth.year <= 2100
    && Number.isInteger(birth.month) && birth.month >= 1 && birth.month <= 12
    && Number.isInteger(birth.day) && birth.day >= 1
    && birth.day <= new Date(Date.UTC(birth.year, birth.month, 0)).getUTCDate()
    && Number.isInteger(birth.hour) && birth.hour >= 0 && birth.hour <= 11
    && (birth.gender === 'male' || birth.gender === 'female')
    && [birth.name, birth.province, birth.city].every(item => item === undefined || typeof item === 'string');
}

function normalizeTitle(value: unknown, birthInfo: BirthInfo | null): string {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  if (!birthInfo) return '新的命盘解读';
  const owner = birthInfo.name?.trim() ? `${birthInfo.name.trim()}的命盘` : '命盘解读';
  return `${owner} · ${birthInfo.year}-${String(birthInfo.month).padStart(2, '0')}-${String(birthInfo.day).padStart(2, '0')}`;
}
