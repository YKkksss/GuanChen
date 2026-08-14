import { randomUUID } from 'node:crypto';
import type {
  ContextRun,
  ContextRunStatus,
  ConversationSummary,
  MemoryCategory,
  MemoryItem,
  MemoryStatus,
  MessageRole,
} from '@/lib/conversations/types';
import { getDatabase } from './client';

interface MemoryRow {
  id: string;
  conversation_id: string;
  category: MemoryCategory;
  content: string;
  normalized_key: string | null;
  source_message_id: string | null;
  confidence: number;
  status: MemoryStatus;
  created_at: number;
  updated_at: number;
}

interface ContextRunRow {
  id: string;
  conversation_id: string;
  trigger_message_id: string;
  assistant_message_id: string | null;
  provider: string;
  model: string;
  context_limit: number;
  output_reserve: number;
  input_budget: number;
  estimated_input_tokens: number;
  actual_input_tokens: number | null;
  actual_output_tokens: number | null;
  cached_input_tokens: number | null;
  summary_version: number | null;
  recent_message_start_seq: number | null;
  recent_message_count: number;
  retrieved_message_ids_json: string | null;
  context_manifest_json: string;
  status: ContextRunStatus;
  error_code: string | null;
  created_at: number;
  completed_at: number | null;
}

export interface RetrievedMessage {
  id: string;
  seq: number;
  role: MessageRole;
  content: string;
  topic: string | null;
}

export function listActiveMemories(conversationId: string, limit = 50): MemoryItem[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM memory_items
    WHERE conversation_id = ? AND status = 'active'
    ORDER BY
      CASE category
        WHEN 'correction' THEN 0
        WHEN 'user_fact' THEN 1
        WHEN 'confirmed_event' THEN 2
        WHEN 'user_preference' THEN 3
        WHEN 'open_question' THEN 4
        ELSE 5
      END,
      updated_at DESC
    LIMIT ?
  `).all(conversationId, Math.min(Math.max(limit, 1), 200)) as MemoryRow[];
  return rows.map(mapMemory);
}

export function upsertMemoryItem(input: {
  conversationId: string;
  category: MemoryCategory;
  content: string;
  normalizedKey?: string | null;
  sourceMessageId?: string | null;
  confidence?: number;
}): MemoryItem {
  const db = getDatabase();
  const content = input.content.trim().slice(0, 1_000);
  if (!content) throw new Error('记忆内容不能为空');
  const normalizedKey = normalizeMemoryKey(input.normalizedKey ?? null, content);
  const confidence = Math.min(Math.max(input.confidence ?? 1, 0), 1);

  const transaction = db.transaction(() => {
    const existing = db.prepare(`
      SELECT * FROM memory_items
      WHERE conversation_id = ? AND normalized_key = ? AND status = 'active'
      ORDER BY updated_at DESC LIMIT 1
    `).get(input.conversationId, normalizedKey) as MemoryRow | undefined;

    if (existing?.content === content && existing.category === input.category) {
      db.prepare(`
        UPDATE memory_items
        SET confidence = MAX(confidence, ?), source_message_id = COALESCE(?, source_message_id), updated_at = ?
        WHERE id = ?
      `).run(confidence, input.sourceMessageId ?? null, Date.now(), existing.id);
      return existing.id;
    }

    if (existing && !canSupersede(existing, input.category, confidence)) {
      return existing.id;
    }

    const now = Date.now();
    if (existing) {
      db.prepare(`UPDATE memory_items SET status = 'superseded', updated_at = ? WHERE id = ?`)
        .run(now, existing.id);
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO memory_items (
        id, conversation_id, category, content, normalized_key,
        source_message_id, confidence, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      id,
      input.conversationId,
      input.category,
      content,
      normalizedKey,
      input.sourceMessageId ?? null,
      confidence,
      now,
      now,
    );
    return id;
  });

  return getMemoryItem(transaction())!;
}

export function getMemoryItem(id: string): MemoryItem | null {
  const row = getDatabase().prepare('SELECT * FROM memory_items WHERE id = ?')
    .get(id) as MemoryRow | undefined;
  return row ? mapMemory(row) : null;
}

export function updateMemoryItem(input: {
  id: string;
  conversationId: string;
  content?: string;
  status?: MemoryStatus;
}): MemoryItem | null {
  const existing = getMemoryItem(input.id);
  if (!existing || existing.conversationId !== input.conversationId) return null;
  const content = input.content?.trim().slice(0, 1_000) || existing.content;
  const status = input.status ?? existing.status;
  getDatabase().prepare(`
    UPDATE memory_items
    SET content = ?, status = ?, updated_at = ?
    WHERE id = ? AND conversation_id = ?
  `).run(content, status, Date.now(), input.id, input.conversationId);
  return getMemoryItem(input.id);
}

export function replaceConversationMemories(
  conversationId: string,
  items: Array<{
    category: MemoryCategory;
    content: string;
    normalizedKey: string;
    confidence: number;
  }>,
): number {
  const db = getDatabase();
  const replace = db.transaction(() => {
    const now = Date.now();
    db.prepare(`
      UPDATE memory_items SET status = 'deleted', updated_at = ?
      WHERE conversation_id = ? AND status = 'active'
    `).run(now, conversationId);

    const unique = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const content = item.content.trim().slice(0, 1_000);
      if (!content) continue;
      const key = normalizeMemoryKey(item.normalizedKey, content);
      const previous = unique.get(key);
      if (!previous || item.confidence >= previous.confidence) {
        unique.set(key, { ...item, content, normalizedKey: key });
      }
    }

    const insert = db.prepare(`
      INSERT INTO memory_items (
        id, conversation_id, category, content, normalized_key,
        source_message_id, confidence, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, 'active', ?, ?)
    `);
    for (const item of unique.values()) {
      insert.run(
        randomUUID(),
        conversationId,
        item.category,
        item.content,
        item.normalizedKey,
        Math.min(Math.max(item.confidence, 0), 1),
        now,
        now,
      );
    }
    return unique.size;
  });
  return replace();
}

export function resetConversationSummary(conversationId: string): void {
  getDatabase().prepare(`
    UPDATE conversations
    SET summary_json = NULL, summary_through_seq = 0,
        summary_version = summary_version + 1, summary_updated_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(Date.now(), conversationId);
}

