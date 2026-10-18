import { randomUUID } from 'node:crypto';
import { getDatabase } from './client';
import type { FortuneContent, FortuneDetail, FortuneFacts, FortuneReport, FortuneSummary, FortuneTopic, FortuneVersion } from '@/lib/fortune-topics/types';
export const FORTUNE_STALE_MS = 150_000;
type ReportRow = { id: string; conversation_id: string; topic: FortuneTopic; period_key: string; comparison_key: string; title: string; active_version_id: string | null; created_at: number; updated_at: number };
type VersionRow = { id: string; version: number; status: FortuneVersion['status']; facts_json: string; content_json: string | null; provider: string; model: string; error_code: string | null; created_at: number; updated_at: number };
function report(row: ReportRow): FortuneReport { return { id: row.id, conversationId: row.conversation_id, topic: row.topic, periodKey: row.period_key, comparisonKey: row.comparison_key, title: row.title, activeVersionId: row.active_version_id, createdAt: row.created_at, updatedAt: row.updated_at }; }
function version(row: VersionRow): FortuneVersion { return { id: row.id, version: row.version, status: row.status, facts: JSON.parse(row.facts_json), content: row.content_json ? JSON.parse(row.content_json) : null, provider: row.provider, model: row.model, createdAt: row.created_at, updatedAt: row.updated_at, errorCode: row.error_code }; }
function expire(conversationId: string) { getDatabase().prepare(`UPDATE fortune_topic_versions SET status = 'failed', error_code = 'interrupted', updated_at = ? WHERE status = 'generating' AND updated_at < ? AND report_id IN (SELECT id FROM fortune_topic_reports WHERE conversation_id = ?)`).run(Date.now(), Date.now() - FORTUNE_STALE_MS, conversationId); }
export function getFortuneReport(conversationId: string, id: string): FortuneDetail | null {
  expire(conversationId);
  const row = getDatabase().prepare('SELECT * FROM fortune_topic_reports WHERE conversation_id = ? AND id = ?').get(conversationId, id) as ReportRow | undefined;
  if (!row) return null;
  return { report: report(row), versions: (getDatabase().prepare('SELECT * FROM fortune_topic_versions WHERE report_id = ? ORDER BY version DESC').all(id) as VersionRow[]).map(version) };
}
export function findFortuneReport(conversationId: string, topic: FortuneTopic, period: string, comparison: string): FortuneDetail | null {
  const row = getDatabase().prepare('SELECT id FROM fortune_topic_reports WHERE conversation_id = ? AND topic = ? AND period_key = ? AND comparison_key = ?').get(conversationId, topic, period, comparison) as { id: string } | undefined;
  return row ? getFortuneReport(conversationId, row.id) : null;
}
export function listFortuneReports(conversationId: string): FortuneSummary[] {
  expire(conversationId);
  const rows = getDatabase().prepare(`SELECT r.*, v.status, c.content_json, (SELECT COUNT(*) FROM fortune_topic_versions WHERE report_id = r.id) version_count FROM fortune_topic_reports r
    JOIN fortune_topic_versions v ON v.report_id = r.id AND v.version = (SELECT MAX(version) FROM fortune_topic_versions WHERE report_id = r.id)
    LEFT JOIN fortune_topic_versions c ON c.id = r.active_version_id WHERE r.conversation_id = ? ORDER BY r.updated_at DESC LIMIT 50`).all(conversationId) as Array<ReportRow & { status: FortuneVersion['status']; content_json: string | null; version_count: number }>;
  return rows.map(r => ({ ...report(r), status: r.status, versionCount: r.version_count, summary: r.content_json ? (JSON.parse(r.content_json) as FortuneContent).summary : null }));
}
export function claimFortuneVersion(input: { conversationId: string; facts: FortuneFacts; title: string; provider: string; model: string; promptVersion: string; regenerate: boolean }) {
  return getDatabase().transaction(() => {
    let existing = findFortuneReport(input.conversationId, input.facts.topic, input.facts.a.period.key, input.facts.b?.period.key ?? '');
    const pending = existing?.versions.find(v => v.status === 'generating');
    if (pending) return { detail: existing!, versionId: pending.id, requestId: null };
    if (!input.regenerate && existing?.report.activeVersionId) return { detail: existing, versionId: existing.report.activeVersionId, requestId: null };
    const now = Date.now(), reportId = existing?.report.id ?? randomUUID();
    if (!existing) getDatabase().prepare(`INSERT INTO fortune_topic_reports (id, conversation_id, topic, period_key, comparison_key, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(reportId, input.conversationId, input.facts.topic, input.facts.a.period.key, input.facts.b?.period.key ?? '', input.title, now, now);
    const id = randomUUID(), requestId = randomUUID(), next = (existing?.versions[0]?.version ?? 0) + 1;
    getDatabase().prepare(`INSERT INTO fortune_topic_versions (id, report_id, version, request_id, status, facts_json, provider, model, prompt_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'generating', ?, ?, ?, ?, ?, ?)`).run(id, reportId, next, requestId, JSON.stringify(input.facts), input.provider, input.model, input.promptVersion, now, now);
    getDatabase().prepare('UPDATE fortune_topic_reports SET updated_at = ? WHERE id = ?').run(now, reportId);
    existing = getFortuneReport(input.conversationId, reportId)!;
    return { detail: existing, versionId: id, requestId };
  })();
}
/** 同事务更新正文和当前版本；令牌与状态阻止过期响应覆盖后来生成的报告。 */
export function finishFortuneVersion(id: string, requestId: string, content: FortuneContent, inputTokens: number | null, outputTokens: number | null) {
  return getDatabase().transaction(() => {
    const db = getDatabase(), now = Date.now();
    if (db.prepare(`UPDATE fortune_topic_versions SET status = 'completed', content_json = ?, error_code = NULL, input_tokens = ?, output_tokens = ?, updated_at = ? WHERE id = ? AND request_id = ? AND status = 'generating'`).run(JSON.stringify(content), inputTokens, outputTokens, now, id, requestId).changes !== 1) return false;
    db.prepare(`UPDATE fortune_topic_reports SET active_version_id = ?, updated_at = ? WHERE id = (SELECT report_id FROM fortune_topic_versions WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM fortune_topic_versions newer WHERE newer.report_id = fortune_topic_reports.id AND newer.version > (SELECT version FROM fortune_topic_versions WHERE id = ?) AND newer.status = 'completed')`).run(id, now, id, id);
    return true;
  })();
}
export function failFortuneVersion(id: string, requestId: string, code: string) { getDatabase().prepare(`UPDATE fortune_topic_versions SET status = 'failed', error_code = ?, updated_at = ? WHERE id = ? AND request_id = ? AND status = 'generating'`).run(code, Date.now(), id, requestId); }
