import { randomUUID } from 'node:crypto';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import type { HemingRelationshipContext, RelationshipType } from '@/lib/heming/types';
import type {
  Conversation,
  ConversationListItem,
  ConversationMessage,
  ConversationStatus,
  ConversationSummary,
  ConversationType,
  MessageRole,
  MessageStatus,
} from '@/lib/conversations/types';
import { getDatabase } from './client';

interface ConversationRow {
  id: string;
  type: ConversationType;
  title: string;
  status: ConversationStatus;
  birth_info_json: string | null;
  chart_snapshot_json: string | null;
  birth_info_a_json: string | null;
  birth_info_b_json: string | null;
  chart_snapshot_a_json: string | null;
  chart_snapshot_b_json: string | null;
  relationship_type: RelationshipType | null;
  relationship_context_json: string | null;
  engine_version: string;
  prompt_version: string;
  summary_json: string | null;
  summary_through_seq: number;
  summary_version: number;
  summary_updated_at: number | null;
  last_message_seq: number;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  seq: number;
  role: MessageRole;
  content: string;
  source: string;
  topic: string | null;
  palace_branch: number | null;
  sihua_type: string | null;
  metadata_json: string | null;
  status: MessageStatus;
  token_count: number;
  error_code: string | null;
  created_at: number;
  updated_at: number;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    birthInfo: parseJson<BirthInfo>(row.birth_info_json),
    chartSnapshot: parseJson<ZiweiChart>(row.chart_snapshot_json),
    birthInfoA: parseJson<BirthInfo>(row.birth_info_a_json),
    birthInfoB: parseJson<BirthInfo>(row.birth_info_b_json),
    chartSnapshotA: parseJson<ZiweiChart>(row.chart_snapshot_a_json),
    chartSnapshotB: parseJson<ZiweiChart>(row.chart_snapshot_b_json),
    relationshipType: row.relationship_type,
    relationshipContext: parseJson<HemingRelationshipContext>(row.relationship_context_json),
    engineVersion: row.engine_version,
    promptVersion: row.prompt_version,
    summary: parseJson<ConversationSummary>(row.summary_json),
    summaryThroughSeq: row.summary_through_seq,
    summaryVersion: row.summary_version,
    summaryUpdatedAt: row.summary_updated_at,
    lastMessageSeq: row.last_message_seq,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    seq: row.seq,
    role: row.role,
    content: row.content,
    source: row.source,
    topic: row.topic,
    palaceBranch: row.palace_branch,
    sihuaType: row.sihua_type,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
    status: row.status,
    tokenCount: row.token_count,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createConversation(input: {
  type: ConversationType;
  title: string;
  birthInfo?: BirthInfo | null;
  chartSnapshot?: ZiweiChart | null;
  birthInfoA?: BirthInfo | null;
  birthInfoB?: BirthInfo | null;
  chartSnapshotA?: ZiweiChart | null;
  chartSnapshotB?: ZiweiChart | null;
  relationshipType?: RelationshipType | null;
  relationshipContext?: HemingRelationshipContext | null;
}): Conversation {
  const db = getDatabase();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO conversations (
      id, type, title, status, birth_info_json, chart_snapshot_json,
      birth_info_a_json, birth_info_b_json, chart_snapshot_a_json, chart_snapshot_b_json,
      relationship_type, relationship_context_json,
      engine_version, prompt_version, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, 'ziwei-v1', ?, ?, ?)
  `).run(
    id,
    input.type,
    input.title,
    input.birthInfo ? JSON.stringify(input.birthInfo) : null,
    input.chartSnapshot ? JSON.stringify(input.chartSnapshot) : null,
    input.birthInfoA ? JSON.stringify(input.birthInfoA) : null,
    input.birthInfoB ? JSON.stringify(input.birthInfoB) : null,
    input.chartSnapshotA ? JSON.stringify(input.chartSnapshotA) : null,
    input.chartSnapshotB ? JSON.stringify(input.chartSnapshotB) : null,
    input.relationshipType ?? null,
    input.relationshipContext ? JSON.stringify(input.relationshipContext) : null,
    input.type === 'heming' ? 'heming-v1' : 'interpret-v1',
    now,
    now,
  );

  return getConversation(id)!;
}

export function listConversations(input: {
  type?: ConversationType;
  status?: ConversationStatus;
  limit?: number;
  offset?: number;
} = {}): ConversationListItem[] {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (input.type) {
    clauses.push('c.type = ?');
    params.push(input.type);
  }
  if (input.status) {
    clauses.push('c.status = ?');
    params.push(input.status);
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      c.id, c.type, c.title, c.status, c.created_at, c.updated_at,
      COUNT(m.id) AS message_count,
      COALESCE((
        SELECT content
        FROM messages latest
        WHERE latest.conversation_id = c.id
          AND latest.content <> ''
        ORDER BY latest.seq DESC
        LIMIT 1
      ), '') AS last_message_preview
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    ${where}
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Array<{
    id: string;
    type: ConversationType;
    title: string;
    status: ConversationStatus;
    created_at: number;
    updated_at: number;
    message_count: number;
    last_message_preview: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    messageCount: row.message_count,
    lastMessagePreview: row.last_message_preview.slice(0, 120),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getConversation(id: string): Conversation | null {
  const row = getDatabase()
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as ConversationRow | undefined;
  return row ? mapConversation(row) : null;
}

export function updateConversation(
  id: string,
  input: {
    title?: string;
    status?: ConversationStatus;
    relationshipType?: RelationshipType | null;
    relationshipContext?: HemingRelationshipContext | null;
  },
): Conversation | null {
  const existing = getConversation(id);
  if (!existing) return null;

  const title = input.title?.trim() || existing.title;
  const status = input.status ?? existing.status;
  const relationshipType = input.relationshipType === undefined
    ? existing.relationshipType
    : input.relationshipType;
  const relationshipContext = input.relationshipContext === undefined
    ? existing.relationshipContext
    : input.relationshipContext;
  getDatabase().prepare(`
    UPDATE conversations
    SET title = ?, status = ?, relationship_type = ?, relationship_context_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    title,
    status,
    relationshipType,
    relationshipContext ? JSON.stringify(relationshipContext) : null,
    Date.now(),
    id,
  );
  return getConversation(id);
}

