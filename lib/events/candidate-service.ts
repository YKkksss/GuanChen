import { createHash } from 'node:crypto';
import { createChatCompletion, type ChatMessage } from '@/lib/ai/deepseek';
import {
  completeLifeEventExtractionRun,
  createLifeEventExtractionRun,
  dismissLifeEventCandidate,
  getLifeEventCandidate,
  getLifeEventExtractionRun,
  insertLifeEventCandidate,
  listLifeEventCandidates,
  markLifeEventCandidateConfirmed,
} from '@/lib/db/event-candidates';
import { getConversation, getMessage } from '@/lib/db/conversations';
import { getDatabase } from '@/lib/db/client';
import { getLifeEvent } from '@/lib/db/events';
import { upsertMemoryItem } from '@/lib/db/context';
import { createLifeEventWithTransits, getEventYears } from './service';
import {
  LIFE_EVENT_CATEGORY_LABELS,
  type LifeEventCandidate,
  type LifeEventCandidateDraft,
  type LifeEventInput,
  type LifeEventWithTransits,
} from './types';
import { parseLifeEventInput } from './validation';

export const LIFE_EVENT_EXTRACTOR_VERSION = 'life-event-candidate-extractor-v1';
const MIN_CONFIDENCE = 0.6;

type Completion = (
  messages: ChatMessage[],
  options: { temperature: number; maxTokens: number },
) => Promise<{ content: string }>;

export async function extractLifeEventCandidates(input: {
  conversationId: string;
  sourceMessageId: string;
  completion?: Completion;
}): Promise<{
  status: 'completed' | 'skipped' | 'failed';
  candidates: LifeEventCandidate[];
  reused: boolean;
}> {
  const conversation = getConversation(input.conversationId);
  const source = getMessage(input.sourceMessageId);
  if (!conversation || conversation.type !== 'chart' || !conversation.birthInfo) throw new Error('仅单人命盘会话支持人生事件候选提取');
  if (!source || source.conversationId !== conversation.id || source.role !== 'user' || source.source !== 'question') {
    throw new Error('候选事件只能从当前会话的用户主动提问中提取');
  }
  const existingRun = getLifeEventExtractionRun(source.id, LIFE_EVENT_EXTRACTOR_VERSION);
  if (existingRun && existingRun.status !== 'failed') {
    return {
      status: existingRun.status === 'running' ? 'completed' : existingRun.status,
      candidates: listLifeEventCandidates({ conversationId: conversation.id, sourceMessageId: source.id }),
      reused: true,
    };
  }
  const run = createLifeEventExtractionRun({
    conversationId: conversation.id,
    sourceMessageId: source.id,
    extractorVersion: LIFE_EVENT_EXTRACTOR_VERSION,
  });
  if (!shouldAttemptLifeEventExtraction(source.content)) {
    completeLifeEventExtractionRun({ id: run.id, status: 'skipped' });
    return { status: 'skipped', candidates: [], reused: false };
  }

  try {
    const complete = input.completion ?? createChatCompletion;
    const today = new Date().toISOString().slice(0, 10);
    const response = await complete(buildExtractionPrompt({
      message: source.content,
      birthYear: conversation.birthInfo.year,
      today,
    }), { temperature: 0, maxTokens: 1_000 });
    const drafts = parseLifeEventCandidateExtraction({
      content: response.content,
      sourceMessage: source.content,
      birthYear: conversation.birthInfo.year,
      currentYear: Number(today.slice(0, 4)),
    });
    const candidates = drafts.map(draft => insertLifeEventCandidate({
      runId: run.id,
      conversationId: conversation.id,
      sourceMessageId: source.id,
      candidateKey: fingerprintCandidate(draft),
      extractionVersion: LIFE_EVENT_EXTRACTOR_VERSION,
      draft,
    }));
    completeLifeEventExtractionRun({ id: run.id, status: 'completed', candidateCount: candidates.length });
    return { status: 'completed', candidates, reused: false };
  } catch (error) {
    completeLifeEventExtractionRun({
      id: run.id,
      status: 'failed',
      errorCode: error instanceof Error ? error.message.slice(0, 200) : 'candidate_extraction_failed',
    });
    throw error;
  }
}

