import type { ChatMessage } from '@/lib/ai/deepseek';
import { ZIWEI_SYSTEM_PROMPT } from '@/lib/ai/ziwei-context';
import type {
  ConversationMessage,
  ConversationSummary,
  MemoryItem,
} from '@/lib/conversations/types';
import {
  listActiveMemories,
  retrieveOlderMessages,
  type RetrievedMessage,
} from '@/lib/db/context';
import {
  getCompletedMessagesBefore,
  getConversation,
  getMessage,
} from '@/lib/db/conversations';
import { listLifeEvents } from '@/lib/db/events';
import {
  LIFE_EVENT_CATEGORY_LABELS,
  type LifeEventCategory,
  type LifeEventWithTransits,
} from '@/lib/events/types';
import { buildCompactChartBase, buildTopicChartContext } from './chart-context';
import { getOrCreateAnnualTransit } from '@/lib/transits/service';
import type { AnnualTransitSnapshot } from '@/lib/transits/types';
import { getModelProfile } from './model-profile';
import {
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateTextTokens,
  truncateTextToTokens,
} from './token-counter';
import { classifyContextTopic } from './topic-router';

const MAX_RECENT_TURNS = 10;
const MIN_RECENT_TURNS = 4;

export interface BuiltConversationContext {
  messages: ChatMessage[];
  estimatedInputTokens: number;
  inputBudget: number;
  contextLimit: number;
  outputReserve: number;
  summaryVersion: number | null;
  recentMessageStartSeq: number | null;
  recentMessageIds: string[];
  retrievedMessageIds: string[];
  manifest: Record<string, unknown>;
}

