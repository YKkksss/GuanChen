import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from './client';
import { createConversation, getConversation } from './conversations';
import { createBaziBirthProfile } from './bazi';
import { calculateSynthesisBirth } from '@/lib/synthesis/birth';
import { SYNTHESIS_POLICY_VERSION, type SynthesisContent, type SynthesisFacts, type SynthesisSession, type SynthesisTopic, type SynthesisVersion } from '@/lib/synthesis/types';
import { SynthesisError } from '@/lib/synthesis/error';
export const SYNTHESIS_STALE_MS = 150_000;
type Row = { id: string; title: string; input_json: string; policy_json: string; conversation_id: string; bazi_chart_version_id: string; source_conversation_id: string | null; created_at: number; updated_at: number };
type VersionRow = { id: string; topic: SynthesisTopic; version: number; status: SynthesisVersion['status']; facts_fingerprint: string; facts_json: string; content_json: string | null; provider: string; model: string; error_code: string | null; created_at: number; updated_at: number };
function session(r: Row): SynthesisSession { return { id: r.id, title: r.title, input: JSON.parse(r.input_json), policy: JSON.parse(r.policy_json), conversationId: r.conversation_id, baziChartId: r.bazi_chart_version_id, sourceConversationId: r.source_conversation_id, createdAt: r.created_at, updatedAt: r.updated_at }; }
function version(r: VersionRow): SynthesisVersion { return { id: r.id, topic: r.topic, version: r.version, status: r.status, factsFingerprint: r.facts_fingerprint, facts: JSON.parse(r.facts_json), content: r.content_json ? JSON.parse(r.content_json) : null, provider: r.provider, model: r.model, errorCode: r.error_code, createdAt: r.created_at, updatedAt: r.updated_at }; }
export function getSynthesisSession(id: string) { const row = getDatabase().prepare('SELECT * FROM synthesis_sessions WHERE id = ?').get(id) as Row | undefined; return row ? session(row) : null; }
export function listSynthesisSessions() { return (getDatabase().prepare('SELECT * FROM synthesis_sessions ORDER BY updated_at DESC LIMIT 100').all() as Row[]).map(session); }
export function createSynthesisSession(raw: unknown) {
  const calculated = calculateSynthesisBirth(raw), input = calculated.input;
  if (input.sourceConversationId) {
    const source = getConversation(input.sourceConversationId);
    if (!source || source.type !== 'chart') throw new Error('来源个人命盘不存在');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify({ policy: SYNTHESIS_POLICY_VERSION, input })).digest('hex');
  return getDatabase().transaction(() => {
    const existing = getDatabase().prepare('SELECT * FROM synthesis_sessions WHERE input_fingerprint = ?').get(fingerprint) as Row | undefined;
    if (existing) return { session: session(existing), reused: true };
    const conversation = createConversation({ type: 'chart', title: `${input.displayName} · 紫微`, birthInfo: calculated.ziweiBirth, chartSnapshot: calculated.ziwei });
    const profile = createBaziBirthProfile({ displayName: `${input.displayName} · 八字`.slice(0, 80), birthDate: input.birthDate, birthTime: input.birthTime, gender: input.gender, unknownTime: input.unknownTime, timeZoneId: input.timeZoneId, longitude: input.longitude, sourceConversationId: conversation.id, initialChart: { timeStandard: input.timeStandard, lateZiPolicy: input.lateZiPolicy } });
    const id = randomUUID(), now = Date.now();
    getDatabase().prepare(`INSERT INTO synthesis_sessions (id, title, input_fingerprint, input_json, policy_json, conversation_id, bazi_chart_version_id, source_conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.displayName, fingerprint, JSON.stringify(input), JSON.stringify(calculated.policy), conversation.id, profile.charts[0].id, input.sourceConversationId ?? null, now, now);
    return { session: getSynthesisSession(id)!, reused: false };
  })();
}
export function deleteSynthesisSession(id: string) { return getDatabase().prepare('DELETE FROM synthesis_sessions WHERE id = ?').run(id).changes === 1; }
export function fingerprintSynthesis(facts: SynthesisFacts) { return createHash('sha256').update(JSON.stringify(facts, (key, value) => ['calculatedAt', 'currentAge', 'currentDaXianIndex', 'isCurrentDaXian'].includes(key) ? undefined : value)).digest('hex'); }
function topicVersions(id: string, topic: SynthesisTopic) {
  getDatabase().prepare(`UPDATE synthesis_report_versions SET status = 'failed', error_code = 'interrupted', updated_at = ? WHERE session_id = ? AND topic = ? AND status = 'generating' AND updated_at < ?`).run(Date.now(), id, topic, Date.now() - SYNTHESIS_STALE_MS);
  return (getDatabase().prepare('SELECT * FROM synthesis_report_versions WHERE session_id = ? AND topic = ? ORDER BY version DESC').all(id, topic) as VersionRow[]).map(version);
}
export function synthesisStageKey(facts: SynthesisFacts) { return facts.dynamic?.key ?? 'natal'; }
export function listSynthesisVersions(id: string, topic: SynthesisTopic, scope = 'natal') {
  return topicVersions(id, topic).filter(v => synthesisStageKey(v.facts) === scope);
}
export function listDynamicSynthesisVersions(id: string) {
  return (getDatabase().prepare("SELECT * FROM synthesis_report_versions WHERE session_id = ? AND json_extract(facts_json, '$.dynamic.key') IS NOT NULL ORDER BY updated_at DESC, version DESC").all(id) as VersionRow[]).map(version);
}
/** 依据快照不调用供应商；已保存的同版事实可直接复用。 */
export function storeSynthesisSnapshot(input: { sessionId: string; facts: SynthesisFacts }) {
  return getDatabase().transaction(() => {
    const all = topicVersions(input.sessionId, input.facts.topic), fingerprint = fingerprintSynthesis(input.facts);
    const existing = all.find(v => v.status === 'completed' && v.factsFingerprint === fingerprint);
    if (existing) return existing;
    const id = randomUUID(), now = Date.now();
    getDatabase().prepare(`INSERT INTO synthesis_report_versions (id, session_id, topic, version, status, request_id, facts_fingerprint, facts_json, provider, model, prompt_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, 'local', 'deterministic', ?, ?, ?)`).run(id, input.sessionId, input.facts.topic, (all[0]?.version ?? 0) + 1, randomUUID(), fingerprint, JSON.stringify(input.facts), input.facts.dynamic?.version ?? 'natal-facts', now, now);
    getDatabase().prepare('UPDATE synthesis_sessions SET updated_at = ? WHERE id = ?').run(now, input.sessionId);
    return listSynthesisVersions(input.sessionId, input.facts.topic, synthesisStageKey(input.facts)).find(v => v.id === id)!;
  })();
}
export function claimSynthesisVersion(input: { sessionId: string; facts: SynthesisFacts; regenerate: boolean; provider: string; model: string; promptVersion: string }) {
  return getDatabase().transaction(() => {
    const versions = topicVersions(input.sessionId, input.facts.topic), fingerprint = fingerprintSynthesis(input.facts), scope = synthesisStageKey(input.facts);
    const pending = versions.find(v => v.status === 'generating');
    if (pending && synthesisStageKey(pending.facts) !== scope) throw new SynthesisError('该主题的其他阶段正在生成，请稍后重试', 409);
    const existing = pending ?? (!input.regenerate ? versions.find(v => v.status === 'completed' && v.content && v.factsFingerprint === fingerprint) : undefined);
    if (existing) return { version: existing, requestId: null };
    const id = randomUUID(), requestId = randomUUID(), now = Date.now();
    getDatabase().prepare(`INSERT INTO synthesis_report_versions (id, session_id, topic, version, status, request_id, facts_fingerprint, facts_json, provider, model, prompt_version, created_at, updated_at) VALUES (?, ?, ?, ?, 'generating', ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.sessionId, input.facts.topic, (versions[0]?.version ?? 0) + 1, requestId, fingerprint, JSON.stringify(input.facts), input.provider, input.model, input.promptVersion, now, now);
    getDatabase().prepare('UPDATE synthesis_sessions SET updated_at = ? WHERE id = ?').run(now, input.sessionId);
    return { version: listSynthesisVersions(input.sessionId, input.facts.topic, scope).find(v => v.id === id)!, requestId };
  })();
}
export function finishSynthesisVersion(id: string, requestId: string, content: SynthesisContent, inputTokens: number | null, outputTokens: number | null) { return getDatabase().prepare(`UPDATE synthesis_report_versions SET status = 'completed', content_json = ?, error_code = NULL, input_tokens = ?, output_tokens = ?, updated_at = ? WHERE id = ? AND request_id = ? AND status = 'generating'`).run(JSON.stringify(content), inputTokens, outputTokens, Date.now(), id, requestId).changes === 1; }
export function failSynthesisVersion(id: string, requestId: string) { getDatabase().prepare(`UPDATE synthesis_report_versions SET status = 'failed', error_code = 'generation_failed', updated_at = ? WHERE id = ? AND request_id = ? AND status = 'generating'`).run(Date.now(), id, requestId); }
