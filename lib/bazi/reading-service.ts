import { getBaziChartVersion, getBaziBirthProfile } from '@/lib/db/bazi';
import { ensureBaziAnalysisVersion } from '@/lib/db/bazi-analysis';
import { ensureBaziPatternConditionVersion } from '@/lib/db/bazi-pattern-conditions';
import { claimBaziReading, failBaziReading, fingerprintBaziReading, finishBaziReading, listBaziReadings } from '@/lib/db/bazi-readings';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { buildBaziReadingFacts } from './reading-engine';
import { resolveBaziReadingPromptVersion, buildBaziReadingMessages, validateBaziReadingContent } from './reading-interpretation';
import type { BaziReadingDetail } from './reading-types';
export class BaziReadingError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function getBaziReadingDetail(chartId: string): BaziReadingDetail {
  const chart = getBaziChartVersion(chartId);
  if (!chart) throw new BaziReadingError('八字命盘版本不存在', 404);
  const profile = getBaziBirthProfile(chart.birthProfileId), analysis = ensureBaziAnalysisVersion(chartId), patterns = ensureBaziPatternConditionVersion(chartId);
  const facts = buildBaziReadingFacts(chart.result, analysis.result, patterns.result, chart.chartFingerprint), versions = listBaziReadings(chartId), currentFingerprint = fingerprintBaziReading(facts);
  const active = versions.find(v => v.status === 'completed' && v.factsFingerprint === currentFingerprint) ?? versions.find(v => v.status === 'completed');
  return { title: profile?.displayName ?? '八字命盘', chartVersionId: chartId, facts, versions, activeVersionId: active?.id ?? null };
}
export async function generateBaziReading(chartId: string, regenerate = false, signal?: AbortSignal) {
  const detail = getBaziReadingDetail(chartId), fingerprint = fingerprintBaziReading(detail.facts);
  if (detail.versions.some(v => v.status === 'generating') || (!regenerate && detail.versions.some(v => v.status === 'completed' && v.factsFingerprint === fingerprint))) return detail;
  const config = getProviderConfig();
  if (!config.apiKey || !config.baseUrl || !config.model) throw new BaziReadingError('AI 服务尚未配置，请联系管理员', 503);
  const claim = claimBaziReading({ chartId, facts: detail.facts, regenerate, provider: config.provider, model: config.model, promptVersion: resolveBaziReadingPromptVersion(detail.facts) });
  if (!claim.requestId) return getBaziReadingDetail(chartId);
  try {
    const deadline = AbortSignal.timeout(100_000);
    const result = await createChatCompletion(buildBaziReadingMessages(detail.facts), { temperature: 0.2, maxTokens: 3600, thinking: false, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    finishBaziReading(claim.version.id, claim.requestId, validateBaziReadingContent(result.content, detail.facts), result.usage.inputTokens, result.usage.outputTokens);
    return getBaziReadingDetail(chartId);
  } catch (e) {
    failBaziReading(claim.version.id, claim.requestId, 'generation_failed');
    if (e instanceof BaziReadingError) throw e;
    throw new BaziReadingError('论命解读生成失败，请稍后重试。旧版本仍可查看。', 502);
  }
}
