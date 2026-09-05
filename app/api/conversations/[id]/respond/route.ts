import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { startGeneration, isRequestId, type GenerationJob } from '@/lib/chat/generations';
import { generationStream, providerText } from '@/lib/chat/generation-stream';
import { findChatRequest, linkChatReply, resolveRetryQuestion } from '@/lib/db/chat-replies';
import type { ConversationMessage } from '@/lib/conversations/types';
import {
  createChatCompletionStream,
  getProviderConfig,
  sseResponse,
} from '@/lib/ai/deepseek';
import {
  buildConversationContext,
  buildFallbackConversationContext,
} from '@/lib/context/builder';
import { maintainConversationContext } from '@/lib/context/maintenance';
import {
  buildFallbackHemingConversationContext,
  buildHemingConversationContext,
} from '@/lib/context/heming-builder';
import { estimateTextTokens } from '@/lib/context/token-counter';
import { completeContextRun, createContextRun } from '@/lib/db/context';
import {
  appendMessage,
  getConversation,
  updateMessage,
} from '@/lib/db/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RespondBody {
  requestId?: unknown;
  retryOfAssistantId?: unknown;
  message?: unknown;
  source?: unknown;
  topic?: unknown;
  palaceBranch?: unknown;
  sihuaType?: unknown;
  transitLevel?: unknown;
  targetDate?: unknown;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  if (conversation.type === 'chart' && !conversation.chartSnapshot) {
    return NextResponse.json({ error: '命盘快照缺失' }, { status: 409 });
  }
  if (conversation.type === 'heming'
    && (!conversation.chartSnapshotA || !conversation.chartSnapshotB || !conversation.relationshipType)) {
    return NextResponse.json({ error: '双命盘快照或关系类型缺失' }, { status: 409 });
  }

  let assistantId: string | null = null;
  let contextRunId: string | null = null;
  let job: GenerationJob | null = null;
  let userId: string | null = null;
  try {
    let body = await request.json() as RespondBody;
    const retryOf = typeof body.retryOfAssistantId === 'string' ? body.retryOfAssistantId : null;
    const retryQuestion = retryOf ? resolveRetryQuestion('ziwei', id, retryOf) as ConversationMessage : null;
    if (retryQuestion) {
      const transit = retryQuestion.metadata?.transit as { level?: string; targetDate?: string } | undefined;
      body = { ...body, message: retryQuestion.content, source: retryQuestion.source, topic: retryQuestion.topic,
        palaceBranch: retryQuestion.palaceBranch, sihuaType: retryQuestion.sihuaType,
        transitLevel: transit?.level, targetDate: transit?.targetDate };
    }
    const content = typeof body.message === 'string' ? body.message.trim() : '';
    if (!content) return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
    if (content.length > 20_000) return NextResponse.json({ error: '消息内容过长' }, { status: 413 });
    const requestId = body.requestId === undefined ? randomUUID() : body.requestId;
    if (!isRequestId(requestId)) return NextResponse.json({ error: '请求标识无效' }, { status: 400 });
    if (findChatRequest('ziwei', requestId)) return NextResponse.json({ error: '该请求已处理，请刷新查看结果。' }, { status: 409 });
    job = startGeneration('ziwei', id, requestId);
    if (!job) return NextResponse.json({ error: '该会话正在生成，请先停止或等待完成。' }, { status: 409 });

    const source = normalizeSource(body.source);
    const topic = typeof body.topic === 'string' ? body.topic.slice(0, 40) : null;
    const palaceBranch = typeof body.palaceBranch === 'number' ? body.palaceBranch : null;
    const sihuaType = typeof body.sihuaType === 'string' ? body.sihuaType.slice(0, 20) : null;
    const transitLevel = body.transitLevel === 'year' || body.transitLevel === 'month' || body.transitLevel === 'day'
      ? body.transitLevel
      : null;
    const targetDate = typeof body.targetDate === 'string'
      && (
        (transitLevel === 'year' && /^\d{4}$/.test(body.targetDate))
        || ((transitLevel === 'month' || transitLevel === 'day') && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate))
      )
      ? body.targetDate
      : null;
    const metadata = transitLevel && targetDate
      ? { transit: { level: transitLevel, targetDate } }
      : null;

    const userMessage = retryQuestion ?? appendMessage({
      conversationId: id,
      role: 'user',
      content,
      source,
      topic,
      palaceBranch,
      sihuaType,
      metadata,
      status: 'completed',
    });
    userId = userMessage.id;
    updateMessage(userMessage.id, { tokenCount: estimateTextTokens(content) });
    const assistant = appendMessage({
      conversationId: id,
      role: 'assistant',
      source: 'answer',
      topic,
      status: 'streaming',
    });
    assistantId = assistant.id;
    linkChatReply('ziwei', assistant.id, userMessage.id, requestId, retryOf);

    const provider = getProviderConfig();
    let builtContext;
    try {
      builtContext = conversation.type === 'heming'
        ? buildHemingConversationContext({
            conversationId: id,
            currentMessageId: userMessage.id,
            provider: provider.provider,
            model: provider.model,
          })
        : buildConversationContext({
            conversationId: id,
            currentMessageId: userMessage.id,
            provider: provider.provider,
            model: provider.model,
          });
    } catch (contextError) {
      const reason = contextError instanceof Error ? contextError.message : 'context_builder_error';
      console.warn('完整上下文构建失败，已降级到命盘事实和最近消息：', contextError);
      builtContext = conversation.type === 'heming'
        ? buildFallbackHemingConversationContext({
            conversationId: id,
            currentMessageId: userMessage.id,
            provider: provider.provider,
            model: provider.model,
            reason,
          })
        : buildFallbackConversationContext({
            conversationId: id,
            currentMessageId: userMessage.id,
            provider: provider.provider,
            model: provider.model,
            reason,
          });
    }
    const contextRun = createContextRun({
      conversationId: id,
      triggerMessageId: userMessage.id,
      assistantMessageId: assistant.id,
      provider: provider.provider,
      model: provider.model,
      contextLimit: builtContext.contextLimit,
      outputReserve: builtContext.outputReserve,
      inputBudget: builtContext.inputBudget,
      estimatedInputTokens: builtContext.estimatedInputTokens,
      summaryVersion: builtContext.summaryVersion,
      recentMessageStartSeq: builtContext.recentMessageStartSeq,
      recentMessageCount: builtContext.recentMessageIds.length,
      retrievedMessageIds: builtContext.retrievedMessageIds,
      contextManifest: builtContext.manifest,
    });
    contextRunId = contextRun.id;

    return sseResponse(generationStream({
      job, requestSignal: request.signal,
      async *produce(signal) {
        yield* providerText(await createChatCompletionStream(builtContext.messages, {
          temperature: conversation.type === 'heming' ? 0.62 : 0.72, maxTokens: 2000, signal,
        }));
      },
      savePartial: text => { updateMessage(assistant.id, { content: text, status: 'streaming' }); },
      finish(status, text, errorCode) {
        const tokens = estimateTextTokens(text);
        updateMessage(assistant.id, { content: text, status, tokenCount: tokens, errorCode });
        completeContextRun(contextRun.id, { status: status === 'completed' ? 'completed' : 'failed', errorCode, actualOutputTokens: tokens });
        if (status === 'completed') void maintainConversationContext({ conversationId: id, userMessageId: userMessage.id, assistantMessageId: assistant.id })
          .catch(error => console.warn('对话摘要更新失败：', error));
      },
    }), {
      'X-User-Message-Id': userMessage.id,
      'X-Assistant-Message-Id': assistant.id,
      'X-Chat-Request-Id': requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 解读失败';
    if (assistantId) {
      updateMessage(assistantId, {
        content: '',
        status: 'failed',
        errorCode: 'provider_error',
      });
    }
    if (contextRunId) {
      completeContextRun(contextRunId, { status: 'failed', errorCode: 'provider_error' });
    }
    job?.release();
    return NextResponse.json({ error: message, assistantMessageId: assistantId, userMessageId: userId }, { status: assistantId ? 500 : 400 });
  }
}

function normalizeSource(value: unknown): string {
  const allowed = new Set(['question', 'topic', 'palace', 'sihua', 'auto']);
  return typeof value === 'string' && allowed.has(value) ? value : 'question';
}
