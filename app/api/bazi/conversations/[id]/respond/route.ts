import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createChatCompletion, getProviderConfig, sseResponse } from '@/lib/ai/deepseek';
import { startGeneration, isRequestId, type GenerationJob } from '@/lib/chat/generations';
import { generationStream } from '@/lib/chat/generation-stream';
import { findChatRequest, linkChatReply, resolveRetryQuestion } from '@/lib/db/chat-replies';
import { buildBaziConversationContext, buildFallbackBaziConversationContext, findBaziOutputViolations } from '@/lib/context/bazi-builder';
import { maintainBaziConversationContext } from '@/lib/context/bazi-maintenance';
import { estimateTextTokens } from '@/lib/context/token-counter';
import { appendBaziMessage, completeBaziContextRun, createBaziContextRun, getBaziConversation, updateBaziMessage } from '@/lib/db/bazi-conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziConversation(id)) return NextResponse.json({ error: '八字会话不存在' }, { status: 404 });
  let assistantId: string | null = null;
  let userId: string | null = null;
  let contextRunId: string | null = null;
  let job: GenerationJob | null = null;
  try {
    const body = await request.json() as { message?: unknown; source?: unknown; requestId?: unknown; retryOfAssistantId?: unknown };
    const retryOf = typeof body.retryOfAssistantId === 'string' ? body.retryOfAssistantId : null;
    const retryQuestion = retryOf ? resolveRetryQuestion('bazi', id, retryOf) : null;
    const content = retryQuestion?.content ?? (typeof body.message === 'string' ? body.message.trim() : '');
    if (!content) return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
    if (content.length > 20_000) return NextResponse.json({ error: '消息内容过长' }, { status: 413 });
    const requestId = body.requestId === undefined ? randomUUID() : body.requestId;
    if (!isRequestId(requestId)) return NextResponse.json({ error: '请求标识无效' }, { status: 400 });
    if (findChatRequest('bazi', requestId)) return NextResponse.json({ error: '该请求已处理，请刷新查看结果。' }, { status: 409 });
    job = startGeneration('bazi', id, requestId);
    if (!job) return NextResponse.json({ error: '该会话正在生成，请先停止或等待完成。' }, { status: 409 });
    const source = retryQuestion?.source ?? (body.source === 'quick_prompt' ? 'quick_prompt' : 'question');
    const userMessage = retryQuestion ?? appendBaziMessage({ conversationId: id, role: 'user', content, source });
    userId = userMessage.id;
    updateBaziMessage(userMessage.id, { tokenCount: estimateTextTokens(content) });
    const assistant = appendBaziMessage({ conversationId: id, role: 'assistant', source: 'answer', status: 'streaming' });
    assistantId = assistant.id;
    linkChatReply('bazi', assistant.id, userMessage.id, requestId, retryOf);
    const provider = getProviderConfig();
    let built;
    try {
      built = buildBaziConversationContext({ conversationId: id, currentMessageId: userMessage.id, provider: provider.provider, model: provider.model });
    } catch (buildError) {
      const reason = buildError instanceof Error ? buildError.message : 'context_builder_error';
      built = buildFallbackBaziConversationContext({ conversationId: id, currentMessageId: userMessage.id, provider: provider.provider, model: provider.model, reason });
    }
    const run = createBaziContextRun({
      conversationId: id, triggerMessageId: userMessage.id, assistantMessageId: assistant.id,
      provider: provider.provider, model: provider.model,
      contextLimit: built.contextLimit, outputReserve: built.outputReserve, inputBudget: built.inputBudget,
      estimatedInputTokens: built.estimatedInputTokens, summaryVersion: built.summaryVersion,
      recentMessageStartSeq: built.recentMessageStartSeq, recentMessageCount: built.recentMessageIds.length, contextManifest: built.manifest,
    });
    contextRunId = run.id;
    let usage: { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null } | null = null;
    let guardReplaced = false;
    return sseResponse(generationStream({
      job, requestSignal: request.signal,
      async *produce(signal) {
        const completion = await createChatCompletion(built.messages, { temperature: 0.25, maxTokens: 1_600, signal });
        signal.throwIfAborted();
        usage = completion.usage;
        const violations = findBaziOutputViolations(completion.content);
        guardReplaced = violations.length > 0;
        // 八字保持先审查后展示，停止生成不允许绕过输出边界。
        yield guardReplaced
          ? `【当前边界】\n刚才的生成内容触及了尚未启用的方法（${violations.join('、')}），因此系统没有展示该结论。你可以继续询问四柱基础事实、旺衰证据、格局候选、分方法取用方向，以及大运顺逆、起运间隔、交运日期和干支排期。`
          : completion.content.trim();
      },
      savePartial: text => { updateBaziMessage(assistant.id, { content: text, status: 'streaming' }); },
      finish(status, text, errorCode) {
        const code = status === 'completed' && guardReplaced ? 'output_guard_replaced' : errorCode;
        updateBaziMessage(assistant.id, { content: text, status, tokenCount: estimateTextTokens(text), errorCode: code });
        completeBaziContextRun(run.id, { status: status === 'completed' ? 'completed' : 'failed', errorCode: code,
          actualInputTokens: usage?.inputTokens, actualOutputTokens: usage?.outputTokens ?? estimateTextTokens(text), cachedInputTokens: usage?.cachedInputTokens });
        if (status === 'completed') void maintainBaziConversationContext({ conversationId: id, assistantMessageSeq: assistant.seq })
          .catch(error => console.warn('八字滚动摘要更新失败：', error));
      },
    }), { 'X-User-Message-Id': userMessage.id, 'X-Assistant-Message-Id': assistant.id, 'X-Chat-Request-Id': requestId });
  } catch (error) {
    if (assistantId) updateBaziMessage(assistantId, { content: '', status: 'failed', errorCode: 'provider_error' });
    if (contextRunId) completeBaziContextRun(contextRunId, { status: 'failed', errorCode: 'provider_error' });
    job?.release();
    return NextResponse.json({ error: error instanceof Error ? error.message : '八字解读失败', assistantMessageId: assistantId, userMessageId: userId }, { status: assistantId ? 500 : 400 });
  }
}