export function deleteConversation(id: string): boolean {
  return getDatabase().prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0;
}

export function listMessages(conversationId: string): ConversationMessage[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC
  `).all(conversationId) as MessageRow[];
  return rows.map(mapMessage);
}

export function getRecentMessages(conversationId: string, limit = 24): ConversationMessage[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM (
      SELECT * FROM messages
      WHERE conversation_id = ?
        AND status IN ('completed', 'failed')
        AND content <> ''
      ORDER BY seq DESC
      LIMIT ?
    ) recent
    ORDER BY seq ASC
  `).all(conversationId, Math.min(Math.max(limit, 1), 100)) as MessageRow[];
  return rows.map(mapMessage);
}

export function getCompletedMessagesBefore(
  conversationId: string,
  beforeSeq: number,
): ConversationMessage[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
      AND seq < ?
      AND status = 'completed'
      AND role IN ('user', 'assistant')
      AND content <> ''
    ORDER BY seq ASC
  `).all(conversationId, beforeSeq) as MessageRow[];
  return rows.map(mapMessage);
}

export function appendMessage(input: {
  conversationId: string;
  role: MessageRole;
  content?: string;
  source?: string;
  topic?: string | null;
  palaceBranch?: number | null;
  sihuaType?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: MessageStatus;
}): ConversationMessage {
  const db = getDatabase();
  const insert = db.transaction(() => {
    const conversation = db.prepare(`
      SELECT last_message_seq FROM conversations WHERE id = ?
    `).get(input.conversationId) as { last_message_seq: number } | undefined;
    if (!conversation) throw new Error('会话不存在');

    const id = randomUUID();
    const seq = conversation.last_message_seq + 1;
    const now = Date.now();
    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, seq, role, content, source, topic,
        palace_branch, sihua_type, metadata_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.conversationId,
      seq,
      input.role,
      input.content ?? '',
      input.source ?? 'question',
      input.topic ?? null,
      input.palaceBranch ?? null,
      input.sihuaType ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.status ?? 'completed',
      now,
      now,
    );
    db.prepare(`
      UPDATE conversations SET last_message_seq = ?, updated_at = ? WHERE id = ?
    `).run(seq, now, input.conversationId);
    return id;
  });

  return getMessage(insert())!;
}

export function getMessage(id: string): ConversationMessage | null {
  const row = getDatabase().prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
  return row ? mapMessage(row) : null;
}

export function updateMessage(
  id: string,
  input: {
    content?: string;
    status?: MessageStatus;
    tokenCount?: number;
    errorCode?: string | null;
  },
): ConversationMessage | null {
  const existing = getMessage(id);
  if (!existing) return null;

  getDatabase().prepare(`
    UPDATE messages
    SET content = ?, status = ?, token_count = ?, error_code = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.content ?? existing.content,
    input.status ?? existing.status,
    input.tokenCount ?? existing.tokenCount,
    input.errorCode === undefined ? existing.errorCode : input.errorCode,
    Date.now(),
    id,
  );
  return getMessage(id);
}