export function restoreConversationSummary(input: {
  conversationId: string;
  summary: ConversationSummary | null;
  throughSeq: number;
  updatedAt: number | null;
}): void {
  getDatabase().prepare(`
    UPDATE conversations
    SET summary_json = ?, summary_through_seq = ?,
        summary_version = summary_version + 1, summary_updated_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.summary ? JSON.stringify(input.summary) : null,
    input.throughSeq,
    input.updatedAt,
    Date.now(),
    input.conversationId,
  );
}

export function updateConversationSummary(input: {
  conversationId: string;
  summary: ConversationSummary;
  throughSeq: number;
}): void {
  getDatabase().prepare(`
    UPDATE conversations
    SET summary_json = ?, summary_through_seq = ?, summary_version = summary_version + 1,
        summary_updated_at = ?, updated_at = ?
    WHERE id = ? AND summary_through_seq < ?
  `).run(
    JSON.stringify(input.summary),
    input.throughSeq,
    Date.now(),
    Date.now(),
    input.conversationId,
    input.throughSeq,
  );
}

export function createContextRun(input: {
  conversationId: string;
  triggerMessageId: string;
  assistantMessageId: string;
  provider: string;
  model: string;
  contextLimit: number;
  outputReserve: number;
  inputBudget: number;
  estimatedInputTokens: number;
  summaryVersion: number | null;
  recentMessageStartSeq: number | null;
  recentMessageCount: number;
  retrievedMessageIds: string[];
  contextManifest: Record<string, unknown>;
}): ContextRun {
  const id = randomUUID();
  getDatabase().prepare(`
    INSERT INTO context_runs (
      id, conversation_id, trigger_message_id, assistant_message_id, provider, model,
      context_limit, output_reserve, input_budget, estimated_input_tokens,
      summary_version, recent_message_start_seq, recent_message_count,
      retrieved_message_ids_json, context_manifest_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    id,
    input.conversationId,
    input.triggerMessageId,
    input.assistantMessageId,
    input.provider,
    input.model,
    input.contextLimit,
    input.outputReserve,
    input.inputBudget,
    input.estimatedInputTokens,
    input.summaryVersion,
    input.recentMessageStartSeq,
    input.recentMessageCount,
    JSON.stringify(input.retrievedMessageIds),
    JSON.stringify(input.contextManifest),
    Date.now(),
  );
  return getContextRun(id)!;
}

export function completeContextRun(
  id: string,
  input: {
    status: Exclude<ContextRunStatus, 'pending'>;
    errorCode?: string | null;
    actualInputTokens?: number | null;
    actualOutputTokens?: number | null;
    cachedInputTokens?: number | null;
  },
): void {
  getDatabase().prepare(`
    UPDATE context_runs
    SET status = ?, error_code = ?, actual_input_tokens = ?, actual_output_tokens = ?,
        cached_input_tokens = ?, completed_at = ?
    WHERE id = ?
  `).run(
    input.status,
    input.errorCode ?? null,
    input.actualInputTokens ?? null,
    input.actualOutputTokens ?? null,
    input.cachedInputTokens ?? null,
    Date.now(),
    id,
  );
}

export function getContextRun(id: string): ContextRun | null {
  const row = getDatabase().prepare('SELECT * FROM context_runs WHERE id = ?')
    .get(id) as ContextRunRow | undefined;
  return row ? mapContextRun(row) : null;
}

export function listContextRuns(conversationId: string, limit = 20): ContextRun[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM context_runs
    WHERE conversation_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(conversationId, Math.min(Math.max(limit, 1), 100)) as ContextRunRow[];
  return rows.map(mapContextRun);
}

export function retrieveOlderMessages(input: {
  conversationId: string;
  beforeSeq: number;
  terms: string[];
  topic?: string | null;
  limit?: number;
}): RetrievedMessage[] {
  const terms = input.terms.map(term => term.trim()).filter(Boolean).slice(0, 8);
  if (!terms.length || input.beforeSeq <= 1) return [];
  const limit = Math.min(Math.max(input.limit ?? 4, 1), 8);
  const candidateLimit = Math.min(limit * 12, 100);
  const db = getDatabase();
  const found = new Map<string, RetrievedMessage>();

  try {
    const ftsQuery = terms.map(term => `"${term.replace(/"/g, '""')}"`).join(' OR ');
    const rows = db.prepare(`
      SELECT m.id, m.seq, m.role, m.content, m.topic
      FROM messages_fts f
      JOIN messages m ON m.id = f.message_id
      WHERE messages_fts MATCH ?
        AND m.conversation_id = ?
        AND m.seq < ?
        AND m.status = 'completed'
        AND m.role IN ('user', 'assistant')
      ORDER BY bm25(messages_fts), m.seq DESC
      LIMIT ?
    `).all(ftsQuery, input.conversationId, input.beforeSeq, candidateLimit) as RetrievedMessage[];
    rows.forEach(row => found.set(row.id, row));
  } catch {
    // FTS5 不可用或查询语法不兼容时，继续执行 LIKE 降级搜索。
  }

  const perTermLimit = Math.max(limit * 3, 12);
  for (const term of terms) {
    const rows = db.prepare(`
      SELECT m.id, m.seq, m.role, m.content, m.topic
      FROM messages m
      WHERE m.conversation_id = ?
        AND m.seq < ?
        AND m.status = 'completed'
        AND m.role IN ('user', 'assistant')
        AND m.content LIKE ?
      ORDER BY
        CASE WHEN m.topic = ? THEN 0 ELSE 1 END,
        CASE WHEN m.role = 'user' THEN 0 ELSE 1 END,
        m.seq DESC
      LIMIT ?
    `).all(
      input.conversationId,
      input.beforeSeq,
      `%${term}%`,
      input.topic ?? '',
      perTermLimit,
    ) as RetrievedMessage[];
    rows.forEach(row => found.set(row.id, row));
  }

  return [...found.values()]
    .sort((a, b) => scoreRetrieved(b, input) - scoreRetrieved(a, input))
    .slice(0, limit)
    .sort((a, b) => a.seq - b.seq);
}

function mapMemory(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    category: row.category,
    content: row.content,
    normalizedKey: row.normalized_key,
    sourceMessageId: row.source_message_id,
    confidence: row.confidence,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContextRun(row: ContextRunRow): ContextRun {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    triggerMessageId: row.trigger_message_id,
    assistantMessageId: row.assistant_message_id,
    provider: row.provider,
    model: row.model,
    contextLimit: row.context_limit,
    outputReserve: row.output_reserve,
    inputBudget: row.input_budget,
    estimatedInputTokens: row.estimated_input_tokens,
    actualInputTokens: row.actual_input_tokens,
    actualOutputTokens: row.actual_output_tokens,
    cachedInputTokens: row.cached_input_tokens,
    summaryVersion: row.summary_version,
    recentMessageStartSeq: row.recent_message_start_seq,
    recentMessageCount: row.recent_message_count,
    retrievedMessageIds: parseJson<string[]>(row.retrieved_message_ids_json) ?? [],
    contextManifest: parseJson<Record<string, unknown>>(row.context_manifest_json) ?? {},
    status: row.status,
    errorCode: row.error_code,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function canSupersede(existing: MemoryRow, category: MemoryCategory, confidence: number): boolean {
  if (category === 'previous_interpretation' && existing.category !== 'previous_interpretation') return false;
  return confidence >= existing.confidence;
}

function normalizeMemoryKey(value: string | null, content: string): string {
  const source = value?.trim() || content;
  return source.toLowerCase().replace(/[\s，。！？、,.!?：:；;“”"'（）()]/g, '').slice(0, 120);
}

function scoreRetrieved(
  message: RetrievedMessage,
  input: { terms: string[]; topic?: string | null },
): number {
  const matches = input.terms.filter(term => message.content.includes(term)).length;
  return matches * 45
    + (input.topic && message.topic === input.topic ? 25 : 0)
    + (message.role === 'user' ? 15 : 0)
    + Math.min(message.seq / 1_000, 15);
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
