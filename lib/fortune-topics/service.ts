import { getConversation } from '@/lib/db/conversations';
import { buildAnnualTransitSnapshotAtDate, buildMonthlyTransitSnapshot } from '@/lib/transits/engine';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { claimFortuneVersion, failFortuneVersion, findFortuneReport, finishFortuneVersion, getFortuneReport, listFortuneReports } from '@/lib/db/fortune-topics';
import { clampCalendarDate } from '@/lib/fortune-calendar/dates';
import { availableYears, defaultYear, periodsForYear, resolvePeriod } from './periods';
import { buildFortuneFacts, buildFortuneMessages, FORTUNE_PROMPT_VERSION, validateFortuneContent } from './interpretation';
import { FORTUNE_TOPICS, type FortuneOptions, type FortunePeriod, type FortuneTopic } from './types';
export class FortuneError extends Error { constructor(message: string, public status = 400) { super(message); } }
function chartFor(id: string) {
  const conversation = getConversation(id);
  if (!conversation) throw new FortuneError('命盘不存在', 404);
  if (conversation.type !== 'chart' || !conversation.chartSnapshot || !conversation.birthInfo) throw new FortuneError('紫微运势专题需要完整的个人命盘');
  const b = conversation.birthInfo;
  return { conversation, chart: conversation.chartSnapshot, minDate: `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`, maxDate: `${Math.min(b.year + 130, 2200)}-12-31` };
}
export function getFortuneOptions(id: string, year?: number): FortuneOptions {
  const { conversation, minDate, maxDate } = chartFor(id), selected = year ?? defaultYear(minDate, maxDate);
  try { return { title: conversation.title, year: selected, years: availableYears(minDate, maxDate), periods: periodsForYear(selected, minDate, maxDate), defaultPeriod: `year:${selected}`, history: listFortuneReports(id) }; }
  catch { throw new FortuneError('请选择命盘范围内的农历年份'); }
}
export function getFortunePreview(id: string, topic: FortuneTopic, periodKey: string, compareKey = '') {
  const { chart, minDate, maxDate } = chartFor(id);
  let a: FortunePeriod, b: FortunePeriod | null;
  try { a = resolvePeriod(periodKey, minDate, maxDate); b = compareKey ? resolvePeriod(compareKey, minDate, maxDate) : null; } catch (e) { throw new FortuneError(e instanceof Error ? e.message : '阶段格式错误'); }
  if (b && (a.level !== b.level || a.key === b.key)) throw new FortuneError('对比请选择两个不同年份，或两个不同的农历月份');
  const stage = (p: FortunePeriod) => ({ period: p, snapshot: p.level === 'year' ? buildAnnualTransitSnapshotAtDate(chart, clampCalendarDate(`${p.year}-07-01`, p.startDate, p.endDate)) : buildMonthlyTransitSnapshot(chart, p.startDate) });
  return { facts: buildFortuneFacts(chart, topic, stage(a), b ? stage(b) : null), detail: findFortuneReport(id, topic, a.key, b?.key ?? '') };
}
export function readFortuneReport(id: string, reportId: string) {
  chartFor(id);
  const detail = getFortuneReport(id, reportId);
  if (!detail) throw new FortuneError('专题报告不存在', 404);
  return detail;
}
export async function generateFortuneReport(id: string, topic: FortuneTopic, period: string, compare = '', regenerate = false, signal?: AbortSignal) {
  const { facts, detail } = getFortunePreview(id, topic, period, compare);
  if (detail?.versions.some(v => v.status === 'generating') || (!regenerate && detail?.report.activeVersionId)) return detail;
  const config = getProviderConfig();
  if (!config.apiKey || !config.baseUrl || !config.model) throw new FortuneError('AI 服务尚未配置，请联系管理员', 503);
  const title = `${FORTUNE_TOPICS[topic].label} · ${facts.a.period.label}${facts.b ? ` 与 ${facts.b.period.label}对比` : ''}`;
  const claim = claimFortuneVersion({ conversationId: id, facts, title, provider: config.provider, model: config.model, promptVersion: FORTUNE_PROMPT_VERSION, regenerate });
  if (!claim.requestId) return claim.detail;
  try {
    const deadline = AbortSignal.timeout(100_000);
    const result = await createChatCompletion(buildFortuneMessages(facts), { temperature: 0.25, maxTokens: 4400, thinking: false, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    finishFortuneVersion(claim.versionId, claim.requestId, validateFortuneContent(result.content, facts), result.usage.inputTokens, result.usage.outputTokens);
    return readFortuneReport(id, claim.detail.report.id);
  } catch (error) {
    failFortuneVersion(claim.versionId, claim.requestId, 'generation_failed');
    if (error instanceof FortuneError) throw error;
    throw new FortuneError('专题生成失败，请稍后重试。原有报告和旧版本仍可查看。', 502);
  }
}