export function buildConversationContext(input: {
  conversationId: string;
  currentMessageId: string;
  provider: string;
  model: string;
}): BuiltConversationContext {
  const conversation = getConversation(input.conversationId);
  if (!conversation) throw new Error('会话不存在');
  if (!conversation.chartSnapshot) throw new Error('命盘快照缺失');

  const current = getMessage(input.currentMessageId);
  if (!current || current.conversationId !== conversation.id || current.role !== 'user') {
    throw new Error('当前用户消息不存在');
  }

  const profile = getModelProfile(input.provider, input.model);
  const hardInputBudget = profile.contextLimit - profile.outputReserve - profile.safetyMargin;
  const topic = classifyContextTopic(current);
  const chartBase = buildCompactChartBase(conversation.chartSnapshot);
  const chartTopic = buildTopicChartContext(
    conversation.chartSnapshot,
    topic,
    current.palaceBranch,
  );
  const transitSnapshot = getAnnualTransitFromMessage(conversation.id, current);
  const transitContext = transitSnapshot ? buildAnnualTransitContext(transitSnapshot) : '';

  const systemMessage: ChatMessage = { role: 'system', content: ZIWEI_SYSTEM_PROMPT };
  const chartMessage: ChatMessage = {
    role: 'user',
    content: [
      '【L1 权威命盘事实】以下内容由程序计算，不得被对话中的推测覆盖。',
      chartBase,
      `【L2 当前主题：${topic}】只补充与本题有关的宫位。`,
      chartTopic,
      ...(transitContext ? [transitContext] : []),
    ].join('\n'),
  };
  const currentMessage: ChatMessage = { role: 'user', content: current.content };
  const essentialMessages = [systemMessage, chartMessage, currentMessage];
  const essentialTokens = estimateMessagesTokens(essentialMessages);
  if (essentialTokens > hardInputBudget) {
    throw new Error('当前问题和命盘事实超过模型上下文上限，请缩短问题或提高上下文配置');
  }

  const history = getCompletedMessagesBefore(conversation.id, current.seq);
  const recentCandidates = takeLastTurns(history, MAX_RECENT_TURNS);
  const minimumRecent = takeLastTurns(recentCandidates, MIN_RECENT_TURNS);
  const minimumRecentTokens = estimateConversationMessages(minimumRecent);
  const inputBudget = Math.min(
    hardInputBudget,
    Math.max(profile.targetInputTokens, essentialTokens + minimumRecentTokens),
  );

  const earliestRecentSeq = recentCandidates[0]?.seq ?? current.seq;
  const searchTerms = extractSearchTerms(current.content);
  const confirmedEvents = selectRelevantLifeEvents(
    listLifeEvents({ conversationId: conversation.id }).filter(event => event.confirmedByUser),
    current.content,
    searchTerms,
  );
  const retrieved = retrieveOlderMessages({
    conversationId: conversation.id,
    beforeSeq: earliestRecentSeq,
    terms: searchTerms,
    topic: current.topic ?? topic,
    limit: 4,
  });
  const memories = selectRelevantMemories(
    listActiveMemories(conversation.id, 50),
    current.content,
    searchTerms,
  );

  const supportBudget = Math.max(inputBudget - essentialTokens - minimumRecentTokens, 0);
  const support = buildSupportContext({
    confirmedEvents,
    memories,
    summary: conversation.summary,
    retrieved,
    maxTokens: supportBudget,
  });
  const supportMessage = support.content
    ? { role: 'user' as const, content: support.content }
    : null;
  const supportTokens = supportMessage ? estimateMessageTokens(supportMessage) : 0;

  const recentBudget = Math.max(inputBudget - essentialTokens - supportTokens, 0);
  const recent = selectRecentWithinBudget(recentCandidates, recentBudget);
  const recentMessages = recent.map(toChatMessage);
  const messages = [
    systemMessage,
    chartMessage,
    ...(supportMessage ? [supportMessage] : []),
    ...recentMessages,
    currentMessage,
  ];
  const estimatedInputTokens = estimateMessagesTokens(messages);

  return {
    messages,
    estimatedInputTokens,
    inputBudget,
    contextLimit: profile.contextLimit,
    outputReserve: profile.outputReserve,
    summaryVersion: conversation.summary ? conversation.summaryVersion : null,
    recentMessageStartSeq: recent[0]?.seq ?? null,
    recentMessageIds: recent.map(message => message.id),
    retrievedMessageIds: support.retrievedIds,
    manifest: {
      version: 'context-v1',
      topic,
      layers: {
        system: { included: true, tokens: estimateMessageTokens(systemMessage) },
        chartBase: { included: true, tokens: estimateTextTokens(chartBase) },
        chartTopic: { included: true, tokens: estimateTextTokens(chartTopic) },
        transit: {
          included: Boolean(transitContext),
          year: transitSnapshot?.selectedYear ?? null,
          tokens: estimateTextTokens(transitContext),
        },
        memories: { count: support.memoryCount, tokens: support.memoryTokens },
        confirmedEvents: {
          count: support.confirmedEventIds.length,
          ids: support.confirmedEventIds,
          tokens: support.confirmedEventTokens,
        },
        summary: { included: support.summaryIncluded, tokens: support.summaryTokens },
        retrieval: { count: support.retrievedIds.length, tokens: support.retrievalTokens },
        recent: { count: recent.length, tokens: estimateConversationMessages(recent) },
        current: { included: true, tokens: estimateMessageTokens(currentMessage) },
      },
      recentMessageIds: recent.map(message => message.id),
      retrievedMessageIds: support.retrievedIds,
      searchTerms,
      hardInputBudget,
      targetInputTokens: profile.targetInputTokens,
      estimatedInputTokens,
    },
  };
}

