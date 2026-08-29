'use client';

import {
  ArrowLeft,
  ChatCircleDots,
  List,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
  Trash,
  X,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BaziConversationDetail,
  BaziConversationListItem,
  BaziConversationMessage,
} from '@/lib/bazi/conversation-types';

const QUICK_PROMPTS = [
  '请列出当前流年与原局、大运之间命中的干支关系，只解释结构证据',
  '检测到的五合或三合为什么还不能称为合化成功？',
  '请说明当前流年的立春起止和实际大运归属，只讲时间轴事实',
  '哪些流年跨越了交运边界？请列出前后两段时间',
  '请解释我的大运为什么按当前方向排列，只说明规则依据',
  '请解释起运间隔和交运日期是怎样从所取节折算出来的',
  '请解释旺衰证据为什么得到当前标签，不要改写成最终强弱',
  '请解释月令格局候选及为什么仍需复核',
  '请比较月令格局、扶抑和调候三种取用语义',
];

interface DisplayMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  status?: BaziConversationMessage['status'];
}

export default function BaziChatWorkspace({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [conversation, setConversation] = useState<BaziConversationDetail | null>(null);
  const [history, setHistory] = useState<BaziConversationListItem[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState('');
  const sendingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    const response = await fetch('/api/bazi/conversations?status=active&limit=100', { cache: 'no-store' });
    const data = await response.json() as { conversations?: BaziConversationListItem[] };
    if (response.ok) setHistory(data.conversations ?? []);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`/api/bazi/conversations/${conversationId}`, { cache: 'no-store', signal: controller.signal }),
      fetch('/api/bazi/conversations?status=active&limit=100', { cache: 'no-store', signal: controller.signal }),
    ]).then(async ([detailResponse, historyResponse]) => {
      const detail = await detailResponse.json() as { conversation?: BaziConversationDetail; messages?: BaziConversationMessage[]; error?: string };
      const historyData = await historyResponse.json() as { conversations?: BaziConversationListItem[] };
      if (!detailResponse.ok || !detail.conversation) throw new Error(detail.error || '八字会话加载失败');
      setConversation(detail.conversation);
      setMessages((detail.messages ?? []).filter(message => message.role !== 'system' && Boolean(message.content)).map(message => ({
        id: message.id,
        role: message.role as 'user' | 'assistant',
        content: message.content,
        status: message.status,
      })));
      if (historyResponse.ok) setHistory(historyData.conversations ?? []);
    }).catch(loadError => {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '八字会话加载失败');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (raw: string, source: 'question' | 'quick_prompt' = 'question') => {
    const content = raw.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    setInput('');
    setMessages(previous => [...previous, { role: 'user', content }, { role: 'assistant', content: '', status: 'streaming' }]);
    try {
      const response = await fetch(`/api/bazi/conversations/${conversationId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, source }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || '八字解读失败');
      }
      if (!response.body) throw new Error('未收到模型响应');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;
          answer += (JSON.parse(data) as { delta?: { text?: string } }).delta?.text ?? '';
          setMessages(previous => {
            const next = [...previous];
            next[next.length - 1] = { role: 'assistant', content: answer, status: 'streaming' };
            return next;
          });
        }
      }
      setMessages(previous => {
        const next = [...previous];
        next[next.length - 1] = { role: 'assistant', content: answer, status: 'completed' };
        return next;
      });
      await loadHistory();
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : '八字解读失败';
      setMessages(previous => {
        const next = [...previous];
        next[next.length - 1] = { role: 'assistant', content: `解读暂时不可用：${message}`, status: 'failed' };
        return next;
      });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const createNew = async () => {
    if (!conversation || sending) return;
    const response = await fetch('/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: conversation.chartVersionId, forceNew: true }),
    });
    const data = await response.json() as { conversation?: BaziConversationDetail; error?: string };
    if (!response.ok || !data.conversation) return setError(data.error || '新会话创建失败');
    router.push(`/bazi/chat/${data.conversation.id}`);
  };

  const removeConversation = async (item: BaziConversationListItem) => {
    if (!window.confirm(`确定删除会话“${item.title}”吗？消息和上下文记录也会一并删除。`)) return;
    const response = await fetch(`/api/bazi/conversations/${item.id}`, { method: 'DELETE' });
    if (!response.ok) return setError('八字会话删除失败');
    const remaining = history.filter(value => value.id !== item.id);
    setHistory(remaining);
    if (item.id === conversationId) router.push(remaining[0] ? `/bazi/chat/${remaining[0].id}` : '/bazi');
  };

  if (loading) return <PageState text="正在恢复八字会话与消息…" />;
  if (!conversation) return <PageState text={error || '八字会话不存在'} error />;
  const result = conversation.chart.result;
  const analysis = conversation.analysis?.result ?? null;
  const luckCycles = conversation.luckCycles?.result ?? null;
  const annualTimeline = conversation.annualTimeline?.result ?? null;
  const relationAudit = conversation.relationAudit?.result ?? null;
  const pillars = [result.pillars.year, result.pillars.month, result.pillars.day, result.pillars.time];

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden" style={{ color: 'var(--tx-1)', background: 'var(--bg-0)' }}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-3 md:px-5" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className="btn-ghost !px-3 !py-2" onClick={() => router.push('/bazi')}><ArrowLeft size={16} /> 返回排盘</button>
          <button type="button" aria-label="收起或展开会话历史" className="btn-ghost !px-3 !py-2" onClick={() => setSidebarOpen(value => !value)}>{sidebarOpen ? <X size={16} /> : <List size={16} />}</button>
          <div className="hidden min-w-0 sm:block"><h1 className="truncate text-sm font-semibold">{conversation.title}</h1><p className="truncate text-[10px]" style={{ color: 'var(--tx-3)' }}>{conversation.profile.displayName} · {pillars.filter(Boolean).map(item => item!.ganZhi).join(' ')}</p></div>
        </div>
        <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--lu)' }}><ShieldCheck size={15} weight="fill" /> 排盘事实隔离模式</div>
      </header>

      <div className={`grid min-h-0 flex-1 ${sidebarOpen ? 'lg:grid-cols-[260px_minmax(0,1fr)]' : 'lg:grid-cols-[54px_minmax(0,1fr)]'}`}>
        <aside className={`${sidebarOpen ? 'block' : 'hidden lg:block'} min-h-0 overflow-hidden border-r`} style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          {sidebarOpen ? <div className="flex h-full min-h-0 flex-col p-3">
            <button type="button" onClick={() => void createNew()} className="btn-accent mb-3 w-full justify-center !py-2.5"><Plus size={15} /> 新建本版本会话</button>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {history.map(item => <div key={item.id} className="group flex rounded-lg border" style={{ borderColor: item.id === conversationId ? 'var(--ac-bdr)' : 'var(--bdr)', background: item.id === conversationId ? 'var(--ac-bg)' : 'var(--bg-1)' }}>
                <button type="button" className="min-w-0 flex-1 px-3 py-2.5 text-left" onClick={() => router.push(`/bazi/chat/${item.id}`)}><span className="block truncate text-xs font-medium">{item.title}</span><span className="mt-1 block truncate text-[9px]" style={{ color: 'var(--tx-3)' }}>{item.pillars} · {item.messageCount} 条消息</span><span className="mt-1 block truncate text-[9px]" style={{ color: 'var(--tx-3)' }}>{item.lastMessagePreview || '尚未开始对话'}</span></button>
                <button type="button" aria-label="删除会话" onClick={() => void removeConversation(item)} className="px-2 opacity-40 hover:opacity-100" style={{ color: 'var(--ji)' }}><Trash size={13} /></button>
              </div>)}
            </div>
          </div> : <div className="flex h-full justify-center pt-4"><ChatCircleDots size={20} style={{ color: 'var(--ac-dim)' }} /></div>}
        </aside>

        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)] xl:grid-rows-1">
          <aside className="max-h-56 overflow-y-auto border-b p-4 xl:max-h-none xl:border-b-0 xl:border-r" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
            <div className="flex items-center gap-2"><ShieldCheck size={17} style={{ color: 'var(--ac-dim)' }} /><h2 className="text-sm font-semibold">本次固定事实</h2></div>
            <div className="mt-4 grid grid-cols-4 gap-2 xl:grid-cols-2">
              {pillars.map((pillar, index) => <div key={index} className="rounded-lg border p-2 text-center" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}><div className="text-[9px]" style={{ color: 'var(--tx-3)' }}>{pillar?.label ?? '时柱'}</div><div className="mt-1 font-serif text-lg">{pillar?.ganZhi ?? '未知'}</div></div>)}
            </div>
            <div className="mt-4 space-y-2 text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>
              <p>日主：<span style={{ color: 'var(--tx-1)' }}>{result.dayMaster.stem}（{result.dayMaster.element}）</span></p>
              <p>时间口径：{result.effectiveTime.standard === 'civil_time' ? '民用时间' : '地方视太阳时'} · {result.input.lateZiPolicy === 'same_day' ? '晚子按当天' : '晚子按次日'}</p>
              <p>版本：{conversation.methodologyVersion} / {conversation.engineVersion}</p>
              {analysis && <>
                <p>旺衰证据：<span style={{ color: 'var(--tx-1)' }}>{analysis.strength.label}</span></p>
                <p>格局候选：<span style={{ color: 'var(--tx-1)' }}>{analysis.pattern.candidates.map(item => item.label).join('、') || '无'}</span></p>
                <p>证据版本：{analysis.methodologyVersion}</p>
              </>}
              {luckCycles && <>
                <p>大运顺逆：<span style={{ color: 'var(--tx-1)' }}>{luckCycles.direction.label}</span></p>
                <p>交运时刻：<span style={{ color: 'var(--tx-1)' }}>{luckCycles.startAt ?? '条件不足，未生成'}</span></p>
                <p>大运版本：{luckCycles.methodologyVersion}</p>
              </>}
              {annualTimeline && <>
                <p>流年范围：<span style={{ color: 'var(--tx-1)' }}>{annualTimeline.range.startYear}—{annualTimeline.range.endYear}</span></p>
                <p>跨运流年：<span style={{ color: 'var(--tx-1)' }}>{annualTimeline.years.filter(item => item.crossesLuckCycleBoundary).map(item => item.year).join('、') || '未生成'}</span></p>
                <p>流年版本：{annualTimeline.methodologyVersion}</p>
              </>}
              {relationAudit && <>
                <p>关系审计：<span style={{ color: 'var(--tx-1)' }}>{relationAudit.status === 'complete' ? '三层证据已建立' : '降级证据模式'}</span></p>
                <p>关系版本：{relationAudit.methodologyVersion}</p>
              </>}
            </div>
            <div className="mt-4 rounded-lg border p-3 text-[10px] leading-5" style={{ borderColor: 'rgba(180,125,35,.25)', color: 'var(--tx-3)', background: 'rgba(180,125,35,.06)' }}>当前可解释旺衰证据、格局候选、排期事实和干支关系证据，但不裁决合化、解冲、力量大小、最终用神、大运或流年吉凶、具体事件。</div>
          </aside>

          <div className="flex min-h-0 flex-col overflow-hidden" style={{ background: 'var(--bg-card)' }}>
            <div className="shrink-0 overflow-x-auto border-b px-3 py-2" style={{ borderColor: 'var(--bdr)' }}><div className="flex min-w-max gap-2">{QUICK_PROMPTS.map(prompt => <button key={prompt} type="button" disabled={sending} onClick={() => void sendMessage(prompt, 'quick_prompt')} className="rounded-lg border px-3 py-1.5 text-[10px] disabled:opacity-40" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>{prompt}</button>)}</div></div>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 md:px-8">
              {messages.length === 0 && <div className="flex h-full flex-col items-center justify-center text-center"><ChatCircleDots size={42} className="mb-4 opacity-20" /><h2 className="text-base font-semibold">从这份已保存的规则快照开始解读</h2><p className="mt-2 max-w-md text-xs leading-6" style={{ color: 'var(--tx-3)' }}>可以询问四柱、证据审计、大运与流年排期，以及指定年份命中的跨层干支关系。消息会保存在本地，刷新后仍可继续。</p></div>}
              {messages.map((message, index) => message.role === 'user'
                ? <div key={message.id ?? index} className="flex justify-end"><div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6" style={{ color: 'var(--ac)', background: 'var(--ac-bg)', border: '1px solid var(--ac-bdr)' }}>{message.content}</div></div>
                : <div key={message.id ?? index} className="max-w-3xl"><div className="mb-2 flex items-center gap-2 text-[10px] tracking-wider" style={{ color: 'var(--ac-dim)' }}><ShieldCheck size={13} /> 八字基础解读</div><AiContent text={message.content} streaming={sending && index === messages.length - 1} /></div>)}
            </div>
            <div className="shrink-0 border-t p-3 md:px-6" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
              {error && <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--ji)' }}>{error}</p>}
              <div className="mx-auto flex max-w-4xl items-end gap-2"><textarea rows={2} value={input} disabled={sending} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(input); } }} placeholder="询问这份八字基础盘…" className="min-h-[54px] flex-1 resize-none rounded-xl border px-4 py-3 text-sm outline-none disabled:opacity-60" style={{ color: 'var(--tx-1)', borderColor: 'var(--bdr)', background: 'var(--bg-1)' }} /><button type="button" aria-label="发送消息" disabled={sending || !input.trim()} onClick={() => void sendMessage(input)} className="flex h-[54px] w-12 items-center justify-center rounded-xl disabled:opacity-30" style={{ color: 'var(--ac)', border: '1px solid var(--ac-bdr)', background: 'var(--ac-bg)' }}>{sending ? '…' : <PaperPlaneTilt size={18} weight="fill" />}</button></div>
              <p className="mt-1.5 text-center text-[9px]" style={{ color: 'var(--tx-3)' }}>本地保存 · 自动压缩 · 干支关系可追溯 · 不裁决合化及运势结论</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function AiContent({ text, streaming }: { text: string; streaming: boolean }) {
  return <div className="space-y-1 text-sm leading-7" style={{ color: 'var(--tx-2)' }}>{text.split('\n').map((line, index) => {
    const section = line.match(/^(?:\*\*)?【(.+?)】(?:\*\*)?$/);
    if (section) return <h3 key={index} className="pt-3 text-xs font-semibold tracking-wide first:pt-0" style={{ color: 'var(--ac-dim)' }}>【{section[1]}】</h3>;
    if (!line.trim()) return <div key={index} className="h-1" />;
    return <p key={index}>{line.replace(/\*\*/g, '')}</p>;
  })}{streaming && <span className="inline-block h-3 w-1.5 animate-pulse rounded-sm" style={{ background: 'var(--ac-dim)' }} />}</div>;
}

function PageState({ text, error = false }: { text: string; error?: boolean }) {
  return <main className="flex min-h-[100dvh] items-center justify-center p-6" style={{ color: error ? 'var(--ji)' : 'var(--tx-3)', background: 'var(--bg-0)' }}>{text}</main>;
}
