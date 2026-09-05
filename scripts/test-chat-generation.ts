import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ChatSession, restoreChatMessages } from '../lib/chat/session';
import { readSseData } from '../lib/chat/sse';

const directory = mkdtempSync(path.join(tmpdir(), 'ziwei-chat-generation-'));
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'local-test-only';
process.env.DEEPSEEK_BASE_URL = 'http://mock.local';
const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;
let mode: 'complete' | 'partial' | 'headers' | 'truncated' | 'error' | 'guard' = 'complete';
let providerCalls = 0;
let lastSignal: AbortSignal | undefined;
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check: () => boolean) { for (let i = 0; i < 400; i++) { if (check()) return; await tick(); } throw new Error('等待状态超时'); }

async function main() {
  globalThis.fetch = async (_url, init) => {
    providerCalls++;
    lastSignal = init?.signal ?? undefined;
    if (mode === 'headers') return await new Promise<Response>((_resolve, reject) => {
      if (lastSignal?.aborted) reject(new DOMException('停止', 'AbortError'));
      else lastSignal?.addEventListener('abort', () => reject(new DOMException('停止', 'AbortError')), { once: true });
    });
    if (mode === 'error') return new Response('供应商暂不可用', { status: 503 });
    const body = JSON.parse(String(init?.body));
    if (!body.stream) return Response.json({ choices: [{ message: { content: mode === 'guard' ? '你的命局身强，用神是火。' : '日柱天干为辛，藏干包括丙、庚、戊。' } }] });
    const currentMode = mode;
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: currentMode === 'partial' || currentMode === 'truncated' ? '已收到的部分内容。' : '完整回答。' } }] })}\n\n`));
      if (currentMode !== 'partial') {
        if (currentMode !== 'truncated') controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } else lastSignal?.addEventListener('abort', () => { try { controller.error(new DOMException('停止', 'AbortError')); } catch { /* 已关闭 */ } }, { once: true });
    } }));
  };
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const db = await import('../lib/db/conversations');
  const baziDb = await import('../lib/db/bazi-conversations');
  const client = await import('../lib/db/client');
  const links = await import('../lib/db/chat-replies');
  const route = await import('../app/api/conversations/[id]/respond/route');
  const baziRoute = await import('../app/api/bazi/conversations/[id]/respond/route');
  const { cancelChatRequest } = await import('../lib/chat/cancel-route');
  const profileRoute = await import('../app/api/bazi/profiles/route');
  const baziCreate = await import('../app/api/bazi/conversations/route');
  const chart = generateChart({ year: 1990, month: 6, day: 15, hour: 4, gender: 'male' });
  const solo = db.createConversation({ type: 'chart', title: '生成链路验收', birthInfo: chart.birthInfo, chartSnapshot: chart });
  const pair = db.createConversation({ type: 'heming', title: '合盘生成验收', birthInfoA: chart.birthInfo, birthInfoB: chart.birthInfo, chartSnapshotA: chart, chartSnapshotB: chart, relationshipType: 'friendship' });
  const post = (id: string, body: Record<string, unknown>, signal?: AbortSignal) => route.POST(new Request('http://local/respond', { method: 'POST', body: JSON.stringify(body), signal }), { params: Promise.resolve({ id }) });
  const cancel = (id: string, requestId: string, kind: 'ziwei' | 'bazi' = 'ziwei') => cancelChatRequest(new Request('http://local/cancel', { method: 'POST', body: JSON.stringify({ requestId }) }), id, kind);
  const assistant = (response: Response) => db.getMessage(response.headers.get('X-Assistant-Message-Id')!)!;

  try {
    assert.equal((client.getDatabase().prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version, 47);
    // 每个 UTF-8 字节独立到达，包含 CRLF 和末尾未换行的完成标记。
    const bytes = encoder.encode('data: {"delta":{"text":"紫微"}}\r\n\r\ndata: [DONE]');
    const events: string[] = [];
    for await (const event of readSseData(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } }))) events.push(event);
    assert.deepEqual(events, ['{"delta":{"text":"紫微"}}', '[DONE]']);

    mode = 'partial';
    const requestId = randomUUID();
    const response = await post(solo.id, { message: '分析原宫位', source: 'palace', topic: 'wealth', palaceBranch: 5, sihuaType: '禄', transitLevel: 'year', targetDate: '2024', requestId });
    const firstReader = response.body!.getReader();
    await firstReader.read();
    assert.equal((await post(solo.id, { message: '并发请求', requestId: randomUUID() })).status, 409);
    await cancel(solo.id, requestId);
    assert.equal(lastSignal?.aborted, true, '停止必须向上游传播 AbortSignal');
    assert.equal(assistant(response).status, 'cancelled');
    assert.equal(assistant(response).content, '已收到的部分内容。');
    await firstReader.cancel();
    const stopped = assistant(response);
    const restored = restoreChatMessages(db.listMessages(solo.id));
    assert.equal(restored.at(-1)?.question, '分析原宫位');
    assert.equal(restored.at(-1)?.options?.targetDate, '2024');

    mode = 'complete';
    const retried = await post(solo.id, { retryOfAssistantId: stopped.id, message: '伪造的新问题', palaceBranch: 0, requestId: randomUUID() });
    assert.match(await retried.text(), /完整回答/);
    assert.equal(assistant(retried).replyToMessageId, stopped.replyToMessageId);
    assert.equal(assistant(retried).retryOfMessageId, stopped.id);
    assert.equal(db.listMessages(solo.id).filter(message => message.role === 'user').length, 1, '重试不得重复插入原问题');
    assert.equal(db.getMessage(stopped.replyToMessageId!)?.palaceBranch, 5);
    assert.equal(db.getMessage(stopped.id)?.status, 'cancelled', '新回答不得覆盖旧回答');
    assert.equal((await post(pair.id, { retryOfAssistantId: stopped.id })).status, 400, '拒绝跨会话重试');
    assert.equal((await post(solo.id, { message: '重复提交', requestId })).status, 409);
    await cancel(solo.id, retried.headers.get('X-Chat-Request-Id')!);
    assert.equal(assistant(retried).status, 'completed', '完成后的停止不得反写取消');

    mode = 'headers';
    const early = await post(pair.id, { message: '等待响应头时停止', requestId: randomUUID() });
    await cancel(pair.id, early.headers.get('X-Chat-Request-Id')!);
    assert.equal(assistant(early).status, 'cancelled');
    assert.match(await early.text(), /cancelled/);

    const before = providerCalls;
    const preCancelledId = randomUUID();
    await cancel(pair.id, preCancelledId);
    const preCancelled = await post(pair.id, { message: '停止先于提交到达', requestId: preCancelledId });
    assert.match(await preCancelled.text(), /cancelled/);
    assert.equal(providerCalls, before);

    mode = 'truncated';
    const truncated = await post(pair.id, { message: '中途断流' });
    assert.match(await truncated.text(), /incomplete_stream/);
    assert.equal(assistant(truncated).status, 'failed');
    assert.equal(assistant(truncated).content, '已收到的部分内容。');

    mode = 'partial';
    const disconnected = new AbortController();
    const disconnectResponse = await post(pair.id, { message: '浏览器断开', requestId: randomUUID() }, disconnected.signal);
    disconnected.abort();
    await disconnectResponse.text();
    assert.equal(assistant(disconnectResponse).status, 'cancelled');

    mode = 'error';
    const failed = await post(pair.id, { message: '无内容失败' });
    assert.match(await failed.text(), /provider_error/);
    assert.equal(assistant(failed).content, '');
    assert.equal(restoreChatMessages(db.listMessages(pair.id)).at(-1)?.status, 'failed', '空失败回答必须可见并可恢复');

    // 浏览器原生 fetch 不接受会话对象作为 this；默认传输必须保持合法调用方式。
    const providerFetch = globalThis.fetch;
    globalThis.fetch = function (this: unknown) {
      assert.ok(this === undefined || this === globalThis, '不能把原生 fetch 当作会话方法调用');
      return Promise.resolve(Response.json({ messages: [] }));
    };
    const browserTransportSession = new ChatSession('/api/conversations/browser-transport');
    await browserTransportSession.refresh();
    assert.equal(browserTransportSession.getSnapshot().ready, true);
    globalThis.fetch = providerFetch;

    const offlineSession = new ChatSession('/api/conversations/offline', false, async () => { throw new Error('网络断开'); });
    offlineSession.hydrate([]);
    offlineSession.send('网络失败前的原问题');
    await until(() => offlineSession.getSnapshot().phase === 'idle');
    offlineSession.setInput('失败后新写的草稿');
    offlineSession.retry(offlineSession.getSnapshot().messages.at(-1)!.id);
    await until(() => offlineSession.getSnapshot().phase === 'idle');
    assert.equal(offlineSession.getSnapshot().input, '失败后新写的草稿');

    // 同一套前端状态直接连接真实路由，覆盖乐观消息、停止、重试和草稿保留。
    const transport: typeof fetch = async (url, init) => {
      const endpoint = String(url);
      if (endpoint.endsWith('/cancel')) return cancelChatRequest(new Request(`http://local${endpoint}`, init), solo.id, 'ziwei');
      if (endpoint.endsWith('/respond')) return route.POST(new Request(`http://local${endpoint}`, init), { params: Promise.resolve({ id: solo.id }) });
      return Response.json({ messages: db.listMessages(solo.id) });
    };
    const session = new ChatSession(`/api/conversations/${solo.id}`, false, transport);
    const detach = session.attach();
    session.hydrate(db.listMessages(solo.id));
    session.setInput('切换视图时应保留的草稿');
    mode = 'partial';
    assert.equal(session.send('快捷分析', { source: 'topic', hidden: true }), true);
    assert.equal(session.send('快速重复'), false);
    await until(() => session.getSnapshot().messages.at(-1)?.content === '已收到的部分内容。');
    assert.equal(session.getSnapshot().input, '切换视图时应保留的草稿');
    await session.stop();
    assert.equal(session.getSnapshot().phase, 'idle');
    assert.equal(session.getSnapshot().messages.at(-1)?.status, 'cancelled');
    mode = 'complete';
    session.retry(session.getSnapshot().messages.at(-1)!.id);
    await until(() => session.getSnapshot().phase === 'idle');
    assert.equal(session.getSnapshot().messages.at(-1)?.status, 'completed');
    assert.equal(session.getSnapshot().input, '切换视图时应保留的草稿');
    detach();

    const profileResponse = await profileRoute.POST(new Request('http://local/profile', { method: 'POST', body: JSON.stringify({ displayName: '八字验收', birthDate: '2005-12-23', birthTime: '08:37', gender: 'male', timeZoneId: 'Asia/Shanghai', longitude: 116.4074, initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' } }) }));
    const profile = (await profileResponse.json()).profile;
    const baziConversation = (await (await baziCreate.POST(new Request('http://local/bazi', { method: 'POST', body: JSON.stringify({ chartVersionId: profile.charts[0].id }) }))).json()).conversation;
    const baziPost = (body: Record<string, unknown>) => baziRoute.POST(new Request('http://local/bazi/respond', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: baziConversation.id }) });
    mode = 'headers';
    const baziPending = await baziPost({ message: '等待八字审查', source: 'quick_prompt', requestId: randomUUID() });
    await cancel(baziConversation.id, baziPending.headers.get('X-Chat-Request-Id')!, 'bazi');
    assert.match(await baziPending.text(), /cancelled/);
    const baziStopped = baziDb.getBaziMessage(baziPending.headers.get('X-Assistant-Message-Id')!)!;
    assert.equal(baziStopped.status, 'cancelled');
    assert.equal(baziStopped.content, '');
    mode = 'guard';
    const guarded = await baziPost({ retryOfAssistantId: baziStopped.id, requestId: randomUUID() });
    const guardedBody = await guarded.text();
    assert.match(guardedBody, /当前边界/);
    assert.doesNotMatch(guardedBody, /你的命局身强/);
    assert.equal(baziDb.getBaziMessage(guarded.headers.get('X-Assistant-Message-Id')!)?.errorCode, 'output_guard_replaced');
    assert.equal(baziDb.listBaziMessages(baziConversation.id).filter(message => message.role === 'user').length, 1);

    const interrupted = db.appendMessage({ conversationId: solo.id, role: 'assistant', content: '重启前部分内容', status: 'streaming' });
    links.linkChatReply('ziwei', interrupted.id, stopped.replyToMessageId!, randomUUID(), null);
    client.closeDatabaseConnection();
    assert.equal(db.getMessage(interrupted.id)?.status, 'failed');
    assert.equal(links.resolveRetryQuestion('ziwei', solo.id, interrupted.id).content, '分析原宫位');
    assert.equal(globalThis.__ziweiGenerations?.size, 0, '终态必须释放所有任务锁');
    console.log('聊天生命周期验收通过：SQLite v47、流解析、首字前停止、部分保留、上游取消、断流失败、并发和幂等、重试隔离、草稿保持、八字输出审查、重启恢复。');
  } finally {
    globalThis.fetch = originalFetch;
    client.closeDatabaseConnection();
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