export function buildFallbackConversationContext(input: {
  conversationId: string;
  currentMessageId: string;
  provider: string;
  model: string;
  reason?: string;
}): BuiltConversationContext {
  const conversation = getConversation(input.conversationId);
  const current = getMessage(input.currentMessageId);
  if (!conversation?.chartSnapshot || !current || current.role !== 'user') {
    throw new Error('无法构建基础上下文');
  }
  const profile = getModelProfile(input.provider, input.model);
  const inputBudget = profile.contextLimit - profile.outputReserve - profile.safetyMargin;
  const system: ChatMessage = { role: 'system', content: ZIWEI_SYSTEM_PROMPT };
  const transitSnapshot = getAnnualTransitFromMessage(conversation.id, current);
  const transitContext = transitSnapshot ? buildAnnualTransitContext(transitSnapshot) : '';
  const searchTerms = extractSearchTerms(current.content);
  const confirmedEvents = selectRelevantLifeEvents(
    listLifeEvents({ conversationId: conversation.id }).filter(event => event.confirmedByUser),
    current.content,
    searchTerms,
  );
  const confirmedEventContext = buildConfirmedEventContext(confirmedEvents);
  const chart: ChatMessage = {
    role: 'user',
    content: [
      `【权威命盘事实】以下内容由程序计算，不得被对话推测覆盖。\n${buildCompactChartBase(conversation.chartSnapshot)}`,
      transitContext,
    ].filter(Boolean).join('\n'),
  };
  const events: ChatMessage | null = confirmedEventContext
    ? { role: 'user', content: confirmedEventContext }
    : null;
  const currentChat: ChatMessage = { role: 'user', content: current.content };
  const history = takeLastTurns(
    getCompletedMessagesBefore(conversation.id, current.seq),
    MIN_RECENT_TURNS,
  );
  const fixedTokens = estimateMessagesTokens([system, chart, ...(events ? [events] : []), currentChat]);
  const recent = selectRecentWithinBudget(history, Math.max(inputBudget - fixedTokens, 0));
  const messages = [system, chart, ...(events ? [events] : []), ...recent.map(toChatMessage), currentChat];
  const estimatedInputTokens = estimateMessagesTokens(messages);
  if (estimatedInputTokens > inputBudget) {
    throw new Error('基础上下文仍超过模型输入上限');
  }
  return {
    messages,
    estimatedInputTokens,
    inputBudget,
    contextLimit: profile.contextLimit,
    outputReserve: profile.outputReserve,
    summaryVersion: null,
    recentMessageStartSeq: recent[0]?.seq ?? null,
    recentMessageIds: recent.map(message => message.id),
    retrievedMessageIds: [],
    manifest: {
      version: 'context-v1-fallback',
      degraded: true,
      fallbackReason: input.reason?.slice(0, 200) || 'context_builder_error',
      layers: {
        system: { included: true },
        chartBase: { included: true },
        transit: { included: Boolean(transitContext), year: transitSnapshot?.selectedYear ?? null },
        confirmedEvents: { count: confirmedEvents.length, ids: confirmedEvents.map(event => event.id) },
        recent: { count: recent.length },
        current: { included: true },
      },
      estimatedInputTokens,
    },
  };
}

function getAnnualTransitFromMessage(
  conversationId: string,
  message: ConversationMessage,
): AnnualTransitSnapshot | null {
  const rawTransit = message.metadata?.transit;
  if (!rawTransit || typeof rawTransit !== 'object') return null;
  const transit = rawTransit as { level?: unknown; targetDate?: unknown };
  if (transit.level !== 'year' || typeof transit.targetDate !== 'string') return null;
  const year = Number.parseInt(transit.targetDate, 10);
  if (!Number.isInteger(year)) return null;
  return getOrCreateAnnualTransit(conversationId, year).snapshot;
}

function buildAnnualTransitContext(snapshot: AnnualTransitSnapshot): string {
  const transformations = snapshot.transformations.map(item => (
    `${item.starName}化${item.type}→${item.natalPalaceName ?? '本命盘未定位'}`
  )).join('；');
  const keyPalaces = snapshot.keyPalaces.map(item => (
    `${item.nativePalaceName}（流年${item.transitPalaceName}）：${item.reasons.join('、')}`
  )).join('；');
  return [
    `【L2.5 ${snapshot.selectedYear} 年确定性运势事实】以下为程序计算结果，不是 AI 推测。`,
    `流年：${snapshot.year.ganZhi}；虚岁：${snapshot.nominalAge}。`,
    `所在大限：${snapshot.decadal.startAge ?? '?'}-${snapshot.decadal.endAge ?? '?'} 岁，落本命${snapshot.decadal.nativePalaceName}。`,
    `流年命宫：落本命${snapshot.flowYear.nativePalaceName}（${BRANCH_LABELS[snapshot.flowYear.palaceBranch] ?? snapshot.flowYear.earthlyBranch}）。`,
    `流年四化：${transformations}。`,
    `重点宫位及依据：${keyPalaces}。`,
    '回答时须区分“排盘事实”“传统解释”和“建议”，不得把趋势表达成必然事件。',
  ].join('\n');
}

