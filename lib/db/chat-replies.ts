import { getDatabase } from './client';
import { getMessage } from './conversations';
import { getBaziMessage } from './bazi-conversations';

export type ChatKind = 'ziwei' | 'bazi';
const tableFor = (kind: ChatKind) => kind === 'bazi' ? 'bazi_messages' : 'messages';

export function linkChatReply(kind: ChatKind, assistantId: string, userId: string, requestId: string, retryOf: string | null) {
  getDatabase().prepare(`UPDATE ${tableFor(kind)} SET reply_to_message_id = ?, retry_of_message_id = ?, request_id = ? WHERE id = ?`)
    .run(userId, retryOf, requestId, assistantId);
}

export function findChatRequest(kind: ChatKind, requestId: string) {
  return getDatabase().prepare(`SELECT id, conversation_id AS conversationId, status FROM ${tableFor(kind)} WHERE request_id = ?`)
    .get(requestId) as { id: string; conversationId: string; status: string } | undefined;
}

/** 重试仅接受当前会话的终态回答；请求参数以持久化原问题为准，防止上下文串盘。 */
export function resolveRetryQuestion(kind: ChatKind, conversationId: string, assistantId: string) {
  const get = kind === 'bazi' ? getBaziMessage : getMessage;
  const assistant = get(assistantId);
  if (!assistant || assistant.conversationId !== conversationId || assistant.role !== 'assistant'
    || !['failed', 'cancelled', 'completed'].includes(assistant.status)) throw new Error('该回答不可重试');
  const table = tableFor(kind);
  const contextTable = kind === 'bazi' ? 'bazi_context_runs' : 'context_runs';
  const linked = assistant.replyToMessageId ?? (getDatabase().prepare(`SELECT trigger_message_id AS id FROM ${contextTable} WHERE assistant_message_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(assistantId) as { id: string } | undefined)?.id;
  const userId = linked ?? (getDatabase().prepare(`SELECT id FROM ${table} WHERE conversation_id = ? AND role = 'user' AND seq < ? ORDER BY seq DESC LIMIT 1`)
    .get(conversationId, assistant.seq) as { id: string } | undefined)?.id;
  const user = userId ? get(userId) : null;
  if (!user || user.role !== 'user' || user.conversationId !== conversationId) throw new Error('原问题不存在，无法重试');
  return user;
}
