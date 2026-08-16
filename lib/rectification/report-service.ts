import type { ChatMessage } from '@/lib/ai/deepseek';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { createConversation, deleteConversation, getConversation } from '@/lib/db/conversations';
import {
  claimRectificationReportVersion,
  completeRectificationReportVersion,
  failRectificationReportVersion,
  getOrCreateRectificationReport,
  getRectificationConversationLinkBySelection,
  getRectificationReport,
  getRectificationReportDetail,
  insertRectificationConversationLink,
} from '@/lib/db/rectification-reports';
import { getRectificationSession } from '@/lib/db/rectifications';
import type { ReportContent, ReportSection } from '@/lib/reports/types';
import { findRectificationEvaluationState } from './evaluation-service';
import { findRectificationEventMatrix } from './event-service';
import {
  buildRectificationReportFacts,
  buildRectificationReportInputFingerprint,
  candidateForSelection,
} from './report-facts';
import {
  RECTIFICATION_REPORT_SECTIONS,
  type RectificationReportDetail,
  type RectificationReportEvidenceDraft,
} from './report-types';
import { findRectificationSelections } from './selection-service';

export const RECTIFICATION_REPORT_PROMPT_VERSION = 'rectification-conclusion-v2';
const GENERATING_STALE_MS = 3 * 60 * 1000;
const REPORT_TITLE = '出生时辰校时结论报告';
const DISCLAIMER = '本报告属于传统文化研究与校时工作记录，只呈现当前证据下的相对比较，不代表统计概率或事实证明，不构成医疗、投资、法律或其他专业决策建议。';