export function confirmLifeEventCandidate(input: {
  conversationId: string;
  candidateId: string;
  event: Record<string, unknown>;
}): { candidate: LifeEventCandidate; event: LifeEventWithTransits } {
  const candidate = getLifeEventCandidate(input.candidateId);
  if (!candidate || candidate.conversationId !== input.conversationId) throw new Error('人生事件候选不存在');
  if (candidate.status === 'dismissed') throw new Error('已忽略的候选不能直接确认');
  if (candidate.status === 'confirmed' && candidate.confirmedEventId) {
    const existing = getLifeEvent(candidate.confirmedEventId);
    if (existing) return { candidate, event: existing };
  }
  const parsed = parseLifeEventInput(input.event);
  const confirmedInput: LifeEventInput = {
    ...parsed,
    source: 'conversation_extracted',
    sourceMessageId: candidate.sourceMessageId,
    confirmedByUser: true,
  };
  const transaction = getDatabase().transaction(() => {
    const event = createLifeEventWithTransits(input.conversationId, confirmedInput);
    const confirmed = markLifeEventCandidateConfirmed(candidate.id, event.id);
    if (!confirmed || confirmed.status !== 'confirmed') throw new Error('候选状态已变化，请刷新后重试');
    upsertMemoryItem({
      conversationId: input.conversationId,
      category: 'confirmed_event',
      content: formatConfirmedEventMemory(event),
      normalizedKey: `confirmed_life_event:${event.id}`,
      sourceMessageId: candidate.sourceMessageId,
      confidence: 1,
    });
    return { candidate: confirmed, event };
  });
  return transaction();
}

export function dismissCandidate(input: {
  conversationId: string;
  candidateId: string;
}): LifeEventCandidate {
  const candidate = getLifeEventCandidate(input.candidateId);
  if (!candidate || candidate.conversationId !== input.conversationId) throw new Error('人生事件候选不存在');
  if (candidate.status === 'confirmed') throw new Error('已确认候选不能忽略，请到人生事件时间轴编辑或删除正式事件');
  const dismissed = dismissLifeEventCandidate(candidate.id, input.conversationId);
  if (!dismissed) throw new Error('候选状态更新失败');
  return dismissed;
}

export function shouldAttemptLifeEventExtraction(text: string): boolean {
  if (text.length < 6) return false;
  if (/(?:会不会|是否会|能不能|将来|未来|预计|计划|打算|希望).{0,18}(?:工作|入职|离职|跳槽|创业|结婚|离婚|生育|搬家|手术|住院|获奖)/.test(text)
    && !/(?:曾经|已经|当时|那年|之前|以前|经历|发生|做过|换过|搬过)/.test(text)) return false;
  const hasPersonalPast = /(?:我|本人|我们家|家里).{0,20}(?:曾经|已经|当时|那年|之前|以前|经历|发生|做过|换过|搬过|考上|毕业|入职|离职|结婚|离婚|生了|手术|住院|创业|破产|获奖)/.test(text)
    || /(?:19|20)\d{2}年|去年|前年|上个月|去年\d{1,2}月/.test(text);
  const hasEventDomain = /(?:毕业|升学|考试|工作|入职|离职|跳槽|创业|公司|投资|亏损|买房|卖房|结婚|离婚|恋爱|分手|孩子|生育|怀孕|搬家|迁居|出国|家庭|父母|亲人|手术|住院|确诊|康复|获奖|晋升)/.test(text);
  return hasPersonalPast && hasEventDomain;
}

