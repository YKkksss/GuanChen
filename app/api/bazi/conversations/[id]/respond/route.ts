import { NextResponse } from 'next/server';
import { createChatCompletion, getProviderConfig, sseResponse } from '@/lib/ai/deepseek';
import {
  buildBaziConversationContext,
  buildFallbackBaziConversationContext,
  findBaziOutputViolations,
} from '@/lib/context/bazi-builder';
import { maintainBaziConversationContext } from '@/lib/context/bazi-maintenance';
import { estimateTextTokens } from '@/lib/context/token-counter';
import {
  appendBaziMessage,
  completeBaziContextRun,
  createBaziContextRun,
  getBaziConversation,
  updateBaziMessage,
} from '@/lib/db/bazi-conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getBaziConversation(id)) return NextResponse.json({ error: '八字会话不存在' }, { status: 404 });
  let assistantId: string | null = null;
  let contextRunId: string | null = null;
  try {
    const body = await request.json() as { message?: unknown; source?: unknown };
    const content = typeof body.message === 'string' ? body.message.trim() : '';
    if (!content) return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
    if (content.length > 20_000) return NextResponse.json({ error: '消息内容过长' }, { status: 413 });
    const source = body.source === 'quick_prompt' ? 'quick_prompt' : 'question';
    const userMessage = appendBaziMessage({ conversationId: id, role: 'user', content, source });
    updateBaziMessage(userMessage.id, { tokenCount: estimateTextTokens(content) });
    const assistant = appendBaziMessage({ conversationId: id, role: 'assistant', source: 'answer', status: 'streaming' });
    assistantId = assistant.id;
    const provider = getProviderConfig();
    let built;
    try {
      built = buildBaziConversationContext({
        conversationId: id, currentMessageId: userMessage.id,
        provider: provider.provider, model: provider.model,
      });
    } catch (buildError) {
      const reason = buildError instanceof Error ? buildError.message : 'context_builder_error';
      console.warn('八字完整上下文构建失败，已降级到基础盘事实：', buildError);
      built = buildFallbackBaziConversationContext({
        conversationId: id, currentMessageId: userMessage.id,
        provider: provider.provider, model: provider.model, reason,
      });
    }
    const run = createBaziContextRun({
      conversationId: id, triggerMessageId: userMessage.id, assistantMessageId: assistant.id,
      provider: provider.provider, model: provider.model,
      contextLimit: built.contextLimit, outputReserve: built.outputReserve,
      inputBudget: built.inputBudget, estimatedInputTokens: built.estimatedInputTokens,
      summaryVersion: built.summaryVersion, recentMessageStartSeq: built.recentMessageStartSeq,
      recentMessageCount: built.recentMessageIds.length, contextManifest: built.manifest,
    });
    contextRunId = run.id;
    const completion = await createChatCompletion(built.messages, { temperature: 0.25, maxTokens: 1_600 });
    const violations = findBaziOutputViolations(completion.content);
    const answer = violations.length
      ? `【当前边界】\n刚才的生成内容触及了尚未启用的方法（${violations.join('、')}），因此系统没有展示该结论。你可以继续询问四柱基础事实、旺衰证据、格局候选、分方法取用方向，以及大运顺逆、起运间隔、交运日期和干支排期。`
      : completion.content.trim();
    const outputTokens = completion.usage.outputTokens ?? estimateTextTokens(answer);
    updateBaziMessage(assistant.id, {
      content: answer, status: 'completed', tokenCount: outputTokens,
      errorCode: violations.length ? 'output_guard_replaced' : null,
    });
    completeBaziContextRun(run.id, {
      status: 'completed', errorCode: violations.length ? 'output_guard_replaced' : null,
      actualInputTokens: completion.usage.inputTokens,
      actualOutputTokens: completion.usage.outputTokens ?? outputTokens,
      cachedInputTokens: completion.usage.cachedInputTokens,
    });
    void maintainBaziConversationContext({ conversationId: id, assistantMessageSeq: assistant.seq })
      .catch(error => console.warn('八字滚动摘要更新失败：', error));
    return sseResponse(createTextStream(answer));
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字解读失败';
    if (assistantId) updateBaziMessage(assistantId, { content: '解读失败，请稍后重试。', status: 'failed', errorCode: 'provider_error' });
    if (contextRunId) completeBaziContextRun(contextRunId, { status: 'failed', errorCode: 'provider_error' });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function createTextStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,28}/g) ?? [];
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: chunk } })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}
