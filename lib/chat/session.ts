import { readSseData } from './sse';

export type ChatStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
export interface ChatRequest {
  source?: string; topic?: string | null; palaceBranch?: number | null; sihuaType?: string | null;
  transitLevel?: 'year' | 'month' | 'day' | null; targetDate?: string | null; hidden?: boolean;
}
export interface SavedChatMessage {
  id: string; role: string; content: string; status: ChatStatus; source: string;
  topic?: string | null; palaceBranch?: number | null; sihuaType?: string | null;
  metadata?: Record<string, unknown> | null; replyToMessageId?: string | null;
  retryOfMessageId?: string | null; requestId?: string | null; errorCode?: string | null;
}
export interface ChatMessage {
  id: string; role: 'user' | 'assistant'; content: string; status: ChatStatus; hidden?: boolean;
  requestId?: string | null; userId?: string; question?: string; options?: ChatRequest;
  persisted: boolean; error?: string;
}
export interface ChatSnapshot {
  messages: ChatMessage[]; input: string; ready: boolean; phase: 'idle' | 'generating' | 'stopping'; error: string;
}
type Task = { requestId: string; messageId: string; controller?: AbortController; stopped: boolean };
const hiddenSources = new Set(['auto', 'topic', 'palace', 'sihua']);

export function restoreChatMessages(saved: SavedChatMessage[]): ChatMessage[] {
  const byId = new Map(saved.map(message => [message.id, message]));
  let previousUser: SavedChatMessage | undefined;
  return saved.filter(message => message.role !== 'system').map(message => {
    if (message.role === 'user') previousUser = message;
    const user = message.role === 'user' ? message : (message.replyToMessageId ? byId.get(message.replyToMessageId) : previousUser);
    const transit = user?.metadata?.transit as { level?: ChatRequest['transitLevel']; targetDate?: string } | undefined;
    return { id: message.id, role: message.role as 'user' | 'assistant', content: message.content,
      status: message.status, persisted: true, requestId: message.requestId, userId: user?.id, question: user?.content,
      hidden: message.role === 'user' && hiddenSources.has(message.source),
      options: user ? { source: user.source, topic: user.topic, palaceBranch: user.palaceBranch, sihuaType: user.sihuaType,
        transitLevel: transit?.level, targetDate: transit?.targetDate, hidden: hiddenSources.has(user.source) } : undefined,
      error: message.status === 'failed' ? message.errorCode === 'interrupted_by_restart' ? '服务已重启，生成中断。' : '生成失败，已保留收到的内容。' : undefined,
    };
  });
}

