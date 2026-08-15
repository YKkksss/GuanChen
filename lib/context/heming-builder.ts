import type { ChatMessage } from '@/lib/ai/deepseek';
import { getRelationshipDefinition } from '@/lib/heming/methodology';
import { evaluateHemingConversation } from '@/lib/heming/service';
import type {
  HemingEvaluationResult,
  HemingPalaceFact,
  HemingRelationshipContext,
  PalaceName,
} from '@/lib/heming/types';
import { listActiveMemories, retrieveOlderMessages } from '@/lib/db/context';
import {
  getCompletedMessagesBefore,
  getConversation,
  getMessage,
} from '@/lib/db/conversations';
import {
  buildSupportContext,
  estimateConversationMessages,
  extractSearchTerms,
  selectRecentWithinBudget,
  selectRelevantMemories,
  takeLastTurns,
  toChatMessage,
  type BuiltConversationContext,
} from './builder';
import { getModelProfile } from './model-profile';
import {
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateTextTokens,
  truncateTextToTokens,
} from './token-counter';

const MAX_RECENT_TURNS = 10;
const MIN_RECENT_TURNS = 4;

export const HEMING_SYSTEM_PROMPT = `你是中文紫微斗数关系分析助手。你只能解释程序提供的双命盘事实和规则结果。
硬性规则：
1. 永远保持甲方 A、乙方 B 身份隔离，不得交换、合并或补造任何一方事实。
2. 规则结果是权威互动观察，不得修改其级别、置信度、规则编号和证据归属。
3. 只使用项目三合派允许事实；禁止宫干自化、跨盘飞化、来因宫和模型自行补算。
4. 结构对应不等于吉，结构差异不等于凶；不得输出单一匹配分数。
5. 现实经历只有用户明确确认后才能引用，不得把命理解释写成已发生事实。
6. 本命基线和当前大限阶段必须分层表达，不得相互覆盖。
7. 不作婚姻、合作、财务、医疗等重大决定，不使用绝对化或恐吓性措辞。
8. 使用中文回答，并在重要结论后标注相关规则编号或证据编号。`;

