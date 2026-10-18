import { getProviderConfig, createChatCompletion } from '@/lib/ai/deepseek';
import { claimSynthesisVersion, failSynthesisVersion, finishSynthesisVersion, fingerprintSynthesis, listDynamicSynthesisVersions, listSynthesisVersions, storeSynthesisSnapshot } from '@/lib/db/synthesis';
import { getSynthesisDetail } from './service';
import { SynthesisError } from './error';
import { buildDynamicSynthesisFacts, normalizeDynamicSelection, resolveDynamicRange } from './dynamic-engine';
import { buildSynthesisMessages, validateSynthesisContent, resolveSynthesisPromptVersion } from './interpretation';
import { SYNTHESIS_DYNAMIC_VERSION, type SynthesisDynamicDetail, type SynthesisDynamicFacts, type SynthesisDynamicHistory } from './dynamic-types';
import type { SynthesisTopic } from './types';

export function getDynamicSynthesisDetail(id: string, topic: SynthesisTopic, rawSelection?: unknown, savedKey?: string): SynthesisDynamicDetail {
  const base = getSynthesisDetail(id, topic), all = listDynamicSynthesisVersions(id);
  const history: SynthesisDynamicHistory[] = [];
  for (const item of all) {
    const stage = item.facts.dynamic;
    if (!stage || item.status !== 'completed') continue;
    const old = history.find(h => h.key === stage.key && h.topic === item.topic);
    if (old) { old.hasReport ||= Boolean(item.content); continue; }
    history.push({ key: stage.key, selection: stage.selection, label: stage.label, topic: item.topic, updatedAt: item.updatedAt, hasReport: Boolean(item.content) });
  }
  const range = resolveDynamicRange(base.facts);
  const preferredHistory = history.find(item => item.topic === topic) ?? history[0];
  const current = new Date(Date.now() + 8 * 60 * 60_000).toISOString().slice(0, 19);
  const fallback = current < range.minDateTime ? range.minDateTime : current > range.maxDateTime ? range.maxDateTime : current;
  let selection;
  try { selection = normalizeDynamicSelection(rawSelection ?? preferredHistory?.selection ?? { level: 'month', dateTime: fallback }); }
  catch (e) { throw new SynthesisError(e instanceof Error ? e.message : '观察阶段格式不正确'); }
  if (savedKey !== undefined && (typeof savedKey !== 'string' || !savedKey || savedKey.length > 200)) throw new SynthesisError('已保存阶段标识不正确');
  const requestedKey = savedKey ?? (rawSelection === undefined ? preferredHistory?.key : undefined);
  const key = requestedKey ?? `${SYNTHESIS_DYNAMIC_VERSION}:${selection.level}:${selection.dateTime}`;
  const versions = listSynthesisVersions(id, topic, key);
  const saved = versions.find(v => v.status === 'completed' && v.facts.dynamic);
  if (requestedKey && !saved) {
    // 默认历史可能来自另一个主题，此时继续计算同一时点的新主题，不能引用另一主题的事实。
    if (savedKey) throw new SynthesisError('当前主题下的已保存阶段不存在', 404);
    return getDynamicSynthesisDetail(id, topic, selection);
  }
  if (saved && savedKey && rawSelection === undefined) selection = saved.facts.dynamic!.selection;
  if (saved && requestedKey && (saved.facts.dynamic!.selection.level !== selection.level || saved.facts.dynamic!.selection.dateTime !== selection.dateTime)) throw new SynthesisError('观察条件与已保存阶段不一致');
  // 回看优先使用已保存事实，规则升级通过新版本键区分，不覆写旧报告。
  let facts: SynthesisDynamicFacts;
  try { facts = saved ? saved.facts as SynthesisDynamicFacts : buildDynamicSynthesisFacts(base.facts, selection); }
  catch (e) { throw new SynthesisError(e instanceof Error ? e.message : '无法定位观察阶段'); }
  const active = versions.find(v => v.status === 'completed' && v.content);
  return { session: base.session, facts, versions, activeVersionId: active?.id ?? null, savedSnapshotId: saved?.id ?? null, history: history.slice(0, 100) };
}

export function saveDynamicSynthesisSnapshot(id: string, topic: SynthesisTopic, selection: unknown, savedKey?: string) {
  const detail = getDynamicSynthesisDetail(id, topic, selection, savedKey);
  storeSynthesisSnapshot({ sessionId: id, facts: detail.facts });
  return getDynamicSynthesisDetail(id, topic, detail.facts.dynamic.selection, detail.facts.dynamic.key);
}

export async function generateDynamicSynthesisReport(id: string, topic: SynthesisTopic, selection: unknown, regenerate = false, signal?: AbortSignal, savedKey?: string) {
  const detail = getDynamicSynthesisDetail(id, topic, selection, savedKey), fingerprint = fingerprintSynthesis(detail.facts);
  if (detail.versions.some(v => v.status === 'generating') || (!regenerate && detail.versions.some(v => v.status === 'completed' && v.content && v.factsFingerprint === fingerprint))) return detail;
  const config = getProviderConfig();
  if (!config.apiKey || !config.baseUrl || !config.model) throw new SynthesisError('AI 服务尚未配置，请联系管理员', 503);
  const claim = claimSynthesisVersion({ sessionId: id, facts: detail.facts, regenerate, provider: config.provider, model: config.model, promptVersion: resolveSynthesisPromptVersion(detail.facts) });
  if (!claim.requestId) return getDynamicSynthesisDetail(id, topic, selection, savedKey);
  try {
    const deadline = AbortSignal.timeout(100_000);
    const result = await createChatCompletion(buildSynthesisMessages(detail.facts), { temperature: 0.2, maxTokens: 4000, thinking: false, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    finishSynthesisVersion(claim.version.id, claim.requestId, validateSynthesisContent(result.content, detail.facts), result.usage.inputTokens, result.usage.outputTokens);
    return getDynamicSynthesisDetail(id, topic, selection, detail.facts.dynamic.key);
  } catch {
    failSynthesisVersion(claim.version.id, claim.requestId);
    throw new SynthesisError('动态合参生成失败，请稍后重试。已保存的阶段与旧报告仍可查看。', 502);
  }
}
