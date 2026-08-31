import { createHash } from 'node:crypto';
import type { ChatMessage, ChatCompletionResult } from '@/lib/ai/deepseek';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { getConversation } from '@/lib/db/conversations';
import {
  claimEventAnalysisVersion,
  completeEventAnalysisVersion,
  failEventAnalysisVersion,
  getEventAnalysisDetail,
  getOrCreateEventAnalysis,
  listEventAnalyses,
} from '@/lib/db/event-analyses';
import { getLifeEvent } from '@/lib/db/events';
import type { ReportContent, ReportSection } from '@/lib/reports/types';
import {
  EVENT_ANALYSIS_SECTIONS,
  type EventAnalysisDetail,
  type EventAnalysisEvidenceDraft,
  type EventAnalysisSectionKey,
  type EventAnalysisSummary,
} from './analysis-types';
import {
  LIFE_EVENT_CATEGORY_LABELS,
  type EventTransitLink,
  type LifeEventWithTransits,
} from './types';

export const EVENT_ANALYSIS_ENGINE_VERSION = 'event-retrospective-v1';
export const EVENT_ANALYSIS_PROMPT_VERSION = 'event-retrospective-prompt-v1';
const GENERATING_STALE_MS = 3 * 60 * 1000;
const DISCLAIMER = '本回溯分析仅用于传统文化学习与个人复盘。事件是用户确认的现实记录，运限挂接只表示时间结构对齐，不证明命理因素造成了该事件，也不替代医疗、法律、投资、心理或其他专业判断。';

type Completion = (
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; thinking?: boolean },
) => Promise<ChatCompletionResult>;

export function findEventAnalysisDetail(input: {
  conversationId: string;
  eventId: string;
  version?: number;
}): EventAnalysisDetail | null {
  const event = requireConfirmedEvent(input.conversationId, input.eventId);
  return getEventAnalysisDetail(
    event.id,
    buildEventAnalysisSourceFingerprint(event),
    input.version,
  );
}

export function listEventAnalysisSummaries(conversationId: string): EventAnalysisSummary[] {
  return listEventAnalyses(conversationId).flatMap(analysis => {
    const event = getLifeEvent(analysis.eventId);
    if (!event || !event.confirmedByUser) return [];
    const detail = getEventAnalysisDetail(
      event.id,
      buildEventAnalysisSourceFingerprint(event),
    );
    if (!detail) return [];
    return [{
      analysisId: detail.analysis.id,
      eventId: event.id,
      activeVersionId: detail.analysis.activeVersionId,
      version: detail.version?.version ?? null,
      versionCount: detail.versions.length,
      status: detail.version?.status ?? null,
      generationReason: detail.version?.generationReason ?? null,
      completedAt: detail.version?.completedAt ?? null,
      updatedAt: detail.analysis.updatedAt,
      isStale: detail.isStale,
    }];
  });
}