export async function generateRectificationReport(input: {
  sessionId: string;
  regenerate?: boolean;
}): Promise<RectificationReportDetail> {
  const session = getRectificationSession(input.sessionId);
  if (!session) throw new Error('校时会话不存在');
  const state = findRectificationEvaluationState(input.sessionId);
  if (!state.evaluation) throw new Error('尚未生成校时评估，请先运行规则评估');
  if (!state.isCurrent) throw new Error('事件证据已经变化，请重新评估后再生成报告');
  const selection = findRectificationSelections(input.sessionId)
    .find(item => item.evaluationId === state.evaluation!.id && item.candidateId === session.selectedCandidateId) ?? null;
  const report = getOrCreateRectificationReport(input.sessionId, REPORT_TITLE);
  const inputFingerprint = buildRectificationReportInputFingerprint({
    evaluationId: state.evaluation.id,
    evaluationInputFingerprint: state.evaluation.inputFingerprint,
    selectionId: selection?.id ?? null,
  });
  const provider = getProviderConfig();
  const claim = claimRectificationReportVersion({
    reportId: report.id,
    sessionId: input.sessionId,
    evaluationId: state.evaluation.id,
    selectionId: selection?.id ?? null,
    inputFingerprint,
    methodologyVersion: state.evaluation.methodologyVersion,
    evaluationEngineVersion: state.evaluation.evaluationEngineVersion,
    promptVersion: RECTIFICATION_REPORT_PROMPT_VERSION,
    provider: provider.provider,
    model: provider.model,
    regenerate: Boolean(input.regenerate),
    staleAfterMs: GENERATING_STALE_MS,
  });
  if (!claim.claimed) return getRectificationReportDetail(report.id)!;

  try {
    const built = buildRectificationReportFacts({
      session,
      evaluation: state.evaluation,
      matrix: findRectificationEventMatrix(input.sessionId),
      selection,
    });
    const result = await createChatCompletion(
      buildRectificationReportMessages(built.evidence, built.factPack),
      { temperature: 0.15, maxTokens: 3_200, thinking: false },
    );
    const content = parseRectificationReportContent(result.content, built.evidence, built.factPack);
    const byKey = new Map(built.evidence.map(item => [item.evidenceKey, item]));
    completeRectificationReportVersion({
      versionId: claim.version.id,
      content,
      evidenceBySection: content.sections.map(section => ({
        sectionKey: section.key,
        evidence: section.evidenceIds.map(id => byKey.get(id)).filter((item): item is RectificationReportEvidenceDraft => Boolean(item)),
      })),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    return getRectificationReportDetail(report.id)!;
  } catch (error) {
    failRectificationReportVersion(claim.version.id, error instanceof Error ? error.message : 'rectification_report_generation_failed');
    throw error;
  }
}

export async function regenerateRectificationReport(reportId: string): Promise<RectificationReportDetail> {
  const report = getRectificationReport(reportId);
  if (!report) throw new Error('校时报告不存在');
  return generateRectificationReport({ sessionId: report.sessionId, regenerate: true });
}

export function buildRectificationReportMessages(
  evidence: RectificationReportEvidenceDraft[],
  factPack: ReturnType<typeof buildRectificationReportFacts>['factPack'],
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是中文紫微斗数出生时辰校时报告撰写助手。程序给出的评估事实是唯一权威数据，你只负责解释，不负责计算。

绝对禁止：改变候选排名、相对证据指数、置信度、并列状态、稳定性或选定状态；把相对证据指数写成概率；新增未提供的事件、星曜或因果；使用“确定、必然、注定、百分百”等措辞。

输出必须是合法 JSON 对象，不要使用 Markdown 代码块或添加额外文字。格式：
{"title":"报告标题","summary":"核心摘要","sections":[{"key":"指定key","title":"指定标题","content":"解释内容","evidenceIds":["输入中存在的证据id"]}],"actionItems":["后续验证建议"],"openQuestions":["待核实问题"]}

必须完整输出指定的五个章节且不得修改 key 和标题。结论章节必须明确区分“规则排序第一”与“用户人工选定”；如并列、低置信度或不稳定，必须在摘要和结论中显著说明。每节只能引用输入中存在的 evidenceIds。`,
    },
    {
      role: 'user',
      content: [
        `【章节】${JSON.stringify(RECTIFICATION_REPORT_SECTIONS)}`,
        `【不可变结论事实包】${JSON.stringify(factPack)}`,
        `【就绪度逐项判定】事件最低要求=${factPack.readinessChecks.minimumEventCountSatisfied ? '已满足' : '未满足'}；事件推荐要求=${factPack.readinessChecks.recommendedEventCountSatisfied ? '已满足' : '未满足'}；类别最低要求=${factPack.readinessChecks.minimumCategoryCountSatisfied ? '已满足' : '未满足'}；类别推荐要求=${factPack.readinessChecks.recommendedCategoryCountSatisfied ? '已满足' : '未满足'}。不得把某一项未满足扩展到其他已满足项。`,
        `【可引用证据】${JSON.stringify(evidence.map(item => ({ id: item.evidenceKey, kind: item.kind, label: item.label, facts: item.facts })))}`,
        `【写作要求】摘要 180 至 300 字；每节 220 至 500 字；建议 3 至 6 条；待核实问题 0 至 5 条。结论必须忠实复述数据并解释其限制。`,
      ].join('\n'),
    },
  ];
}

export function parseRectificationReportContent(
  raw: string,
  evidence: RectificationReportEvidenceDraft[],
  factPack?: ReturnType<typeof buildRectificationReportFacts>['factPack'],
): ReportContent {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error('AI 返回的校时报告不是合法 JSON'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('校时报告结构无效');
  const value = parsed as Record<string, unknown>;
  const rows = Array.isArray(value.sections) ? value.sections : [];
  const byKey = new Map(rows.filter(isObject).map(item => [String(item.key ?? ''), item]));
  const allowed = new Set(evidence.map(item => item.evidenceKey));
  const sections: ReportSection[] = RECTIFICATION_REPORT_SECTIONS.map(definition => {
    const row = byKey.get(definition.key);
    if (!row || typeof row.content !== 'string' || !row.content.trim()) throw new Error(`校时报告缺少章节：${definition.title}`);
    const evidenceIds = Array.isArray(row.evidenceIds)
      ? [...new Set(row.evidenceIds.filter((id): id is string => typeof id === 'string' && allowed.has(id)))]
      : [];
    return { key: definition.key, title: definition.title, content: row.content.trim(), basis: evidenceIds.length ? 'evidence' : 'synthesis', evidenceIds };
  });
  const modelSummary = cleanText(value.summary, '当前校时证据的结构化结论见下文。');
  const actionItems = cleanStringArray(value.actionItems, 6)
    .filter(item => !factPack || !contradictsReadiness(item, factPack));
  return {
    schemaVersion: 1,
    title: cleanText(value.title, REPORT_TITLE),
    summary: factPack ? `${buildAuthoritativeSummary(factPack)}\n\n${modelSummary}` : modelSummary,
    sections,
    actionItems,
    openQuestions: cleanStringArray(value.openQuestions, 5),
    disclaimer: DISCLAIMER,
  };
}

function buildAuthoritativeSummary(factPack: ReturnType<typeof buildRectificationReportFacts>['factPack']): string {
  const first = [...factPack.candidates].sort((a, b) => a.rank - b.rank)[0];
  const selected = factPack.candidates.find(item => item.candidateId === factPack.selectedCandidateId);
  const readiness = factPack.readiness;
  const checks = factPack.readinessChecks;
  return [
    `系统事实快照：规则排序第一为${first?.slotLabel ?? '无'}${first ? `（相对证据指数 ${formatIndex(first.relativeEvidenceIndex)}，${confidenceLabel(first.confidence)}置信度）` : ''}；人工选定为${selected?.slotLabel ?? '尚未选定'}。`,
    `可评分事件 ${readiness.confirmedEligibleEvents} 个（最低 ${readiness.minimumRequiredEvents}：${checks.minimumEventCountSatisfied ? '已满足' : '未满足'}；推荐 ${readiness.recommendedEvents}：${checks.recommendedEventCountSatisfied ? '已满足' : '未满足'}），事件类别 ${readiness.distinctScoreableCategories} 类（最低 ${readiness.minimumRequiredCategories}：${checks.minimumCategoryCountSatisfied ? '已满足' : '未满足'}；推荐 ${readiness.recommendedCategories}：${checks.recommendedCategoryCountSatisfied ? '已满足' : '未满足'}）。`,
    `稳定性：${factPack.stable ? '稳定' : '尚不稳定'}。以上字段由规则引擎生成，不由 AI 改写。`,
  ].join('');
}

function contradictsReadiness(
  text: string,
  factPack: ReturnType<typeof buildRectificationReportFacts>['factPack'],
): boolean {
  const checks = factPack.readinessChecks;
  const categoryTarget = String(factPack.readiness.recommendedCategories);
  const eventTarget = String(factPack.readiness.recommendedEvents);
  if (checks.recommendedCategoryCountSatisfied
    && new RegExp(`(?:类别|分类).*(?:不足|未达到|达到|补足).*${categoryTarget}|(?:补充|增加).*(?:类别|分类).*(?:达到|补足).*${categoryTarget}`).test(text)) return true;
  if (checks.recommendedEventCountSatisfied
    && new RegExp(`(?:事件).*(?:不足|未达到|达到|补足).*${eventTarget}|(?:补充|增加).*事件.*(?:达到|补足).*${eventTarget}`).test(text)) return true;
  return false;
}

function formatIndex(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function confidenceLabel(value: 'low' | 'medium' | 'high'): string {
  return value === 'high' ? '高' : value === 'medium' ? '中' : '低';
}

export function createConversationFromRectificationSelection(sessionId: string): { conversationId: string; reused: boolean } {
  const session = getRectificationSession(sessionId);
  if (!session) throw new Error('校时会话不存在');
  const state = findRectificationEvaluationState(sessionId);
  if (!state.evaluation || !state.isCurrent) throw new Error('请先完成与当前证据一致的校时评估');
  if (!session.selectedCandidateId) throw new Error('请先选定工作命盘');
  const selection = findRectificationSelections(sessionId)
    .find(item => item.candidateId === session.selectedCandidateId && item.evaluationId === state.evaluation!.id);
  if (!selection) throw new Error('当前选定记录不属于最新评估，请重新确认工作命盘');
  const existing = getRectificationConversationLinkBySelection(selection.id);
  if (existing && getConversation(existing.conversationId)) return { conversationId: existing.conversationId, reused: true };
  const candidate = candidateForSelection(session, selection);
  const conversation = createConversation({
    type: 'chart',
    title: `${session.baseBirthInfo.name || session.title} · 校时工作命盘`,
    birthInfo: candidate.chartSnapshot.birthInfo,
    chartSnapshot: candidate.chartSnapshot,
  });
  try {
    insertRectificationConversationLink({ sessionId, selectionId: selection.id, conversationId: conversation.id });
  } catch (error) {
    deleteConversation(conversation.id);
    const concurrent = getRectificationConversationLinkBySelection(selection.id);
    if (concurrent) return { conversationId: concurrent.conversationId, reused: true };
    throw error;
  }
  return { conversationId: conversation.id, reused: false };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function cleanStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()).slice(0, max);
}