export function parseLifeEventCandidateExtraction(input: {
  content: string;
  sourceMessage: string;
  birthYear: number;
  currentYear: number;
}): LifeEventCandidateDraft[] {
  const parsed = parseJsonObject(input.content);
  if (!Array.isArray(parsed.candidates)) return [];
  const drafts: LifeEventCandidateDraft[] = [];
  for (const raw of parsed.candidates.slice(0, 5)) {
    if (!raw || typeof raw !== 'object') continue;
    const value = raw as Record<string, unknown>;
    const confidence = typeof value.confidence === 'number'
      ? Math.min(Math.max(value.confidence, 0), 1)
      : 0;
    if (confidence < MIN_CONFIDENCE) continue;
    try {
      const event = parseLifeEventInput({
        title: value.title,
        category: value.category,
        customCategory: value.customCategory,
        startDate: value.startDate,
        endDate: value.endDate,
        datePrecision: value.datePrecision,
        description: value.description,
        impactLevel: value.impactLevel ?? 3,
      });
      const years = getEventYears(event);
      if (years.some(year => year < input.birthYear || year > input.currentYear)) continue;
      const rawExcerpt = typeof value.sourceExcerpt === 'string' ? value.sourceExcerpt.trim().slice(0, 300) : '';
      const exactExcerpt = rawExcerpt && input.sourceMessage.includes(rawExcerpt);
      const reviewNotes = Array.isArray(value.reviewNotes)
        ? value.reviewNotes.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
          .map(item => item.trim().slice(0, 120)).slice(0, 4)
        : [];
      if (!exactExcerpt) reviewNotes.push('来源片段未能逐字对齐，请重点核对候选内容');
      if (event.datePrecision === 'unknown') reviewNotes.push('事件日期不明确');
      if (confidence < 0.8) reviewNotes.push('模型置信度较低');
      drafts.push({
        title: event.title,
        category: event.category,
        customCategory: event.customCategory ?? null,
        startDate: event.startDate,
        endDate: event.endDate ?? null,
        datePrecision: event.datePrecision,
        description: event.description ?? null,
        impactLevel: event.impactLevel,
        confidence,
        sourceExcerpt: exactExcerpt ? rawExcerpt : input.sourceMessage.slice(0, 300),
        reviewNotes: [...new Set(reviewNotes)],
      });
    } catch {
      // 单个候选不符合事件字段和日期契约时直接丢弃，不影响其他候选。
    }
  }
  return deduplicateDrafts(drafts);
}

function buildExtractionPrompt(input: { message: string; birthYear: number; today: string }): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是人生事件候选提取器，只从用户当前原话中识别已经真实发生、且用户明确陈述的个人经历。
输出严格 JSON：{"candidates":[]}，不要解释，不要 Markdown。
每项字段：title、category、customCategory、startDate、endDate、datePrecision、description、impactLevel、confidence、sourceExcerpt、reviewNotes。
category 只能是 education、career、finance、relationship、children、relocation、family、health、achievement、custom。
datePrecision 只能是 day、month、year、range、unknown；未知日期时 startDate 为空字符串；范围必须有完整起止日。
sourceExcerpt 必须逐字复制能支持该候选的用户原话。impactLevel 没有明确依据时固定为 3。
禁止提取：问题、假设、未来计划、愿望、命理推断、助手观点、他人经历、仅出现年份但没有明确事实、尚未发生的预测。
一句话描述同一经历时只生成一个候选，最多 5 个。无法确定时返回空数组。`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        current_date: input.today,
        user_birth_year: input.birthYear,
        user_message: input.message,
      }),
    },
  ];
}

function parseJsonObject(content: string): Record<string, unknown> {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  const candidate = fenced ?? (start >= 0 && end > start ? content.slice(start, end + 1) : '');
  const parsed = JSON.parse(candidate);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('候选提取器未返回 JSON 对象');
  return parsed as Record<string, unknown>;
}

function fingerprintCandidate(draft: LifeEventCandidateDraft): string {
  return createHash('sha256').update(JSON.stringify({
    title: draft.title,
    category: draft.category,
    startDate: draft.startDate,
    endDate: draft.endDate,
    datePrecision: draft.datePrecision,
    sourceExcerpt: draft.sourceExcerpt,
  })).digest('hex');
}

function deduplicateDrafts(drafts: LifeEventCandidateDraft[]): LifeEventCandidateDraft[] {
  return [...new Map(drafts.map(item => [fingerprintCandidate(item), item])).values()];
}

function formatConfirmedEventMemory(event: LifeEventWithTransits): string {
  const date = event.datePrecision === 'unknown'
    ? '日期不详'
    : event.datePrecision === 'range'
      ? `${event.startDate}至${event.endDate}`
      : event.startDate;
  const category = event.category === 'custom'
    ? event.customCategory ?? '自定义事件'
    : LIFE_EVENT_CATEGORY_LABELS[event.category];
  return `用户已确认人生事件：${date}，${category}，${event.title}${event.description ? `；${event.description}` : ''}`.slice(0, 1_000);
}
