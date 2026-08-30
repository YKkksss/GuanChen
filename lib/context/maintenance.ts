import { createChatCompletion, type ChatMessage } from '@/lib/ai/deepseek';
import type {
  ConversationMessage,
  ConversationSummary,
  MemoryCategory,
} from '@/lib/conversations/types';
import {
  listActiveMemories,
  replaceConversationMemories,
  resetConversationSummary,
  restoreConversationSummary,
  updateConversationSummary,
  upsertMemoryItem,
} from '@/lib/db/context';
import {
  getCompletedMessagesBefore,
  getConversation,
  getMessage,
} from '@/lib/db/conversations';
import { estimateTextTokens } from './token-counter';

const EMPTY_SUMMARY: ConversationSummary = {
  user_context: [],
  confirmed_events: [],
  topics_discussed: [],
  previous_conclusions: [],
  corrections: [],
  open_questions: [],
  user_preferences: [],
  disputed_or_uncertain: [],
  do_not_assume: [],
};

export async function maintainConversationContext(input: {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
}): Promise<void> {
  try {
    await updateMemories(input.conversationId, input.userMessageId, input.assistantMessageId);
  } catch (error) {
    console.warn('上下文记忆提取失败，已降级为保留原始历史：', error);
  }

  try {
    await updateRollingSummary(input.conversationId);
  } catch (error) {
    console.warn('滚动摘要更新失败，已保留旧摘要：', error);
  }
}

export async function updateRollingSummary(
  conversationId: string,
  options: { force?: boolean } = {},
): Promise<boolean> {
  const conversation = getConversation(conversationId);
  if (!conversation) return false;

  const allCompleted = getCompletedMessagesBefore(conversationId, Number.MAX_SAFE_INTEGER);
  const unsummarized = allCompleted.filter(message => message.seq > conversation.summaryThroughSeq);
  const unsummarizedTurns = groupTurns(unsummarized);
  if (!options.force && unsummarizedTurns.length <= 12 && estimateMessages(unsummarized) <= 6_000) return false;

  const protectedStartSeq = unsummarizedTurns.slice(-6)[0]?.[0]?.seq ?? Number.MAX_SAFE_INTEGER;
  const candidates = takeSummaryBatch(
    unsummarized.filter(message => message.seq < protectedStartSeq),
    7_000,
  );
  if (!candidates.length) return false;
  const throughSeq = candidates[candidates.length - 1].seq;

  const result = await createChatCompletion(buildSummaryPrompt(
    conversation.summary,
    candidates,
    conversation.type === 'heming',
  ), {
    temperature: 0,
    maxTokens: 1_200,
  });
  const summary = parseSummary(result.content);
  updateConversationSummary({ conversationId, summary, throughSeq });
  return true;
}

export async function rebuildConversationSummary(conversationId: string): Promise<number> {
  const previous = getConversation(conversationId);
  if (!previous) throw new Error('会话不存在');
  resetConversationSummary(conversationId);
  try {
    let batches = 0;
    while (batches < 50 && await updateRollingSummary(conversationId, { force: true })) {
      batches += 1;
    }
    return batches;
  } catch (error) {
    restoreConversationSummary({
      conversationId,
      summary: previous.summary,
      throughSeq: previous.summaryThroughSeq,
      updatedAt: previous.summaryUpdatedAt,
    });
    throw error;
  }
}

