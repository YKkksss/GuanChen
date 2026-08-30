import { NextResponse } from 'next/server';
import {
  createChatCompletionStream,
  getProviderConfig,
  sseResponse,
  toClientSseStream,
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
  try {
    const body = await request.json() as RespondBody;
    const content = typeof body.message === 'string' ? body.message.trim() : '';
    if (!content) return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
    if (content.length > 20_000) return NextResponse.json({ error: '消息内容过长' }, { status: 413 });

    const source = normalizeSource(body.source);
    const topic = typeof body.topic === 'string' ? body.topic.slice(0, 40) : null;
    const palaceBranch = typeof body.palaceBranch === 'number' ? body.palaceBranch : null;
    const sihuaType = typeof body.sihuaType === 'string' ? body.sihuaType.slice(0, 20) : null;
    const transitLevel = body.transitLevel === 'year' ? 'year' : null;
    const targetDate = typeof body.targetDate === 'string' && /^\d{4}$/.test(body.targetDate)
      ? body.targetDate
      : null;
    const metadata = transitLevel && targetDate
      ? { transit: { level: transitLevel, targetDate } }
      : null;

    const userMessage = appendMessage({
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
    updateMessage(userMessage.id, { tokenCount: estimateTextTokens(content) });
    const assistant = appendMessage({
      conversationId: id,
      role: 'assistant',
      source: 'answer',
      topic,
      status: 'streaming',
    });
    assistantId = assistant.id;

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

    const upstream = await createChatCompletionStream(builtContext.messages, {
      temperature: conversation.type === 'heming' ? 0.62 : 0.72,
      maxTokens: 2000,
    });
    const clientStream = toClientSseStream(upstream);
    return sseResponse(persistAssistantStream(clientStream, {
      conversationId: id,
      userMessageId: userMessage.id,
      assistantMessageId: assistant.id,
      contextRunId: contextRun.id,
      estimatedInputTokens: builtContext.estimatedInputTokens,
    }), {
      'X-User-Message-Id': userMessage.id,
      'X-Assistant-Message-Id': assistant.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 解读失败';
    if (assistantId) {
      updateMessage(assistantId, {
        content: '解读失败，请稍后重试。',
        status: 'failed',
        errorCode: 'provider_error',
      });
    }
    if (contextRunId) {
      completeContextRun(contextRunId, { status: 'failed', errorCode: 'provider_error' });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeSource(value: unknown): string {
  const allowed = new Set(['question', 'topic', 'palace', 'sihua', 'auto']);
  return typeof value === 'string' && allowed.has(value) ? value : 'question';
}

function persistAssistantStream(
  stream: ReadableStream<Uint8Array>,
  input: {
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
    contextRunId: string;
    estimatedInputTokens: number;
  },
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let parseBuffer = '';
  let fullText = '';
  let lastSavedLength = 0;
  let lastSavedAt = Date.now();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);

          parseBuffer += decoder.decode(value, { stream: true });
          const lines = parseBuffer.split(/\r?\n/);
          parseBuffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const delta = JSON.parse(data).delta?.text;
              if (typeof delta === 'string') fullText += delta;
            } catch {
              // 忽略单个格式异常的增量，最终状态仍由完整流决定。
            }
          }

          if (fullText.length - lastSavedLength >= 300 || Date.now() - lastSavedAt >= 800) {
            updateMessage(input.assistantMessageId, { content: fullText, status: 'streaming' });
            lastSavedLength = fullText.length;
            lastSavedAt = Date.now();
          }
        }
        const outputTokens = estimateTextTokens(fullText);
        updateMessage(input.assistantMessageId, {
          content: fullText,
          status: 'completed',
          tokenCount: outputTokens,
          errorCode: null,
        });
        completeContextRun(input.contextRunId, {
          status: 'completed',
          actualOutputTokens: outputTokens,
        });
        void maintainConversationContext({
          conversationId: input.conversationId,
          userMessageId: input.userMessageId,
          assistantMessageId: input.assistantMessageId,
        });
        controller.close();
      } catch (error) {
        updateMessage(input.assistantMessageId, {
          content: fullText,
          status: 'failed',
          tokenCount: estimateTextTokens(fullText),
          errorCode: error instanceof Error ? 'stream_error' : 'unknown_stream_error',
        });
        completeContextRun(input.contextRunId, {
          status: 'failed',
          errorCode: error instanceof Error ? 'stream_error' : 'unknown_stream_error',
          actualOutputTokens: estimateTextTokens(fullText),
        });
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