/** 每个工作台持有一个会话对象，视图仅订阅；网络回调按任务 ID 更新，避免串写最后一条消息。 */
export class ChatSession {
  private snapshot: ChatSnapshot = { messages: [], input: '', ready: false, phase: 'idle', error: '' };
  private listeners = new Set<() => void>();
  private task: Task | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private subscribers = 0;
  private disposed = false;
  constructor(readonly endpoint: string, private extractEvents = false, private fetcher: typeof fetch = (input, init) => fetch(input, init)) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<ChatSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private updateMessage(id: string, patch: Partial<ChatMessage>) {
    this.update({ messages: this.snapshot.messages.map(message => message.id === id ? { ...message, ...patch } : message) });
  }
  attach = () => {
    this.subscribers++; this.disposed = false;
    return () => {
      this.subscribers--;
      // React 严格模式会立即重新订阅，不把开发检查误当成离开会话。
      queueMicrotask(() => { if (this.subscribers === 0) this.dispose(); });
    };
  };
  dispose() {
    clearTimeout(this.pollTimer);
    this.disposed = true;
    const task = this.task;
    if (task?.controller) {
      void this.fetcher(`${this.endpoint}/respond/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: task.requestId }), keepalive: true }).catch(() => undefined);
      task.controller.abort();
    }
  }
  setInput = (input: string) => this.update({ input });
  hydrate = (saved: SavedChatMessage[]) => {
    if (this.task?.controller) return;
    const messages = restoreChatMessages(saved);
    const pending = messages.findLast(message => message.role === 'assistant' && message.status === 'streaming' && message.requestId);
    this.task = pending ? { requestId: pending.requestId!, messageId: pending.id, stopped: false } : null;
    this.update({ messages, ready: true, phase: pending ? 'generating' : 'idle' });
    if (pending) this.schedulePoll();
  };
  refresh = async () => {
    try {
      const response = await this.fetcher(this.endpoint, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const body = await response.json() as { messages: SavedChatMessage[] };
      if (!this.disposed) { this.hydrate(body.messages); this.update({ error: '' }); }
    } catch {
      this.update({ error: '暂时无法同步生成状态，请刷新状态或稍后重试。' });
    }
  };
  private schedulePoll() {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => { if (!this.disposed && !this.task?.controller) void this.refresh(); }, 1500);
  }
  send = (text: string, options: ChatRequest = {}, retryMessage?: ChatMessage, preserveInput = false): boolean => {
    const content = text.trim();
    if (!content || this.task || !this.snapshot.ready || this.disposed) return false;
    if (content.length > 20_000) { this.update({ error: '问题不能超过 20000 字，请缩短后重试。' }); return false; }
    const requestId = globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userId = retryMessage?.userId ?? `local-user-${requestId}`;
    const task: Task = { requestId, messageId: `local-answer-${requestId}`, controller: new AbortController(), stopped: false };
    this.task = task;
    const messages = [...this.snapshot.messages];
    if (!retryMessage) messages.push({ id: userId, role: 'user', content, status: 'completed', hidden: options.hidden, persisted: false });
    messages.push({ id: task.messageId, role: 'assistant', content: '', status: 'streaming', persisted: false, requestId, userId, question: content, options });
    this.update({ messages, phase: 'generating', error: '', input: !preserveInput && !retryMessage && !options.hidden ? '' : this.snapshot.input });
    void this.run(task, content, options, retryMessage);
    return true;
  };
  retry = (id: string) => {
    const message = this.snapshot.messages.find(item => item.id === id);
    return message?.question ? this.send(message.question, message.options, message.persisted ? message : undefined, true) : false;
  };
  questionFor = (id: string) => this.snapshot.messages.find(message => message.id === id)?.question ?? '';
  stop = async () => {
    const task = this.task;
    if (!task || this.snapshot.phase === 'stopping') return;
    this.update({ phase: 'stopping', error: '' });
    try {
      const response = await this.fetcher(`${this.endpoint}/respond/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: task.requestId }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const body = await response.json() as { status: string };
      if (this.task !== task) return;
      if (body.status === 'completed' || body.status === 'failed') { await this.refresh(); return; }
      task.stopped = true;
      task.controller?.abort();
      this.updateMessage(task.messageId, { status: 'cancelled' });
      this.task = null;
      this.update({ phase: 'idle' });
      await this.refresh();
    } catch {
      if (this.task === task) this.update({ phase: 'generating', error: '停止请求尚未确认，可再次停止或等待生成结束。' });
    }
  };
  private async run(task: Task, content: string, options: ChatRequest, retry?: ChatMessage) {
    let userId: string | null = retry?.userId ?? null;
    let completed = false;
    try {
      const response = await this.fetcher(`${this.endpoint}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, ...options, requestId: task.requestId, retryOfAssistantId: retry?.id }), signal: task.controller!.signal });
      const ids = response.ok ? { assistantMessageId: response.headers.get('X-Assistant-Message-Id'), userMessageId: response.headers.get('X-User-Message-Id') }
        : await response.json().catch(() => ({})) as { error?: string; assistantMessageId?: string; userMessageId?: string };
      if (this.disposed || task.stopped) return;
      if (ids.userMessageId) {
        userId = ids.userMessageId;
        this.updateMessage(`local-user-${task.requestId}`, { id: userId, persisted: true });
      }
      if (ids.assistantMessageId) {
        this.updateMessage(task.messageId, { id: ids.assistantMessageId, persisted: true, userId: userId ?? undefined });
        task.messageId = ids.assistantMessageId;
      }
      if (!response.ok) throw new Error('error' in ids && ids.error ? ids.error : '请求失败，请稍后重试。');
      if (!response.body) throw new Error('没有收到响应，请重试。');
      let text = '';
      for await (const data of readSseData(response.body)) {
        if (task.stopped || this.disposed) return;
        if (data === '[DONE]') { completed = true; break; }
        const event = JSON.parse(data) as { delta?: { text?: string }; error?: { status?: string; message?: string } };
        if (event.error) {
          if (event.error.status === 'cancelled') task.stopped = true;
          throw new Error(event.error.message ?? '生成失败');
        }
        if (typeof event.delta?.text === 'string') {
          text += event.delta.text; this.updateMessage(task.messageId, { content: text });
        }
      }
      if (!completed) throw new Error('响应中途断开，已保留部分内容，可重试。');
      this.updateMessage(task.messageId, { status: 'completed' });
      if (this.extractEvents && userId && (options.source ?? 'question') === 'question') {
        void this.fetcher(`${this.endpoint}/event-candidates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceMessageId: userId }) })
          .then(response => { if (response.ok && typeof window !== 'undefined') window.dispatchEvent(new Event('life-event-candidates-updated')); }).catch(() => undefined);
      }
    } catch (error) {
      if (!this.disposed) this.updateMessage(task.messageId, { status: task.stopped ? 'cancelled' : 'failed', error: task.stopped ? undefined : error instanceof Error ? error.message : '生成失败，可重试。' });
    } finally {
      if (this.task === task) { this.task = null; this.update({ phase: 'idle' }); }
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('conversation-updated'));
    }
  }
}