export async function updateMemories(
  conversationId: string,
  userMessageId: string,
  assistantMessageId: string,
): Promise<number> {
  const conversation = getConversation(conversationId);
  const user = getMessage(userMessageId);
  const assistant = getMessage(assistantMessageId);
  if (!user || !assistant || assistant.status !== 'completed') return 0;
  if (!shouldExtractMemories(user.content)) return 0;

  const active = listActiveMemories(conversationId, 40);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是对话记忆提取器。只提取用户明确陈述的长期有用信息，输出严格 JSON，不要解释。
允许分类：user_fact、user_preference、correction、open_question。
禁止输出 confirmed_event；用户提到的既往经历也必须先走独立候选确认流程，不能改写成 user_fact 绕过确认。
禁止把助手推断、命理结论或不确定猜测写成用户事实。没有合适信息时输出 {"items":[]}。
每项格式：{"category":"user_fact","content":"简洁中文事实","normalized_key":"稳定键","confidence":0.95}。
${conversation?.type === 'heming' ? '这是双人合盘对话：每条人物事实必须明确写“甲方”或“乙方”，互动事实写“双方互动”；无法确认归属时不要提取，绝不能把一方事实复制给另一方。' : ''}`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        active_memories: active.map(memory => ({
          category: memory.category,
          content: memory.content,
          normalized_key: memory.normalizedKey,
        })),
        current_user_message: user.content,
        assistant_answer_for_reference_only: assistant.content.slice(0, 2_000),
      }),
    },
  ];
  const result = await createChatCompletion(messages, { temperature: 0, maxTokens: 700 });
  const items = parseMemoryItems(result.content);
  for (const item of items) {
    upsertMemoryItem({
      conversationId,
      category: item.category,
      content: item.content,
      normalizedKey: item.normalized_key,
      sourceMessageId: userMessageId,
      confidence: item.confidence,
    });
  }
  return items.length;
}

export async function rebuildConversationMemories(conversationId: string): Promise<{
  batches: number;
  memories: number;
}> {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new Error('会话不存在');
  const userMessages = getCompletedMessagesBefore(conversationId, Number.MAX_SAFE_INTEGER)
    .filter(message => message.role === 'user' && message.source === 'question');
  if (!userMessages.length) {
    return { batches: 0, memories: replaceConversationMemories(conversationId, []) };
  }

  const batches = splitMessageBatches(userMessages, 6_000);
  const extracted: ReturnType<typeof parseMemoryItems> = [];
  for (const batch of batches) {
    const result = await createChatCompletion([
      {
        role: 'system',
        content: `你是历史对话记忆提取器。只从用户原话提取长期有用的信息，输出严格 JSON：{"items":[]}。
允许分类：user_fact、user_preference、correction、open_question。禁止输出 confirmed_event；人生事件必须经过独立候选确认流程，也不能改写成 user_fact。
每项格式：{"category":"user_fact","content":"简洁中文事实","normalized_key":"稳定键","confidence":0.95}。
禁止把问题中的假设、命理结论或助手观点写成事实；相互冲突时保留用户较新的明确纠正。每批最多输出 20 项。
${conversation.type === 'heming' ? '这是双人合盘对话：每条人物事实必须明确写“甲方”或“乙方”，互动事实写“双方互动”；无法确认归属时不要提取，绝不能串用双方事实。' : ''}`,
      },
      {
        role: 'user',
        content: JSON.stringify(batch.map(message => ({ seq: message.seq, content: message.content }))),
      },
    ], { temperature: 0, maxTokens: 1_200 });
    extracted.push(...parseMemoryItems(result.content));
  }

  const memories = replaceConversationMemories(
    conversationId,
    extracted.map(item => ({
      category: item.category,
      content: item.content,
      normalizedKey: item.normalized_key,
      confidence: item.confidence,
    })),
  );
  return { batches: batches.length, memories };
}

function buildSummaryPrompt(
  oldSummary: ConversationSummary | null,
  messages: ConversationMessage[],
  isHeming: boolean,
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是滚动对话摘要器。将旧摘要与新增消息合并成严格 JSON。
字段必须恰好为：user_context、confirmed_events、topics_discussed、previous_conclusions、corrections、open_questions、user_preferences、disputed_or_uncertain、do_not_assume，所有值都是字符串数组。
规则：只提取输入出现的信息；区分用户事实与助手判断；previous_conclusions 只放助手判断；用户新纠正覆盖旧事实；不要复制命盘 JSON；不要创造新命理结论；每个数组最多 12 项，每项简洁。confirmed_events 只能保留旧摘要中已经存在的已确认记录，不能把新聊天中的经历直接升级为已确认事件。
${isHeming ? '这是双人合盘对话：摘要中的人物事实与结论必须明确标注“甲方”“乙方”或“双方互动”；无法确认归属时放入 disputed_or_uncertain，绝不能把一方信息归到另一方。' : ''}`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        old_summary: oldSummary ?? EMPTY_SUMMARY,
        new_messages: messages.map(message => ({
          seq: message.seq,
          role: message.role,
          content: message.content,
        })),
      }),
    },
  ];
}

