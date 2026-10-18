import { getConversation } from '@/lib/db/conversations';
import { getBaziReadingDetail } from '@/lib/bazi/reading-service';
import { claimSynthesisVersion, failSynthesisVersion, fingerprintSynthesis, finishSynthesisVersion, getSynthesisSession, listSynthesisVersions } from '@/lib/db/synthesis';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { buildSynthesisFacts } from './facts';
import { buildSynthesisMessages, SYNTHESIS_PROMPT_VERSION, validateSynthesisContent } from './interpretation';
import type { SynthesisDetail, SynthesisTopic } from './types';
import { SynthesisError } from './error';
export { SynthesisError } from './error';
export function getSynthesisDetail(id: string, topic: SynthesisTopic): SynthesisDetail {
  const session = getSynthesisSession(id);
  if (!session) throw new SynthesisError('合参命盘不存在', 404);
  const conversation = getConversation(session.conversationId);
  if (!conversation?.chartSnapshot) throw new SynthesisError('关联的紫微命盘不存在', 404);
  const facts = buildSynthesisFacts(topic, session.policy, conversation.chartSnapshot, getBaziReadingDetail(session.baziChartId).facts), versions = listSynthesisVersions(id, topic), fingerprint = fingerprintSynthesis(facts);
  const active = versions.find(v => v.status === 'completed' && v.factsFingerprint === fingerprint) ?? versions.find(v => v.status === 'completed');
  return { session, facts, versions, activeVersionId: active?.id ?? null };
}
export async function generateSynthesisReport(id: string, topic: SynthesisTopic, regenerate = false, signal?: AbortSignal) {
  const detail = getSynthesisDetail(id, topic), fingerprint = fingerprintSynthesis(detail.facts);
  if (detail.versions.some(v => v.status === 'generating') || (!regenerate && detail.versions.some(v => v.status === 'completed' && v.factsFingerprint === fingerprint))) return detail;
  const config = getProviderConfig();
  if (!config.apiKey || !config.baseUrl || !config.model) throw new SynthesisError('AI 服务尚未配置，请联系管理员', 503);
  const claim = claimSynthesisVersion({ sessionId: id, facts: detail.facts, regenerate, provider: config.provider, model: config.model, promptVersion: SYNTHESIS_PROMPT_VERSION });
  if (!claim.requestId) return getSynthesisDetail(id, topic);
  try {
    const deadline = AbortSignal.timeout(100_000);
    const result = await createChatCompletion(buildSynthesisMessages(detail.facts), { temperature: 0.2, maxTokens: 3600, thinking: false, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    finishSynthesisVersion(claim.version.id, claim.requestId, validateSynthesisContent(result.content, detail.facts), result.usage.inputTokens, result.usage.outputTokens);
    return getSynthesisDetail(id, topic);
  } catch (e) {
    failSynthesisVersion(claim.version.id, claim.requestId);
    if (e instanceof SynthesisError) throw e;
    throw new SynthesisError('合参报告生成失败，请稍后重试。已保存的旧版本仍可查看。', 502);
  }
}
