import { NextResponse } from 'next/server';
import {
  deleteConversation,
  getConversation,
  listMessages,
  updateConversation,
} from '@/lib/db/conversations';
import type { ConversationStatus } from '@/lib/conversations/types';
import { normalizeRelationshipContext } from '@/lib/conversations/heming-input';
import { isRelationshipType, type RelationshipType } from '@/lib/heming/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  return NextResponse.json({ conversation, messages: listMessages(id) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const existing = getConversation(id);
  if (!existing) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  const body = await request.json() as {
    title?: unknown;
    status?: unknown;
    relationshipType?: unknown;
    relationshipContext?: unknown;
  };
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : undefined;
  const status: ConversationStatus | undefined = body.status === 'active' || body.status === 'archived'
    ? body.status
    : undefined;
  const wantsRelationshipUpdate = body.relationshipType !== undefined || body.relationshipContext !== undefined;
  if (wantsRelationshipUpdate && existing.type !== 'heming') {
    return NextResponse.json({ error: '单盘会话不能设置合盘关系背景' }, { status: 400 });
  }
  const relationshipTypeCandidate = wantsRelationshipUpdate
    ? (body.relationshipType ?? existing.relationshipType)
    : undefined;
  if (wantsRelationshipUpdate && !isRelationshipType(relationshipTypeCandidate)) {
    return NextResponse.json({ error: '关系类型不合法' }, { status: 400 });
  }
  const relationshipType: RelationshipType | undefined = wantsRelationshipUpdate
    ? relationshipTypeCandidate as RelationshipType
    : undefined;
  const relationshipContext = wantsRelationshipUpdate
    ? normalizeRelationshipContext(
        body.relationshipContext ?? existing.relationshipContext,
        relationshipType as RelationshipType,
      )
    : undefined;
  if (!title && !status && !wantsRelationshipUpdate) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  }
  const conversation = updateConversation(id, {
    title,
    status,
    relationshipType: wantsRelationshipUpdate ? relationshipType : undefined,
    relationshipContext,
  });
  if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!deleteConversation(id)) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