function parseSummary(content: string): ConversationSummary {
  const parsed = parseJsonObject(content);
  const summary = {} as ConversationSummary;
  for (const key of Object.keys(EMPTY_SUMMARY) as Array<keyof ConversationSummary>) {
    const value = parsed[key];
    summary[key] = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        .map(item => item.trim().slice(0, 300))
        .slice(0, 12)
      : [];
  }
  return summary;
}

function parseMemoryItems(content: string): Array<{
  category: Exclude<MemoryCategory, 'previous_interpretation' | 'confirmed_event'>;
  content: string;
  normalized_key: string;
  confidence: number;
}> {
  const parsed = parseJsonObject(content);
  if (!Array.isArray(parsed.items)) return [];
  const allowed = new Set<MemoryCategory>([
    'user_fact', 'user_preference', 'correction', 'open_question',
  ]);
  return parsed.items.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Record<string, unknown>;
    if (typeof value.category !== 'string' || !allowed.has(value.category as MemoryCategory)) return [];
    if (typeof value.content !== 'string' || !value.content.trim()) return [];
    return [{
      category: value.category as Exclude<MemoryCategory, 'previous_interpretation' | 'confirmed_event'>,
      content: value.content.trim().slice(0, 1_000),
      normalized_key: typeof value.normalized_key === 'string'
        ? value.normalized_key.trim().slice(0, 120)
        : value.content.trim().slice(0, 120),
      confidence: typeof value.confidence === 'number'
        ? Math.min(Math.max(value.confidence, 0), 1)
        : 0.9,
    }];
  }).slice(0, 8);
}

function parseJsonObject(content: string): Record<string, unknown> {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
  const parsed = JSON.parse(candidate);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('模型未返回 JSON 对象');
  return parsed as Record<string, unknown>;
}

function shouldExtractMemories(text: string): boolean {
  if (text.length < 8) return false;
  return /我(?:现在|目前|曾经|已经|在|是|有|没有|做|从事|喜欢|希望|偏好|出生|结婚|离婚|换过|经历)|本人|去年|前年|(?:19|20)\d{2}年|请记住|记一下|纠正|不是.{0,20}(?:而是|是)|以后回答/.test(text);
}

function groupTurns(messages: ConversationMessage[]): ConversationMessage[][] {
  const turns: ConversationMessage[][] = [];
  for (const message of messages) {
    if (message.role === 'user' || turns.length === 0) turns.push([message]);
    else turns[turns.length - 1].push(message);
  }
  return turns;
}

function estimateMessages(messages: ConversationMessage[]): number {
  return messages.reduce((total, message) => total + estimateTextTokens(message.content) + 6, 0);
}

function takeSummaryBatch(messages: ConversationMessage[], maxTokens: number): ConversationMessage[] {
  const selected: ConversationMessage[] = [];
  let used = 0;
  for (const turn of groupTurns(messages)) {
    const turnTokens = estimateMessages(turn);
    if (selected.length && used + turnTokens > maxTokens) break;
    selected.push(...turn);
    used += turnTokens;
  }
  return selected;
}

function splitMessageBatches(
  messages: ConversationMessage[],
  maxTokens: number,
): ConversationMessage[][] {
  const batches: ConversationMessage[][] = [];
  let current: ConversationMessage[] = [];
  let used = 0;
  for (const message of messages) {
    const tokens = estimateTextTokens(message.content) + 8;
    if (current.length && used + tokens > maxTokens) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(message);
    used += tokens;
  }
  if (current.length) batches.push(current);
  return batches;
}
