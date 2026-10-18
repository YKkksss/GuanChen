import { randomUUID } from 'node:crypto';
import { getDatabase } from './client';
import type { CalendarFacts, CalendarReading, CalendarReadingContent, CalendarTopic } from '@/lib/fortune-calendar/types';

export const CALENDAR_STALE_MS = 150_000;
type Row = {
  id: string; conversation_id: string; target_date: string; topic: CalendarTopic;
  status: CalendarReading['status']; request_id: string; facts_json: string; content_json: string | null;
  provider: string; model: string; prompt_version: string; error_code: string | null; created_at: number; updated_at: number;
};
function map(row: Row): CalendarReading {
  return { id: row.id, conversationId: row.conversation_id, date: row.target_date, topic: row.topic, status: row.status,
    content: row.content_json ? JSON.parse(row.content_json) : null, facts: JSON.parse(row.facts_json),
    provider: row.provider, model: row.model, promptVersion: row.prompt_version, errorCode: row.error_code,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
function expire(conversationId: string) {
  getDatabase().prepare(`UPDATE fortune_calendar_readings SET status = 'failed', error_code = 'interrupted', updated_at = ?
    WHERE conversation_id = ? AND status = 'generating' AND updated_at < ?`).run(Date.now(), conversationId, Date.now() - CALENDAR_STALE_MS);
}
export function getCalendarReading(conversationId: string, date: string, topic: CalendarTopic): CalendarReading | null {
  expire(conversationId);
  const row = getDatabase().prepare('SELECT * FROM fortune_calendar_readings WHERE conversation_id = ? AND target_date = ? AND topic = ?').get(conversationId, date, topic) as Row | undefined;
  return row ? map(row) : null;
}
export function listCalendarReadings(conversationId: string, month: string, topic: CalendarTopic) {
  expire(conversationId);
  const rows = getDatabase().prepare(`SELECT target_date, status, content_json FROM fortune_calendar_readings
    WHERE conversation_id = ? AND target_date >= ? AND target_date <= ? AND topic = ? ORDER BY target_date`).all(conversationId, `${month}-01`, `${month}-31`, topic) as Array<Pick<Row, 'target_date' | 'status' | 'content_json'>>;
  return rows.map(row => ({ date: row.target_date, status: row.status, summary: row.content_json ? (JSON.parse(row.content_json) as CalendarReadingContent).summary : null }));
}
export function claimCalendarReading(input: { conversationId: string; date: string; topic: CalendarTopic; facts: CalendarFacts; provider: string; model: string; promptVersion: string }) {
  return getDatabase().transaction(() => {
    const existing = getCalendarReading(input.conversationId, input.date, input.topic);
    if (existing && existing.status !== 'failed') return { reading: existing, requestId: null };
    const id = existing?.id ?? randomUUID(), requestId = randomUUID(), now = Date.now();
    getDatabase().prepare(`INSERT INTO fortune_calendar_readings
      (id, conversation_id, target_date, topic, status, request_id, facts_json, content_json, provider, model, prompt_version, error_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'generating', ?, ?, NULL, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(conversation_id, target_date, topic) DO UPDATE SET
      status = 'generating', request_id = excluded.request_id, facts_json = excluded.facts_json, content_json = NULL,
      provider = excluded.provider, model = excluded.model, prompt_version = excluded.prompt_version, error_code = NULL,
      input_tokens = NULL, output_tokens = NULL, updated_at = excluded.updated_at`).run(id, input.conversationId, input.date, input.topic,
      requestId, JSON.stringify(input.facts), input.provider, input.model, input.promptVersion, existing?.createdAt ?? now, now);
    return { reading: getCalendarReading(input.conversationId, input.date, input.topic)!, requestId };
  })();
}
/** 任务令牌防止旧请求的迟到响应覆盖一次新的重试。 */
export function finishCalendarReading(id: string, requestId: string, content: CalendarReadingContent, inputTokens: number | null, outputTokens: number | null): boolean {
  return getDatabase().prepare(`UPDATE fortune_calendar_readings SET status = 'completed', content_json = ?, error_code = NULL,
    input_tokens = ?, output_tokens = ?, updated_at = ? WHERE id = ? AND request_id = ? AND status = 'generating'`).run(
    JSON.stringify(content), inputTokens, outputTokens, Date.now(), id, requestId).changes === 1;
}
export function failCalendarReading(id: string, requestId: string, code: string) {
  getDatabase().prepare(`UPDATE fortune_calendar_readings SET status = 'failed', error_code = ?, updated_at = ?
    WHERE id = ? AND request_id = ? AND status = 'generating'`).run(code, Date.now(), id, requestId);
}