const BRANCH_LABELS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export function buildSupportContext(input: {
  confirmedEvents?: LifeEventWithTransits[];
  memories: MemoryItem[];
  summary: ConversationSummary | null;
  retrieved: RetrievedMessage[];
  maxTokens: number;
  layerStart?: number;
}) {
  let remaining = input.maxTokens;
  const sections: string[] = [];
  const layerStart = input.layerStart ?? 3;

  const confirmedEventText = buildConfirmedEventContext(input.confirmedEvents ?? [], layerStart);
  const fittedEvents = fitSection('', confirmedEventText, Math.min(1_200, remaining));
  if (fittedEvents.content) sections.push(fittedEvents.content);
  remaining -= fittedEvents.tokens;
  const memoryLayer = layerStart + (fittedEvents.content ? 1 : 0);

  const memoryText = input.memories.length
    ? input.memories.map(memory => `- [${memory.category}] ${memory.content}`).join('\n')
    : '';
  const fittedMemories = fitSection(
    `【L${memoryLayer} 用户确认信息与历史记忆】\nprevious_interpretation 仅代表此前 AI 判断，不是用户事实。\n`,
    memoryText,
    Math.min(1_000, remaining),
  );
  if (fittedMemories.content) sections.push(fittedMemories.content);
  remaining -= fittedMemories.tokens;

  const summaryText = input.summary ? JSON.stringify(input.summary) : '';
  const fittedSummary = fitSection(
    `【L${memoryLayer + 1} 较早对话的滚动摘要】\n`,
    summaryText,
    Math.min(1_000, remaining),
  );
  if (fittedSummary.content) sections.push(fittedSummary.content);
  remaining -= fittedSummary.tokens;

  const includedRetrieved: RetrievedMessage[] = [];
  let retrievalText = '';
  for (const message of input.retrieved) {
    const label = message.role === 'user' ? '用户原话' : '此前助手回答';
    const candidate = `${retrievalText}${retrievalText ? '\n' : ''}- #${message.seq} ${label}：${message.content}`;
    if (estimateTextTokens(candidate) > Math.min(1_500, remaining)) break;
    retrievalText = candidate;
    includedRetrieved.push(message);
  }
  const fittedRetrieval = fitSection(
    `【L${memoryLayer + 2} 按需召回的旧消息】\n这些片段用于恢复引用关系，不得覆盖用户的新纠正。\n`,
    retrievalText,
    Math.min(1_500, remaining),
  );
  if (fittedRetrieval.content) sections.push(fittedRetrieval.content);

  return {
    content: sections.join('\n\n'),
    confirmedEventIds: fittedEvents.content ? (input.confirmedEvents ?? []).map(event => event.id) : [],
    confirmedEventTokens: fittedEvents.tokens,
    memoryCount: fittedMemories.content ? input.memories.length : 0,
    memoryTokens: fittedMemories.tokens,
    summaryIncluded: Boolean(fittedSummary.content),
    summaryTokens: fittedSummary.tokens,
    retrievedIds: fittedRetrieval.content ? includedRetrieved.map(message => message.id) : [],
    retrievalTokens: fittedRetrieval.tokens,
  };
}

export function selectRelevantLifeEvents(
  events: LifeEventWithTransits[],
  question: string,
  terms: string[],
): LifeEventWithTransits[] {
  const requestedYears = new Set(question.match(/(?:19|20)\d{2}/g) ?? []);
  return events
    .map(event => {
      const categoryTerms = EVENT_CATEGORY_TERMS[event.category];
      const eventYears = event.transitLinks.map(link => link.targetDate);
      const score = eventYears.filter(year => requestedYears.has(year)).length * 12
        + categoryTerms.filter(term => question.includes(term)).length * 5
        + terms.filter(term => `${event.title}${event.description ?? ''}`.includes(term)).length * 4
        + (question.includes(event.title.slice(0, 8)) ? 3 : 0);
      return { event, score };
    })
    .sort((a, b) => b.score - a.score || b.event.updatedAt - a.event.updatedAt)
    .slice(0, 8)
    .map(item => item.event);
}

function buildConfirmedEventContext(events: LifeEventWithTransits[], layer = 3): string {
  if (!events.length) return '';
  const lines = events.map(event => {
    const date = event.datePrecision === 'unknown'
      ? '日期不详'
      : event.datePrecision === 'range'
        ? `${event.startDate}至${event.endDate}`
        : event.startDate;
    const category = event.category === 'custom'
      ? event.customCategory ?? '自定义事件'
      : LIFE_EVENT_CATEGORY_LABELS[event.category];
    return `- [${event.id}] ${date} · ${category} · ${event.title}${event.description ? `：${event.description.slice(0, 240)}` : ''}`;
  });
  return `【L${layer} 用户已确认人生事件】\n以下记录来自正式事件表，可以作为现实事实；不得把未确认候选、助手推断或命理解释补写为新事件。\n${lines.join('\n')}`;
}

