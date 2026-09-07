import type { ChatMessage } from '@/lib/ai/deepseek';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { getConversation } from '@/lib/db/conversations';
import { listLifeEvents } from '@/lib/db/events';
import { evaluateHemingConversation } from '@/lib/heming/service';
import {
  claimReportVersion,
  completeReportVersion,
  failReportVersion,
  getOrCreateReport,
  getReport,
  getReportDetail,
} from '@/lib/db/reports';
import { buildReportEvidence } from './facts';
import { buildHemingReportEvidence } from './heming-facts';
import type {
  ReportContent,
  ReportDetail,
  ReportEvidenceDraft,
  ReportSection,
  ReportType,
} from './types';
import { HEMING_REPORT_DEFINITION, REPORT_TYPE_DEFINITIONS, type ReportTypeDefinition } from './types';

export const TOPIC_REPORT_ENGINE_VERSION = 'ziwei-v1';
export const TOPIC_REPORT_PROMPT_VERSION = 'topic-report-v2';
export const HEMING_REPORT_PROMPT_VERSION = 'heming-report-v1';
const GENERATING_STALE_MS = 3 * 60 * 1000;
const DISCLAIMER = '本报告属于传统文化研究与自我观察参考，不构成医疗、投资、法律、婚姻或其他专业决策建议。';

