import type { ChatMessage } from '@/lib/ai/deepseek';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { getConversation } from '@/lib/db/conversations';
import { listLifeEvents } from '@/lib/db/events';
import {
  claimReportVersion,
  completeReportVersion,
  failReportVersion,
  getOrCreateReport,
  getReport,
  getReportDetail,
} from '@/lib/db/reports';
import { buildReportEvidence } from './facts';
import type {
  ReportContent,
  ReportDetail,
  ReportEvidenceDraft,
  ReportSection,
  ReportType,
} from './types';
import { REPORT_TYPE_DEFINITIONS } from './types';

export const TOPIC_REPORT_ENGINE_VERSION = 'ziwei-v1';
export const TOPIC_REPORT_PROMPT_VERSION = 'topic-report-v1';
const GENERATING_STALE_MS = 3 * 60 * 1000;
const DISCLAIMER = '本报告属于传统文化研究与自我观察参考，不构成医疗、投资、法律、婚姻或其他专业决策建议。';

export async function generateTopicReport(input: {
  conversationId: string;
  type: ReportType;
  regenerate?: boolean;
}): Promise<ReportDetail> {
  const conversation = getConversation(input.conversationId);
  if (!conversation?.chartSnapshot) throw new Error('会话不存在或缺少命盘快照');
  if (conversation.type !== 'chart') throw new Error('当前报告类型只支持单人命盘');

  const report = getOrCreateReport(input.conversationId, input.type);
  const provider = getProviderConfig();
  const claim = claimReportVersion({
    reportId: report.id,
    engineVersion: conversation.engineVersion || TOPIC_REPORT_ENGINE_VERSION,
    promptVersion: TOPIC_REPORT_PROMPT_VERSION,
    provider: provider.provider,
    model: provider.model,
    regenerate: Boolean(input.regenerate),
    staleAfterMs: GENERATING_STALE_MS,
  });
  if (!claim.claimed) return getReportDetail(report.id)!;

  try {
    const confirmedEvents = listLifeEvents({ conversationId: input.conversationId })
      .filter(event => event.confirmedByUser);
    const evidence = buildReportEvidence(conversation.chartSnapshot, input.type, confirmedEvents);
    const result = await createChatCompletion(
      buildTopicReportMessages(input.type, evidence),
      { temperature: 0.3, maxTokens: 2_400, thinking: false },
    );
    const content = parseAndValidateReportContent(result.content, input.type, evidence);
    const evidenceByKey = new Map(evidence.map(item => [item.evidenceKey, item]));
    completeReportVersion({
      versionId: claim.version.id,
      content,
      evidenceBySection: content.sections.map(section => ({
        sectionKey: section.key,
        evidence: section.evidenceIds
          .map(id => evidenceByKey.get(id))
          .filter((item): item is ReportEvidenceDraft => Boolean(item)),
      })),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    return getReportDetail(report.id)!;
  } catch (error) {
    failReportVersion(
      claim.version.id,
      error instanceof Error ? error.message : 'topic_report_generation_failed',
    );
    throw error;
  }
}

export async function regenerateTopicReport(reportId: string): Promise<ReportDetail> {
  const report = getReport(reportId);
  if (!report) throw new Error('报告不存在');
  return generateTopicReport({
    conversationId: report.conversationId,
    type: report.type,
    regenerate: true,
  });
}

export function buildTopicReportMessages(
  type: ReportType,
  evidence: ReportEvidenceDraft[],
): ChatMessage[] {
  const definition = REPORT_TYPE_DEFINITIONS[type];
  const sections = definition.sectionKeys.map(section => ({
    key: section.key,
    title: section.title,
  }));
  const evidencePayload = evidence.map(item => ({
    id: item.evidenceKey,
    kind: item.kind,
    label: item.label,
    source: item.source,
    facts: item.facts,
  }));

  return [
    {
      role: 'system',
      content: `你是中文紫微斗数专题报告撰写助手。你只能解释输入中的命盘快照、规则引擎结果和用户明确确认的事件，不得自行计算、补全或编造星曜、宫位、现实经历。

输出必须是一个合法 JSON 对象，不要使用 Markdown 代码块，不要添加 JSON 之外的文字。格式：
{
  "title": "报告标题",
  "summary": "200至350字核心摘要",
  "sections": [
    {
      "key": "指定章节key",
      "title": "指定章节标题",
      "content": "300至600字分析",
      "evidenceIds": ["输入中存在的证据id"]
    }
  ],
  "actionItems": ["3至6条可操作建议"],
  "openQuestions": ["0至4条需要用户结合现实继续观察的问题"]
}

必须完整输出指定章节，章节 key 和标题不得更改。每个重要判断要引用至少一个相关 evidenceIds；确实属于跨证据综合推断时可以不引用，但必须在正文中明确写“综合观察”。排盘事实、传统解释和现实建议要分清。不得使用“必然、一定、注定、百分百”等绝对措辞，不得编造用户职业、收入、疾病、婚姻状态或已发生事件。健康报告不得诊断疾病，财富报告不得给出具体买卖指令，感情报告不得替用户作出结婚或分手决定。`,
    },
    {
      role: 'user',
      content: [
        `【报告类型】${definition.label}`,
        `【报告目标】${definition.description}`,
        `【必须输出的章节】${JSON.stringify(sections)}`,
        `【可引用的权威证据】${JSON.stringify(evidencePayload)}`,
        '请根据以上证据生成结构稳定、谨慎且可回溯的完整专题报告。',
      ].join('\n'),
    },
  ];
}

export function parseAndValidateReportContent(
  raw: string,
  type: ReportType,
  evidence: ReportEvidenceDraft[],
): ReportContent {
  const parsed = parseJsonObject(raw);
  const definition = REPORT_TYPE_DEFINITIONS[type];
  const validEvidenceIds = new Set(evidence.map(item => item.evidenceKey));
  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections: ReportSection[] = definition.sectionKeys.map(expected => {
    const candidate = rawSections.find(item => isObject(item) && item.key === expected.key);
    if (!candidate || typeof candidate.content !== 'string' || !candidate.content.trim()) {
      throw new Error(`AI 报告缺少章节：${expected.title}`);
    }
    const candidateEvidenceIds: unknown[] = Array.isArray(candidate.evidenceIds)
      ? candidate.evidenceIds
      : [];
    const evidenceIds: string[] = candidateEvidenceIds.filter(
      (id): id is string => typeof id === 'string' && validEvidenceIds.has(id),
    );
    return {
      key: expected.key,
      title: expected.title,
      content: candidate.content.trim(),
      basis: evidenceIds.length ? 'evidence' : 'synthesis',
      evidenceIds: [...new Set(evidenceIds)].slice(0, 12),
    };
  });

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  if (!summary) throw new Error('AI 报告缺少核心摘要');
  return {
    schemaVersion: 1,
    title: REPORT_TYPE_DEFINITIONS[type].label,
    summary,
    sections,
    actionItems: normalizeStringArray(parsed.actionItems, 6),
    openQuestions: normalizeStringArray(parsed.openQuestions, 4),
    disclaimer: DISCLAIMER,
  };
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 报告不是合法 JSON');
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1));
    if (!isObject(value)) throw new Error('AI 报告结构错误');
    return value;
  } catch (error) {
    if (error instanceof Error && error.message === 'AI 报告结构错误') throw error;
    throw new Error('AI 报告 JSON 解析失败');
  }
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map(item => item.trim())
    .slice(0, limit);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