const EVENT_CATEGORY_TERMS: Record<LifeEventCategory, string[]> = {
  education: ['学业', '学习', '考试', '毕业', '升学'],
  career: ['工作', '事业', '入职', '离职', '跳槽', '创业', '晋升'],
  finance: ['财务', '财运', '收入', '投资', '亏损', '买房'],
  relationship: ['感情', '婚姻', '恋爱', '结婚', '离婚', '分手'],
  children: ['孩子', '子女', '生育', '怀孕'],
  relocation: ['搬家', '迁居', '出国', '城市'],
  family: ['家庭', '父母', '亲人'],
  health: ['健康', '手术', '住院', '确诊', '康复'],
  achievement: ['成果', '获奖', '荣誉', '晋级'],
  custom: [],
};

function fitSection(prefix: string, content: string, budget: number) {
  if (!content || budget <= estimateTextTokens(prefix) + 4) return { content: '', tokens: 0 };
  const fitted = `${prefix}${truncateTextToTokens(content, budget - estimateTextTokens(prefix))}`;
  return { content: fitted, tokens: estimateTextTokens(fitted) + 6 };
}

export function selectRecentWithinBudget(
  messages: ConversationMessage[],
  budget: number,
): ConversationMessage[] {
  const turns = groupTurns(messages);
  const selected: ConversationMessage[][] = [];
  let used = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const turnTokens = estimateConversationMessages(turn);
    if (used + turnTokens > budget) break;
    selected.unshift(turn);
    used += turnTokens;
  }
  return selected.flat();
}

export function takeLastTurns(messages: ConversationMessage[], count: number): ConversationMessage[] {
  return groupTurns(messages).slice(-count).flat();
}

function groupTurns(messages: ConversationMessage[]): ConversationMessage[][] {
  const turns: ConversationMessage[][] = [];
  for (const message of messages) {
    if (message.role === 'user' || turns.length === 0) turns.push([message]);
    else turns[turns.length - 1].push(message);
  }
  return turns;
}

export function estimateConversationMessages(messages: ConversationMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(toChatMessage(message)), 0);
}

export function toChatMessage(message: ConversationMessage): ChatMessage {
  return {
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content,
  };
}

export function selectRelevantMemories(
  memories: MemoryItem[],
  question: string,
  terms: string[],
): MemoryItem[] {
  return memories
    .map(memory => ({
      memory,
      score: memoryPriority(memory)
        + terms.filter(term => memory.content.includes(term)).length * 5
        + (question.includes(memory.content.slice(0, 8)) ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt)
    .slice(0, 16)
    .map(item => item.memory);
}

function memoryPriority(memory: MemoryItem): number {
  switch (memory.category) {
    case 'correction': return 10;
    case 'user_fact': return 9;
    case 'confirmed_event': return 8;
    case 'user_preference': return 7;
    case 'open_question': return 5;
    case 'previous_interpretation': return 2;
  }
}

export function extractSearchTerms(text: string): string[] {
  const terms = new Set<string>();
  text.match(/(?:19|20)\d{2}年?/g)?.forEach(value => terms.add(value.replace(/年$/, '')));
  const domainTerms = [
    '工作', '事业', '跳槽', '创业', '感情', '婚姻', '对象', '财运', '投资',
    '健康', '父母', '子女', '考试', '学习', '流年', '大限', '搬家', '手术',
  ];
  domainTerms.filter(term => text.includes(term)).forEach(term => terms.add(term));
  text
    .replace(/(?:之前|以前|上次|刚才|提到|说过|关于|请问|分析|看看|如何|什么|是否|可以|我的|我想|一下)/g, ' ')
    .split(/[\s，。！？、,.!?：:；;“”"'（）()]+/)
    .filter(value => value.length >= 2 && value.length <= 12)
    .slice(0, 4)
    .forEach(value => terms.add(value));
  return [...terms].slice(0, 8);
}
