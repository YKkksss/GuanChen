'use client';

import { useState } from 'react';
import { useConversationChat } from '@/lib/ui/use-conversation-chat';
import { ChatRecoveryActions, ChatGenerationControls } from './ChatRecoveryActions';
import { Brain, ChatCircleDots, PaperPlaneTilt } from '@phosphor-icons/react';
import { type ConversationMessage } from '@/lib/conversations/types';
import type { RelationshipType } from '@/lib/heming/types';
import { useSmartChatScroll } from '@/lib/ui/use-smart-chat-scroll';
import { shouldSendChatMessage } from '@/lib/client/chat-keyboard';
import ChatScrollToLatestButton from './ChatScrollToLatestButton';
import ContextMemoryPanel from './ContextMemoryPanel';

interface HemingChatPanelProps {
  conversationId: string;
  initialMessages: ConversationMessage[];
  relationshipType: RelationshipType;
  transitYear?: number;
}

const QUICK_PROMPTS: Record<RelationshipType, string[]> = {
  romantic: ['分析双方沟通与情绪节奏', '关系中最需要经营的边界', '哪些结论还需要现实信息确认'],
  business: ['分析职责与决策分工', '梳理财务与资源边界', '合作中最需要预防的摩擦'],
  parent_child: ['分析沟通与照顾方式', '如何设置合适的权威边界', '当前成长阶段应关注什么'],
  manager_report: ['分析管理与反馈方式', '如何明确职责和授权边界', '怎样降低协作摩擦'],
  friendship: ['分析相处节奏与信任边界', '双方如何更好地互相支持', '资源往来要注意什么'],
  custom: ['分析双方互动方式', '当前关系最值得关注什么', '哪些信息需要进一步确认'],
};

const OVERVIEW_PROMPT = `请基于本次合盘的程序事实与规则评估，生成一份合盘总览。请按以下结构回答：

**【关系基线】**
概括双方稳定的互动结构，明确区分甲方与乙方。

**【支持性结构】**
说明可以利用的协同点，并标注它们仍需现实验证。

**【重点经营】**
说明容易出现摩擦的差异与可执行的沟通、边界建议。

**【阶段影响】**
把本命关系基线与当前阶段影响分开表达。

**【待确认信息】**
列出会显著影响判断、但当前尚未确认的现实信息。

不要输出匹配分数，不替用户作出婚姻、合作、医疗或财务决定。`;

function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className="space-y-0.5">
      {text.split('\n').map((line, index) => {
        const section = line.match(/^\*\*【(.+?)】\*\*$/);
        if (section) {
          return <div key={index} className="pt-3 pb-0.5 first:pt-0 text-[11px] font-semibold tracking-wide" style={{ color: 'var(--t-gold)' }}>【{section[1]}】</div>;
        }
        if (!line.trim()) return <div key={index} className="h-1" />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={index} className="text-[11px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>
            {parts.map((part, partIndex) => partIndex % 2
              ? <strong key={partIndex} className="font-medium" style={{ color: 'var(--t-text)' }}>{part}</strong>
              : part)}
          </div>
        );
      })}
      {streaming && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse rounded-sm align-middle" style={{ background: 'var(--t-gold)' }} />}
    </div>
  );
}