export async function generateTopicReport(input: {
  conversationId: string;
  type: ReportType;
  regenerate?: boolean;
}): Promise<ReportDetail> {
  const conversation = getConversation(input.conversationId);
  if (!conversation) throw new Error('会话不存在');
  if (conversation.type === 'heming') {
    if (input.type !== 'relationship') throw new Error('合盘会话只支持合盘关系报告');
    return generateHemingReport({
      conversationId: input.conversationId,
      regenerate: input.regenerate,
    });
  }
  if (!conversation.chartSnapshot) throw new Error('会话缺少命盘快照');

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
    const messages = buildTopicReportMessages(input.type, evidence);
    let result = await createChatCompletion(messages,
      { temperature: 0.3, maxTokens: 4_800, thinking: false });
    let inputTokens = result.usage.inputTokens;
    let outputTokens = result.usage.outputTokens;
    let content: ReportContent;
    try {
      content = parseAndValidateReportContent(result.content, input.type, evidence);
    } catch (error) {
      // 仅对内容校验失败修正一次；网络失败沿用原有失败恢复流程。
      result = await createChatCompletion([
        ...messages,
        { role: 'assistant', content: result.content },
        { role: 'user', content: `上次报告未通过校验：${error instanceof Error ? error.message : '结构错误'}。请依据原始证据重新输出完整 JSON，修正所有章节，勿仅返回差异。` },
      ], { temperature: 0.2, maxTokens: 4_800, thinking: false });
      inputTokens = inputTokens === null || result.usage.inputTokens === null
        ? null : inputTokens + result.usage.inputTokens;
      outputTokens = outputTokens === null || result.usage.outputTokens === null
        ? null : outputTokens + result.usage.outputTokens;
      content = parseAndValidateReportContent(result.content, input.type, evidence);
    }
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
      inputTokens,
      outputTokens,
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

export async function generateHemingReport(input: {
  conversationId: string;
  regenerate?: boolean;
}): Promise<ReportDetail> {
  const conversation = getConversation(input.conversationId);
  if (!conversation || conversation.type !== 'heming') throw new Error('合盘会话不存在');
  if (!conversation.chartSnapshotA || !conversation.chartSnapshotB || !conversation.relationshipType) {
    throw new Error('合盘会话缺少双命盘或关系类型');
  }

  const report = getOrCreateReport(
    input.conversationId,
    'relationship',
    HEMING_REPORT_DEFINITION.label,
  );
  const provider = getProviderConfig();
  const claim = claimReportVersion({
    reportId: report.id,
    engineVersion: conversation.engineVersion || TOPIC_REPORT_ENGINE_VERSION,
    promptVersion: HEMING_REPORT_PROMPT_VERSION,
    provider: provider.provider,
    model: provider.model,
    regenerate: Boolean(input.regenerate),
    staleAfterMs: GENERATING_STALE_MS,
  });
  if (!claim.claimed) return getReportDetail(report.id)!;

  try {
    const evaluation = evaluateHemingConversation(input.conversationId);
    const evidence = buildHemingReportEvidence(evaluation, conversation.relationshipContext);
    const result = await createChatCompletion(
      buildHemingReportMessages(evidence, evaluation.warnings),
      { temperature: 0.25, maxTokens: 3_000, thinking: false },
    );
    const content = parseAndValidateHemingReportContent(result.content, evidence);
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
      error instanceof Error ? error.message : 'heming_report_generation_failed',
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
  "summary": "120至220字核心摘要",
  "sections": [
    {
      "key": "指定章节key",
      "title": "指定章节标题",
      "content": "180至300字分析，证据不足时明确不足，不凑字数",
      "evidenceIds": ["输入中存在的证据id"]
    }
  ],
  "actionItems": ["3至6条可操作建议"],
  "openQuestions": ["0至4条需要用户结合现实继续观察的问题"]
}

必须完整输出指定章节，每章仅出现一次，章节 key 和标题不得更改。各章回答不同问题，不复制正文或摘要；建议包含具体行动与观察方式，避免重复口号。用户事件是待对照的现实记录，不证明命理因果；保留原日期精度，没有记录不等于没有发生。每个重要判断要引用至少一个相关 evidenceIds；确实属于跨证据综合推断时可以不引用，但必须在正文中明确写“综合观察”。排盘事实、传统解释和现实建议要分清。不得使用“必然、一定、注定、百分百”等绝对措辞，不得编造用户职业、收入、疾病、婚姻状态或已发生事件。健康报告不得诊断疾病，财富报告不得给出具体买卖指令，感情报告不得替用户作出结婚或分手决定。证据中的 birthTimeConfidence 为 unknown 时，必须说明时辰未知、当前为试排并降低相关结论置信度。`,
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

export function buildHemingReportMessages(
  evidence: ReportEvidenceDraft[],
  warnings: string[] = [],
): ChatMessage[] {
  const sections = HEMING_REPORT_DEFINITION.sectionKeys.map(section => ({
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
      content: `你是中文紫微斗数合盘关系报告撰写助手。你只能解释输入中的甲乙双命盘事实、程序规则结果和用户明确确认的现实背景。

输出必须是合法 JSON 对象，不要使用 Markdown 代码块，不要添加 JSON 之外的文字。格式：
{
  "title": "报告标题",
  "summary": "250至400字核心摘要",
  "sections": [{"key":"指定章节key","title":"指定章节标题","content":"350至700字分析","evidenceIds":["输入中存在的证据id"]}],
  "actionItems": ["3至6条可操作建议"],
  "openQuestions": ["0至6条需要双方确认或继续观察的问题"]
}

硬性规则：
1. 完整输出指定章节，章节 key 和标题不得修改；每个重要判断引用相关 evidenceIds。
2. 永远区分甲方 A、乙方 B 和双方互动，不得交换、合并或补造任一方事实。
3. 规则引擎结果是权威观察，不得修改其级别、置信度、规则编号或阶段。
4. 本命关系基线与当前阶段影响必须分层；阶段信息不能改写本命基线。
5. 结构对应不等于吉，结构差异不等于凶；不得输出总分、匹配百分比或绝对结论。
6. 未在用户确认背景中出现的现实经历必须写为未知，不得编造婚姻状态、财务安排、疾病或冲突事件。
7. 不替用户作出结婚、分手、签约、投资、医疗或其他重大决定，不使用恐吓性措辞。`,
    },
    {
      role: 'user',
      content: [
        `【报告类型】${HEMING_REPORT_DEFINITION.label}`,
        `【报告目标】${HEMING_REPORT_DEFINITION.description}`,
        `【必须输出的章节】${JSON.stringify(sections)}`,
        `【可引用的权威证据】${JSON.stringify(evidencePayload)}`,
        `【程序警告】${JSON.stringify(warnings)}`,
        '请生成结构稳定、谨慎、明确区分甲乙且可回溯的完整合盘报告。',
      ].join('\n'),
    },
  ];
}

export function parseAndValidateReportContent(
  raw: string,
  type: ReportType,
  evidence: ReportEvidenceDraft[],
): ReportContent {
  const definition = REPORT_TYPE_DEFINITIONS[type];
  validateTopicReportQuality(parseJsonObject(raw), definition, evidence);
  return parseAndValidateContent(raw, definition, evidence, definition.label);
}

export function parseAndValidateHemingReportContent(
  raw: string,
  evidence: ReportEvidenceDraft[],
): ReportContent {
  return parseAndValidateContent(
    raw,
    HEMING_REPORT_DEFINITION,
    evidence,
    HEMING_REPORT_DEFINITION.label,
  );
}

// 专题报告的新生成质量门槛；历史版本与合盘契约不受影响。
function validateTopicReportQuality(
  parsed: Record<string, unknown>,
  definition: ReportTypeDefinition,
  evidence: ReportEvidenceDraft[],
): void {
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const keys = new Set(definition.sectionKeys.map(section => section.key));
  const evidenceIds = new Set(evidence.map(item => item.evidenceKey));
  if (sections.length !== keys.size || sections.some(section => !isObject(section) || !keys.has(String(section.key)))
    || new Set(sections.map(section => isObject(section) ? section.key : null)).size !== keys.size) {
    throw new Error('AI 报告章节必须完整且唯一，不得增加未知章节');
  }
  const bodies = new Set<string>();
  const normalize = (text: string) => text.replace(/[\s\p{P}\p{S}]/gu, '');
  const summary = typeof parsed.summary === 'string' ? normalize(parsed.summary) : '';
  for (const section of sections) {
    if (!isObject(section)) continue;
    const ids = section.evidenceIds;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !evidenceIds.has(id))) {
      throw new Error(`AI 报告章节 ${section.key} 引用了未知证据或引用格式错误`);
    }
    const body = typeof section.content === 'string' ? section.content.trim() : '';
    if (!ids.length && !body.includes('综合观察')) {
      throw new Error(`AI 报告章节 ${section.key} 缺少依据；无引用的推断须明确标注“综合观察”`);
    }
    const normalized = normalize(body);
    if (normalized && (bodies.has(normalized) || normalized === summary)) {
      throw new Error(`AI 报告章节 ${section.key} 正文与其他章节或摘要重复`);
    }
    bodies.add(normalized);
  }
  if (!normalizeStringArray(parsed.actionItems, 6).length) {
    throw new Error('AI 报告缺少可操作建议');
  }
}

function parseAndValidateContent(
  raw: string,
  definition: ReportTypeDefinition,
  evidence: ReportEvidenceDraft[],
  title: string,
): ReportContent {
  const parsed = parseJsonObject(raw);
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
    title,
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
