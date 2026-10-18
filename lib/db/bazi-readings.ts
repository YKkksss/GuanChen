import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from './client';
import type { BaziReadingContent, BaziReadingFacts, BaziReadingVersion } from '@/lib/bazi/reading-types';
export const BAZI_READING_STALE_MS = 150_000;
type Row = { id: string; chart_version_id: string; version: number; status: BaziReadingVersion['status']; facts_fingerprint: string; facts_json: string; content_json: string | null; provider: string; model: string; error_code: string | null; created_at: number; updated_at: number };
function map(row: Row): BaziReadingVersion { return { id: row.id, chartVersionId: row.chart_version_id, version: row.version, status: row.status, factsFingerprint: row.facts_fingerprint, facts: JSON.parse(row.facts_json), content: row.content_json ? JSON.parse(row.content_json) : null, provider: row.provider, model: row.model, errorCode: row.error_code, createdAt: row.created_at, updatedAt: row.updated_at }; }
/** 计算时间不是规则输入，不能使同一份已保存命盘每次预览都形成不同缓存。 */
export function fingerprintBaziReading(facts: BaziReadingFacts) { const normalized = JSON.stringify(facts, (key, value) => key === 'calculatedAt' ? undefined : value); return createHash('sha256').update(normalized).digest('hex'); }
export function listBaziReadings(chartId: string): BaziReadingVersion[] {
  const db = getDatabase();
  db.prepare(`UPDATE bazi_reading_versions SET status = 'failed', error_code = 'interrupted', updated_at = ? WHERE chart_version_id = ? AND status = 'generating' AND updated_at < ?`).run(Date.now(), chartId, Date.now() - BAZI_READING_STALE_MS);
  return (db.prepare('SELECT * FROM bazi_reading_versions WHERE chart_version_id = ? ORDER BY version DESC').all(chartId) as Row[]).map(map);
}
export function claimBaziReading(input: { chartId: string; facts: BaziReadingFacts; regenerate: boolean; provider: string; model: string; promptVersion: string }) {
  return getDatabase().transaction(() => {
    const versions = listBaziReadings(input.chartId), fingerprint = fingerprintBaziReading(input.facts);
    const existing = versions.find(v => v.status === 'generating') ?? (!input.regenerate ? versions.find(v => v.status === 'completed' && v.factsFingerprint === fingerprint) : undefined);
    if (existing) return { version: existing, requestId: null };
    const id = randomUUID(), requestId = randomUUID(), now = Date.now();
    getDatabase().prepare(`INSERT INTO bazi_reading_versions (id, chart_version_id, version, status, request_id, facts_fingerprint, facts_json, provider, model, prompt_version, created_at, updated_at)
      VALUES (?, ?, ?, 'generating', ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.chartId, (versions[0]?.version ?? 0) + 1, requestId, fingerprint, JSON.stringify(input.facts), input.provider, input.model, input.promptVersion, now, now);
    return { version: listBaziReadings(input.chartId).find(v => v.id === id)!, requestId };
  })();
}
export function finishBaziReading(id: string, requestId: string, content: BaziReadingContent, inputTokens: number | null, outputTokens: number | null) { return getDatabase().prepare(`UPDATE bazi_reading_versions SET status = 'completed', content_json = ?, input_tokens = ?, output_tokens = ?, error_code = NULL, updated_at = ? WHERE id = ? AND request_id = ? AND status = 'generating'`).run(JSON.stringify(content), inputTokens, outputTokens, Date.now(), id, requestId).changes === 1; }
export function failBaziReading(id: string, requestId: string, code: string) { getDatabase().prepare(`UPDATE bazi_reading_versions SET status = 'failed', error_code = ?, updated_at = ? WHERE id = ? AND request_id = ? AND status = 'generating'`).run(code, Date.now(), id, requestId); }
