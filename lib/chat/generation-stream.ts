import { readSseData } from './sse';
import type { GenerationJob } from './generations';

export type GenerationStatus = 'completed' | 'failed' | 'cancelled';
export class IncompleteGenerationError extends Error {}

export async function* providerText(stream: ReadableStream<Uint8Array>) {
  for await (const data of readSseData(stream)) {
    if (data === '[DONE]') return;
    const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; error?: unknown };
    if (event.error) throw new Error('上游生成失败');
    const text = event.choices?.[0]?.delta?.content;
    if (typeof text === 'string' && text) yield text;
  }
  throw new IncompleteGenerationError('上游响应提前结束');
}

export function generationStream(input: {
  job: GenerationJob;
  requestSignal: AbortSignal;
  produce: (signal: AbortSignal) => AsyncIterable<string>;
  savePartial: (text: string) => void;
  finish: (status: GenerationStatus, text: string, errorCode: string | null) => void;
}) {
  const encoder = new TextEncoder();
  let finished = false;
  let disconnected = false;
  let text = '';
  let savedLength = 0;
  let savedAt = Date.now();
  let responseController: ReadableStreamDefaultController<Uint8Array>;
  const signal = input.job.controller.signal;
  const emit = (data: unknown) => { if (!disconnected) responseController.enqueue(encoder.encode(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)); };
  const stop = () => input.job.controller.abort();
  const end = (status: GenerationStatus, code: string | null) => {
    if (finished) return;
    finished = true;
    try {
      input.finish(status, text, code);
      if (status === 'completed') emit('[DONE]');
      else emit({ error: { status, code, message: status === 'cancelled' ? '已停止生成，已收到的内容已保留。' : code === 'incomplete_stream' ? '响应中途断开，已保留部分内容，可重试。' : '生成失败，可重试或恢复原问题。' } });
      if (!disconnected) responseController.close();
    } catch (error) {
      if (!disconnected) responseController.error(error);
    } finally {
      input.requestSignal.removeEventListener('abort', stop);
      signal.removeEventListener('abort', onAbort);
      clearTimeout(timeout);
      input.job.release();
    }
  };
  const onAbort = () => end('cancelled', 'user_cancelled');
  // 避免供应商永久不响应而占住会话。超时属于失败，区别于主动停止。
  const timeout = setTimeout(() => { end('failed', 'generation_timeout'); input.job.controller.abort(); }, 180_000);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      responseController = controller;
      input.requestSignal.addEventListener('abort', stop, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
      if (input.requestSignal.aborted) stop();
      if (signal.aborted) { onAbort(); return; }
      void (async () => {
        try {
          for await (const delta of input.produce(signal)) {
            if (finished) return;
            text += delta;
            emit({ delta: { text: delta } });
            if (text.length - savedLength >= 300 || Date.now() - savedAt >= 800) {
              input.savePartial(text); savedLength = text.length; savedAt = Date.now();
            }
          }
          if (!text.trim()) throw new Error('返回内容为空');
          end('completed', null);
        } catch (error) {
          if (!finished) end(signal.aborted ? 'cancelled' : 'failed', signal.aborted ? 'user_cancelled' : error instanceof IncompleteGenerationError ? 'incomplete_stream' : 'provider_error');
        }
      })();
    },
    cancel() { disconnected = true; stop(); },
  });
}