export default function HemingChatPanel({
  conversationId,
  initialMessages,
  relationshipType,
  transitYear,
}: HemingChatPanelProps) {
  const chat = useConversationChat(conversationId, 'ziwei', initialMessages);
  const { messages, input, busy: loading } = chat;
  const setInput = chat.session.setInput;
  const [memoryOpen, setMemoryOpen] = useState(false);
  const {
    scrollRef,
    showLatestButton,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleKeyDown,
    scrollToLatest,
  } = useSmartChatScroll<HTMLDivElement>(messages);

  function sendMessage(text: string, options: { hidden?: boolean; source?: 'question' | 'topic' | 'auto' } = {}) {
    const source = options.source ?? 'question';
    if (chat.session.send(text, { ...options, source, topic: source === 'auto' ? 'heming_overview' : transitYear ? 'heming_transit' : null,
      transitLevel: transitYear ? 'year' : null, targetDate: transitYear ? String(transitYear) : null })) scrollToLatest('auto');
  }

  const visibleCount = messages.filter(message => !message.hidden).length;

  return (
    <div className="relative flex h-[70dvh] min-h-[540px] flex-col overflow-hidden rounded-xl card-glass lg:h-[clamp(580px,calc(100dvh-7rem),860px)] lg:min-h-0">
      <ContextMemoryPanel conversationId={conversationId} open={memoryOpen} onClose={() => setMemoryOpen(false)} />

      <div className="flex shrink-0 items-center justify-between gap-3 px-3.5 py-3" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ color: 'var(--t-gold)', background: 'rgba(212,168,67,.10)' }}><ChatCircleDots size={16} weight="fill" /></span>
          <div><div className="text-[12px] font-medium" style={{ color: 'var(--t-text)' }}>{transitYear ? `${transitYear} 年双人运限对话` : 'AI 合盘对话'}</div><div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>消息、摘要与记忆自动保存</div></div>
        </div>
        <button onClick={() => setMemoryOpen(true)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[9px]" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}><Brain size={12} />记忆</button>
      </div>

      <div className="shrink-0 overflow-x-auto px-2 py-2" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div className="flex min-w-max gap-1.5">
          {(transitYear ? [
            `分析 ${transitYear} 年双方节奏是否同步`,
            `解释 ${transitYear} 年被共同激活的关系主题`,
            `这一年双方分别应注意哪些现实边界`,
          ] : QUICK_PROMPTS[relationshipType]).map(prompt => (
            <button key={prompt} disabled={loading} onClick={() => sendMessage(prompt, { hidden: true, source: 'topic' })} className="rounded-lg px-2.5 py-1.5 text-[9px] disabled:opacity-40" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>{prompt}</button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          role="log"
          aria-label="AI 合盘对话消息"
          aria-live="polite"
          tabIndex={0}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
          onKeyDown={handleKeyDown}
          className="h-full space-y-4 overflow-y-auto overscroll-contain p-4"
        >
        {visibleCount === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center">
            <div className="mb-3 text-4xl opacity-10" style={{ color: 'var(--t-gold)' }}>☯</div>
            <p className="mb-5 text-[10px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>双命盘事实和规则结果已就绪。生成总览后，后续追问会持续使用同一份关系背景与对话记忆。</p>
            <button disabled={loading} onClick={() => sendMessage(OVERVIEW_PROMPT, { hidden: true, source: 'auto' })} className="rounded-full px-5 py-2 text-[11px] font-medium disabled:opacity-40" style={{ color: '#fffaf3', background: 'var(--ac)' }}>{loading ? '正在生成…' : '生成合盘总览'}</button>
          </div>
        )}
        {messages.map((message, index) => {
          if (message.hidden) return null;
          if (message.role === 'user') return (
            <div key={message.id ?? index} className="flex justify-end"><div className="max-w-[86%] rounded-xl px-3 py-2 text-[11px] leading-relaxed" style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.18)', background: 'rgba(212,168,67,.08)' }}>{message.content}</div></div>
          );
          return (
            <div key={message.id ?? index}>
              <div className="mb-2 text-[9px] tracking-widest" style={{ color: 'var(--t-faint)' }}>✦ 合盘解读</div>
              <AiContent text={message.content} streaming={loading && index === messages.length - 1} />
              <ChatRecoveryActions message={message} chat={chat} />
            </div>
          );
        })}
        </div>
        <ChatScrollToLatestButton
          visible={showLatestButton}
          loading={loading}
          onClick={() => scrollToLatest('smooth')}
        />
      </div>

      <ChatGenerationControls chat={chat} />
      <div className="shrink-0 px-3 pb-3 pt-2.5" style={{ borderTop: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
        <div className="flex items-end gap-2">
          <textarea rows={2} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (shouldSendChatMessage(event)) { event.preventDefault(); sendMessage(input); } }} disabled={loading} placeholder="继续追问双方的沟通、边界或阶段影响…" className="min-h-[52px] flex-1 resize-none rounded-lg px-3 py-2 text-[11px] leading-relaxed outline-none disabled:opacity-60" style={{ color: 'var(--t-text)', border: '1px solid var(--t-border)', background: 'var(--t-card)' }} />
          <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} aria-label="发送消息" className="flex h-[52px] w-11 items-center justify-center rounded-lg disabled:opacity-30" style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.25)', background: 'rgba(212,168,67,.15)' }}>{loading ? '…' : <PaperPlaneTilt size={17} weight="fill" />}</button>
        </div>
        <div className="mt-1.5 text-[9px]" style={{ color: 'var(--t-faint)' }}>Enter 发送，Shift + Enter 换行</div>
      </div>
    </div>
  );
}