export function buildHemingConversationContext(input: {
  conversationId: string;
  currentMessageId: string;
  provider: string;
  model: string;
}): BuiltConversationContext {
  const conversation = getConversation(input.conversationId);
  if (!conversation || conversation.type !== 'heming') throw new Error('合盘会话不存在');
  if (!conversation.chartSnapshotA || !conversation.chartSnapshotB || !conversation.relationshipType) {
    throw new Error('双命盘快照或关系类型缺失');
  }
  const current = getMessage(input.currentMessageId);
  if (!current || current.conversationId !== conversation.id || current.role !== 'user') {
    throw new Error('当前用户消息不存在');
  }

  const profile = getModelProfile(input.provider, input.model);
  const hardInputBudget = profile.contextLimit - profile.outputReserve - profile.safetyMargin;
  const evaluation = evaluateHemingConversation(conversation.id);
  const authorityText = buildHemingAuthorityContext(evaluation, conversation.relationshipContext);
  const systemMessage: ChatMessage = { role: 'system', content: HEMING_SYSTEM_PROMPT };
  const authorityMessage: ChatMessage = { role: 'user', content: authorityText };
  const currentMessage: ChatMessage = { role: 'user', content: current.content };
  const essentialMessages = [systemMessage, authorityMessage, currentMessage];
  const essentialTokens = estimateMessagesTokens(essentialMessages);
  if (essentialTokens > hardInputBudget) {
    throw new Error('当前问题和双命盘权威事实超过模型上下文上限');
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
  const retrieved = retrieveOlderMessages({
    conversationId: conversation.id,
    beforeSeq: earliestRecentSeq,
    terms: searchTerms,
    topic: current.topic ?? 'heming',
    limit: 4,
  });
  const memories = selectRelevantMemories(
    listActiveMemories(conversation.id, 50),
    current.content,
    searchTerms,
  );
  const supportBudget = Math.max(inputBudget - essentialTokens - minimumRecentTokens, 0);
  const support = buildSupportContext({
    memories,
    summary: conversation.summary,
    retrieved,
    maxTokens: supportBudget,
    layerStart: 4,
  });
  const supportMessage = support.content
    ? { role: 'user' as const, content: support.content }
    : null;
  const supportTokens = supportMessage ? estimateMessageTokens(supportMessage) : 0;
  const recentBudget = Math.max(inputBudget - essentialTokens - supportTokens, 0);
  const recent = selectRecentWithinBudget(recentCandidates, recentBudget);
  const messages = [
    systemMessage,
    authorityMessage,
    ...(supportMessage ? [supportMessage] : []),
    ...recent.map(toChatMessage),
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
      version: 'heming-context-v1',
      conversationType: 'heming',
      relationshipType: conversation.relationshipType,
      methodologyVersion: evaluation.methodologyVersion,
      chartEngineVersion: evaluation.chartEngineVersion,
      layers: {
        system: { included: true, tokens: estimateMessageTokens(systemMessage) },
        chartA: { included: true, palaceCount: countAuthorityPalaces(evaluation, 'A') },
        chartB: { included: true, palaceCount: countAuthorityPalaces(evaluation, 'B') },
        rules: { count: evaluation.matchedRules.length, evidenceCount: evaluation.evidence.length },
        realityContext: { included: Boolean(conversation.relationshipContext) },
        memories: { count: support.memoryCount, tokens: support.memoryTokens },
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

export function buildFallbackHemingConversationContext(input: {
  conversationId: string;
  currentMessageId: string;
  provider: string;
  model: string;
  reason?: string;
}): BuiltConversationContext {
  const conversation = getConversation(input.conversationId);
  const current = getMessage(input.currentMessageId);
  if (!conversation || conversation.type !== 'heming' || !current || current.role !== 'user') {
    throw new Error('无法构建基础合盘上下文');
  }
  const evaluation = evaluateHemingConversation(conversation.id);
  const profile = getModelProfile(input.provider, input.model);
  const inputBudget = profile.contextLimit - profile.outputReserve - profile.safetyMargin;
  const system: ChatMessage = { role: 'system', content: HEMING_SYSTEM_PROMPT };
  const compactAuthority = truncateTextToTokens(
    buildHemingAuthorityContext(evaluation, conversation.relationshipContext),
    Math.max(Math.floor(inputBudget * 0.55), 1_000),
  );
  const authority: ChatMessage = { role: 'user', content: compactAuthority };
  const currentChat: ChatMessage = { role: 'user', content: current.content };
  const history = takeLastTurns(
    getCompletedMessagesBefore(conversation.id, current.seq),
    MIN_RECENT_TURNS,
  );
  const fixedTokens = estimateMessagesTokens([system, authority, currentChat]);
  const recent = selectRecentWithinBudget(history, Math.max(inputBudget - fixedTokens, 0));
  const messages = [system, authority, ...recent.map(toChatMessage), currentChat];
  const estimatedInputTokens = estimateMessagesTokens(messages);
  if (estimatedInputTokens > inputBudget) throw new Error('基础合盘上下文仍超过模型输入上限');

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
      version: 'heming-context-v1-fallback',
      conversationType: 'heming',
      degraded: true,
      fallbackReason: input.reason?.slice(0, 200) || 'context_builder_error',
      methodologyVersion: evaluation.methodologyVersion,
      layers: {
        system: { included: true },
        authority: { included: true },
        recent: { count: recent.length },
        current: { included: true },
      },
      estimatedInputTokens,
    },
  };
}

function buildHemingAuthorityContext(
  evaluation: HemingEvaluationResult,
  relationshipContext: HemingRelationshipContext | null,
): string {
  const definition = getRelationshipDefinition(evaluation.relationshipType);
  const palaceNamesA = uniquePalaces(definition.dimensions.flatMap(item => item.ownerAPalaces));
  const palaceNamesB = uniquePalaces(definition.dimensions.flatMap(item => item.ownerBPalaces));
  const facts = {
    methodologyVersion: evaluation.methodologyVersion,
    chartEngineVersion: evaluation.chartEngineVersion,
    relationship: {
      type: evaluation.relationshipType,
      label: definition.label,
      roles: evaluation.roles,
    },
    chartA: compactOwnerFacts(evaluation, 'A', palaceNamesA),
    chartB: compactOwnerFacts(evaluation, 'B', palaceNamesB),
  };
  const ruleResults = evaluation.matchedRules.map(result => ({
    ruleId: result.ruleId,
    dimensionId: result.dimensionId,
    phase: result.phase,
    level: result.level,
    confidence: result.confidence,
    degradedByRuleIds: result.degradedByRuleIds,
    conclusion: result.conclusion,
    advice: result.advice,
    evidenceIds: result.evidenceIds,
  }));
  const evidence = evaluation.evidence.map(item => ({
    id: item.id,
    owner: item.owner,
    source: item.source,
    label: item.label,
    palace: item.palace,
    stars: item.stars,
    siHua: item.siHua,
  }));
  const reality = relationshipContext ? {
    ownerARole: relationshipContext.ownerARole,
    ownerBRole: relationshipContext.ownerBRole,
    customRelationshipLabel: relationshipContext.customRelationshipLabel,
    mainConcern: relationshipContext.mainConcern,
    confirmedFacts: relationshipContext.confirmedFacts,
  } : null;

  return [
    '【L1 权威双命盘事实】以下由程序计算，甲乙字段不得交换或被对话覆盖。',
    JSON.stringify(facts),
    '【L2 权威规则引擎结果】只能解释，不得修改；不存在结果的维度应说明证据不足。',
    JSON.stringify({ results: ruleResults, evidence, suppressedRules: evaluation.suppressedRules, warnings: evaluation.warnings }),
    '【L3 用户确认的现实关系背景】空字段代表未知，禁止自行补全。',
    JSON.stringify(reality),
  ].join('\n');
}

function compactOwnerFacts(
  evaluation: HemingEvaluationResult,
  owner: 'A' | 'B',
  palaceNames: PalaceName[],
) {
  const ownerFacts = evaluation.facts[owner];
  return {
    owner,
    role: evaluation.roles[owner],
    birthTimeKnown: ownerFacts.birthTimeKnown,
    currentStage: ownerFacts.currentStage,
    palaces: palaceNames.map(name => compactPalace(ownerFacts.palaces[name])),
  };
}

function compactPalace(palace: HemingPalaceFact) {
  return {
    palace: palace.palace,
    branch: palace.branch,
    isEmpty: palace.isEmpty,
    stars: palace.stars.map(star => ({
      name: star.name,
      type: star.type,
      siHua: star.siHua,
      brightness: star.brightness,
    })),
  };
}

function uniquePalaces(palaces: PalaceName[]): PalaceName[] {
  return [...new Set(palaces)];
}

function countAuthorityPalaces(evaluation: HemingEvaluationResult, owner: 'A' | 'B'): number {
  const definition = getRelationshipDefinition(evaluation.relationshipType);
  return uniquePalaces(definition.dimensions.flatMap(item => (
    owner === 'A' ? item.ownerAPalaces : item.ownerBPalaces
  ))).length;
}
