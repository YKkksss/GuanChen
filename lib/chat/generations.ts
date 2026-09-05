import type { ChatKind } from '@/lib/db/chat-replies';

export interface GenerationJob {
  requestId: string;
  controller: AbortController;
  release: () => void;
}
declare global {
  // 开发热更新时保留取消句柄，单实例部署下跨路由共享。
  var __ziweiGenerations: Map<string, GenerationJob> | undefined;
  var __ziweiCancelledGenerations: Map<string, number> | undefined;
}
const active = () => globalThis.__ziweiGenerations ??= new Map();
const cancelled = () => globalThis.__ziweiCancelledGenerations ??= new Map();
const keyFor = (kind: ChatKind, id: string) => `${kind}:${id}`;
export const isRequestId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);

export function startGeneration(kind: ChatKind, id: string, requestId: string): GenerationJob | null {
  const key = keyFor(kind, id);
  if (active().has(key)) return null;
  const job: GenerationJob = { requestId, controller: new AbortController(), release: () => {
    if (active().get(key) === job) active().delete(key);
  } };
  active().set(key, job);
  const cancelKey = `${key}:${requestId}`;
  if ((cancelled().get(cancelKey) ?? 0) > Date.now()) job.controller.abort();
  cancelled().delete(cancelKey);
  return job;
}

export function cancelGeneration(kind: ChatKind, id: string, requestId: string) {
  const key = keyFor(kind, id);
  const job = active().get(key);
  if (job?.requestId === requestId) { job.controller.abort(); return true; }
  // 停止可能先于提交到达，短期记住这个请求，防止它稍后继续生成。
  for (const [entry, expires] of cancelled()) if (expires < Date.now()) cancelled().delete(entry);
  if (cancelled().size >= 1000) cancelled().delete(cancelled().keys().next().value!);
  cancelled().set(`${key}:${requestId}`, Date.now() + 60_000);
  return false;
}