export async function generateEventAnalysis(input: {
  conversationId: string;
  eventId: string;
  regenerate?: boolean;
  completion?: Completion;
}): Promise<EventAnalysisDetail> {
  const event = requireConfirmedEvent(input.conversationId, input.eventId);
  const conversation = getConversation(input.conversationId);
  if (!conversation?.chartSnapshot) throw new Error('会话不存在或缺少命盘快照');

  const analysis = getOrCreateEventAnalysis(event.id, input.conversationId);
  const sourceFingerprint = buildEventAnalysisSourceFingerprint(event);
  const provider = getProviderConfig();
  const claim = claimEventAnalysisVersion({
    analysisId: analysis.id,
    sourceFingerprint,
    engineVersion: `${conversation.engineVersion || 'ziwei-v1'}:${EVENT_ANALYSIS_ENGINE_VERSION}`,
    promptVersion: EVENT_ANALYSIS_PROMPT_VERSION,
    provider: provider.provider,
    model: provider.model,
    regenerate: Boolean(input.regenerate),
    staleAfterMs: GENERATING_STALE_MS,
  });
  if (!claim.claimed) {
    return getEventAnalysisDetail(event.id, sourceFingerprint, claim.version.version)!;
  }

  try {
    const evidence = buildEventAnalysisEvidence(event);
    const result = await (input.completion ?? createChatCompletion)(
      buildEventAnalysisMessages(event, evidence),
      { temperature: 0.2, maxTokens: 2_000, thinking: false },
    );
    const content = parseEventAnalysisContent(result.content, event, evidence);
    const evidenceByKey = new Map(evidence.map(item => [item.evidenceKey, item]));
    completeEventAnalysisVersion({
      versionId: claim.version.id,
      content,
      evidenceBySection: content.sections.map(section => ({
        sectionKey: section.key as EventAnalysisSectionKey,
        evidence: section.evidenceIds
          .map(id => evidenceByKey.get(id))
          .filter((item): item is EventAnalysisEvidenceDraft => Boolean(item)),
      })),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    return getEventAnalysisDetail(event.id, sourceFingerprint)!;
  } catch (error) {
    failEventAnalysisVersion(
      claim.version.id,
      error instanceof Error ? error.message : 'event_analysis_generation_failed',
    );
    throw error;
  }
}

export function buildEventAnalysisSourceFingerprint(event: LifeEventWithTransits): string {
  const payload = {
    event: {
      id: event.id,
      title: event.title,
      category: event.category,
      customCategory: event.customCategory,
      startDate: event.startDate,
      endDate: event.endDate,
      datePrecision: event.datePrecision,
      description: event.description,
      impactLevel: event.impactLevel,
      source: event.source,
      sourceMessageId: event.sourceMessageId,
      confirmedByUser: event.confirmedByUser,
    },
    transitLinks: event.transitLinks.map(link => ({
      snapshotId: link.snapshotId,
      level: link.level,
      targetDate: link.targetDate,
      relationship: link.relationship,
      engineVersion: link.snapshot.engineVersion,
    })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildEventAnalysisEvidence(
  event: LifeEventWithTransits,
): EventAnalysisEvidenceDraft[] {
  const eventEvidence: EventAnalysisEvidenceDraft = {
    evidenceKey: `event:${event.id}`,
    kind: 'confirmed_event',
    label: `用户确认事件：${event.title}`,
    source: 'user_confirmed',
    facts: {
      title: event.title,
      category: event.category,
      categoryLabel: event.category === 'custom'
        ? event.customCategory ?? '自定义事件'
        : LIFE_EVENT_CATEGORY_LABELS[event.category],
      startDate: event.startDate,
      endDate: event.endDate,
      datePrecision: event.datePrecision,
      description: event.description,
      impactLevel: event.impactLevel,
      source: event.source,
      confirmedByUser: event.confirmedByUser,
    },
  };

  const annual = event.transitLinks.filter(link => link.level === 'year');
  const precise = event.transitLinks.filter(link => link.level !== 'year');
  const selectedAnnual = annual.length <= 6
    ? annual
    : [...annual.slice(0, 2), ...annual.slice(-2)];
  const evidence = [eventEvidence, ...selectedAnnual.map(buildTransitEvidence), ...precise.map(buildTransitEvidence)];
  if (annual.length > selectedAnnual.length) {
    evidence.splice(1, 0, {
      evidenceKey: `transit-range:${event.id}`,
      kind: 'transit_range_summary',
      label: `区间覆盖 ${annual.length} 个流年`,
      source: 'rule_engine',
      facts: {
        totalYears: annual.length,
        firstYear: annual[0]?.targetDate ?? null,
        lastYear: annual.at(-1)?.targetDate ?? null,
        includedBoundaryYears: selectedAnnual.map(link => link.targetDate),
        policy: '只展开首尾流年和精确起止月日，避免长期区间上下文膨胀',
      },
    });
  }
  return evidence;
}

function buildTransitEvidence(link: EventTransitLink): EventAnalysisEvidenceDraft {
  const common = {
    level: link.level,
    targetDate: link.targetDate,
    relationship: link.relationship,
    nominalAge: link.snapshot.nominalAge,
    yearGanZhi: link.snapshot.year.ganZhi,
    decadal: link.snapshot.decadal,
    flowYear: link.snapshot.flowYear,
  };
  if (link.level === 'year') {
    return {
      evidenceKey: `transit:year:${link.targetDate}`,
      kind: 'annual_transit',
      label: `${link.targetDate} 流年确定性快照`,
      source: 'rule_engine',
      facts: {
        ...common,
        transformations: link.snapshot.transformations,
        keyPalaces: link.snapshot.keyPalaces,
      },
    };
  }
  if (link.level === 'month') {
    return {
      evidenceKey: `transit:month:${link.targetDate}`,
      kind: 'monthly_transit',
      label: `${link.snapshot.lunarMonth.label}流月确定性快照`,
      source: 'rule_engine',
      facts: {
        ...common,
        lunarMonth: link.snapshot.lunarMonth,
        flowMonth: link.snapshot.flowMonth,
        yearlyTransformations: link.snapshot.yearlyTransformations,
        monthlyTransformations: link.snapshot.transformations,
        keyPalaces: link.snapshot.keyPalaces,
      },
    };
  }
  return {
    evidenceKey: `transit:day:${link.targetDate}`,
    kind: 'daily_transit',
    label: `${link.targetDate} 流日确定性快照`,
    source: 'rule_engine',
    facts: {
      ...common,
      lunarDay: link.snapshot.lunarDay,
      flowMonth: link.snapshot.flowMonth,
      flowDay: link.snapshot.flowDay,
      yearlyTransformations: link.snapshot.yearlyTransformations,
      monthlyTransformations: link.snapshot.monthlyTransformations,
      dailyTransformations: link.snapshot.transformations,
      keyPalaces: link.snapshot.keyPalaces,
    },
  };
}

export function buildEventAnalysisMessages(
  event: LifeEventWithTransits,
  evidence: EventAnalysisEvidenceDraft[],
): ChatMessage[] {
  const sections = EVENT_ANALYSIS_SECTIONS.map(({ key, title }) => ({ key, title }));
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
      content: `你是中文紫微斗数人生事件回溯助手。你的任务是帮助用户复盘一件已经发生且由用户确认的事件，而不是预测未来。运限时间重合不证明命理造成了现实事件。

输出必须是合法 JSON 对象，不要使用 Markdown 代码块，不要添加 JSON 之外的文字。格式：
{
  "summary": "150至300字回溯摘要",
  "sections": [
    {"key":"指定章节key","title":"指定章节标题","content":"200至500字","evidenceIds":["输入中存在的证据id"]}
  ],
  "actionItems": ["2至5条用于现实复盘或记录的建议"],
  "openQuestions": ["1至5条仍需用户核对的问题"]
}

硬性规则：
1. 必须完整输出指定的四个章节，key 和标题不得修改。
2. “已确认的现实事实”只能复述 user_confirmed 证据，不得增加职业、收入、疾病、人物动机或结果细节。
3. “当时的运限结构”只能解释 rule_engine 证据；若没有运限证据，必须明确写日期不足，不能自行补算。
4. “谨慎回溯解释”必须使用“可能对应、可作为观察角度”等条件性措辞，不得把时间重合写成因果，不得倒因为果。
5. “仍待验证与继续观察”要列出证据无法回答的现实问题和其他可能解释，不得把未知内容写成事实。
6. 不使用“必然、注定、百分百、就是因为”等绝对或因果措辞，不替用户作出医疗、投资、法律、婚姻等重大决定。
7. evidenceIds 只能引用输入中存在的 id；每个重要判断都应有依据。`,
    },
    {
      role: 'user',
      content: [
        `【分析对象】${event.title}`,
        `【必须输出的章节】${JSON.stringify(sections)}`,
        `【可引用证据】${JSON.stringify(evidencePayload)}`,
        '请生成结构清晰、谨慎且可以回指证据的事件回溯分析。',
      ].join('\n'),
    },
  ];
}

export function parseEventAnalysisContent(
  raw: string,
  event: LifeEventWithTransits,
  evidence: EventAnalysisEvidenceDraft[],
): ReportContent {
  const parsed = parseJsonObject(raw);
  const validEvidence = new Map(evidence.map(item => [item.evidenceKey, item]));
  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections: ReportSection[] = EVENT_ANALYSIS_SECTIONS.map(expected => {
    const candidate = rawSections.find(item => (
      isObject(item) && item.key === expected.key
    ));
    if (!candidate || typeof candidate.content !== 'string' || !candidate.content.trim()) {
      throw new Error(`事件回溯分析缺少“${expected.title}”章节`);
    }
    const candidateIds = normalizeStringArray(candidate.evidenceIds, 12)
      .filter(id => validEvidence.has(id));
    const evidenceIds = expected.key === 'confirmed_facts'
      ? candidateIds.filter(id => validEvidence.get(id)?.source === 'user_confirmed')
      : expected.key === 'timing_structure'
        ? candidateIds.filter(id => validEvidence.get(id)?.source === 'rule_engine')
        : candidateIds;
    if (expected.key === 'confirmed_facts' && !evidenceIds.includes(`event:${event.id}`)) {
      evidenceIds.unshift(`event:${event.id}`);
    }
    const hasTransitEvidence = evidence.some(item => item.source === 'rule_engine');
    if (expected.key === 'timing_structure' && hasTransitEvidence && evidenceIds.length === 0) {
      throw new Error('事件回溯分析的运限结构章节缺少程序证据');
    }
    return {
      key: expected.key,
      title: expected.title,
      content: candidate.content.trim().slice(0, 2_400),
      basis: expected.basis,
      evidenceIds,
    };
  });
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 1_200) : '';
  if (!summary) throw new Error('事件回溯分析缺少摘要');
  assertNoDeterministicCausality([summary, ...sections.map(section => section.content)]);
  return {
    schemaVersion: 1,
    title: `“${event.title}”事件回溯分析`,
    summary,
    sections,
    actionItems: normalizeStringArray(parsed.actionItems, 5),
    openQuestions: normalizeStringArray(parsed.openQuestions, 5),
    disclaimer: DISCLAIMER,
  };
}

function assertNoDeterministicCausality(texts: string[]): void {
  const forbidden = /(就是因为|完全因为|必然导致|注定会|百分之百|100%|命中注定)/;
  const qualifiedNegation = /(?:不能|不可|不应|并非|不是|不代表|不意味着|无法)[^。！？]{0,16}(?:就是因为|完全因为|必然导致|注定会|百分之百|100%|命中注定)/g;
  if (texts.some(text => forbidden.test(text.replace(qualifiedNegation, '')))) {
    throw new Error('事件回溯分析包含不允许的确定性因果表述');
  }
}

function requireConfirmedEvent(conversationId: string, eventId: string): LifeEventWithTransits {
  const event = getLifeEvent(eventId);
  if (!event || event.conversationId !== conversationId) throw new Error('人生事件不存在');
  if (!event.confirmedByUser) throw new Error('只有用户确认的事件才能生成回溯分析');
  return event;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 事件回溯不是合法 JSON');
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (!isObject(parsed)) throw new Error('AI 事件回溯结构错误');
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === 'AI 事件回溯结构错误') throw error;
    throw new Error('AI 事件回溯 JSON 解析失败');
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
