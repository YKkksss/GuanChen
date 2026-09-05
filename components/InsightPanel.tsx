'use client';
import { forwardRef, useImperativeHandle, useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChatCircleDots, PaperPlaneTilt, Sparkle } from '@phosphor-icons/react';
import type { ConversationChat } from '@/lib/ui/use-conversation-chat';
import { ChatRecoveryActions, ChatGenerationControls } from './ChatRecoveryActions';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';
import { useSmartChatScroll } from '@/lib/ui/use-smart-chat-scroll';
import { shouldSendChatMessage } from '@/lib/client/chat-keyboard';
import ChatScrollToLatestButton from './ChatScrollToLatestButton';
import ContextMemoryPanel from './ContextMemoryPanel';
import LifeEventCandidateInbox from './LifeEventCandidateInbox';
import type { TimeView } from './TimeNav';

interface SelectedSiHua {
  starName: string;
  siHua: string;
  view: TimeView;
}

interface InsightPanelProps {
  chart: ZiweiChart;
  conversationId: string;
  chat: ConversationChat;
  onLoadingChange?: (loading: boolean) => void;
  selectedSiHua?: SelectedSiHua | null;
  transitContext?: { level: 'year' | 'month' | 'day'; targetDate: string; label?: string } | null;
  autoGenerate?: boolean;
  readingControls?: ReactNode;
}

interface SendOptions {
  hidden?: boolean;
  source?: 'question' | 'topic' | 'palace' | 'sihua' | 'auto';
  topic?: string;
  palaceBranch?: number;
  sihuaType?: string;
}

const TOPICS = [
  { key: 'overview',     label: '命格' },
  { key: 'love',        label: '感情' },
  { key: 'career',      label: '事业' },
  { key: 'wealth',      label: '财运' },
  { key: 'health',      label: '健康' },
  { key: 'personality', label: '性格' },
] as const;

const TOPIC_PROMPTS: Record<string, string> = {
  overview: `请生成命格总览，按以下结构输出：

**【命格定性】**
用一句话概括这个命盘的核心格局与命主气质。

**【主星解读】**
命宫主星的核心特质，引用倪海夏原话或观点。

**【三方四正】**
财、官、迁三宫的联动分析及整体格局。

**【当前大限】**
当下大限运势方向与最值得关注的事项。

**【优势与注意】**
命盘天赋优势，以及需要注意的风险或功课。`,

  love: `请深度分析感情婚姻运，按以下结构输出：

**【感情格局】**
一句话定性感情命格。

**【夫妻宫分析】**
夫妻宫主星、四化，以及倪海夏体系的具体解读。

**【三方联动】**
相关宫位对感情的影响。

**【当前大限感情运】**
当下10年感情走向与关键节点。

**【实际建议】**
具体可行的感情建议。`,

  career: `请深度分析事业运，按以下结构输出：

**【事业格局】**
一句话定性事业命格，宜任职或宜创业。

**【官禄宫分析】**
官禄宫主星、四化，以及倪师对这种配置的判断。

**【财帛宫联动】**
财运与事业的关系，财路来源分析。

**【当前大限事业运】**
当下10年事业走向。

**【实际建议】**
适合的方向、行业与策略。`,

  wealth: `请深度分析财运，按以下结构输出：

**【财运格局】**
一句话定性财运模式，是主动财还是被动财。

**【财帛宫分析】**
财帛宫主星、四化，财富来源与流动模式。

**【田宅宫（财库）】**
积蓄能力与不动产运势分析。

**【当前大限财运】**
当下财运走向与注意事项。

**【理财建议】**
具体的财务建议。`,

  health: `请分析健康运势，按以下结构输出：

**【疾厄宫主星】**
疾厄宫星曜与健康含义。

**【主要风险】**
结合倪海夏子午流注理论，分析主要健康隐患与需关注的部位。

**【大限健康走势】**
当下健康趋势与关键时间段。

**【预防建议】**
具体注意事项与养生方向。`,

  personality: `请深度解析性格特质，按以下结构输出：

**【命宫主星性格】**
命宫主星的核心性格特质，引用倪师原话。

**【三方性格综合】**
财、官、迁三宫对性格的影响，全貌描绘。

**【人际关系模式】**
与他人互动方式、待人处世风格。

**【优势与人生课题】**
天赋优势，以及需要面对的人生功课。`,
};

const PALACE_ROLES: Record<string, string> = {
  '命宫':   '自我、性格、先天格局',
  '兄弟宫': '兄弟关系、合伙人',
  '夫妻宫': '感情关系、婚姻状态',
  '子女宫': '子女缘分、下属关系',
  '财帛宫': '财运来源、收入方式',
  '疾厄宫': '身体健康、意外',
  '迁移宫': '外出机遇、人际格局',
  '交友宫': '朋友圈、贵人、小人',
  '官禄宫': '事业成就、社会地位',
  '田宅宫': '不动产、家庭环境',
  '福德宫': '精神享受、内心福分',
  '父母宫': '父母关系、文书契约',
};

/** Render AI markdown: **【Title】** → gold header, **bold** → strong */
function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n');
  return (
    <div className="eastern-ai-content">
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sectionMatch) {
          return (
            <div key={i} className="eastern-ai-section">
              <span>
                【{sectionMatch[1]}】
              </span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="eastern-ai-spacer" />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={i} className="eastern-ai-line">
            {parts.map((part, j) =>
              j % 2 === 0
                ? part
                : <strong key={j}>{part}</strong>
            )}
          </div>
        );
      })}
      {streaming && (
        <span
          className="inline-block w-1.5 h-3 ml-0.5 animate-pulse rounded-sm align-middle"
          style={{ background: 'var(--t-gold)', opacity: 0.6 }}
        />
      )}
    </div>
  );
}

export interface InsightPanelHandle {
  analyzePalace: (palace: Palace) => boolean;
}

const InsightPanel = forwardRef<InsightPanelHandle, InsightPanelProps>(function InsightPanel({
  chart,
  conversationId,
  chat,
  onLoadingChange,
  selectedSiHua,
  transitContext,
  autoGenerate = true,
  readingControls,
}: InsightPanelProps, ref) {
  const { messages, input, busy: loading } = chat;
  const setInput = chat.session.setInput;
  const [activeTopic, setActiveTopic] = useState<string>('overview');
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const autoLoaded = useRef(false);
  const lastSiHuaKey = useRef<string | undefined>(undefined);
  const {
    scrollRef,
    showLatestButton,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleKeyDown,
    scrollToLatest,
  } = useSmartChatScroll<HTMLDivElement>(messages);

  useEffect(() => { onLoadingChange?.(loading); }, [loading, onLoadingChange]);

  // Auto-generate 命格总览 on mount
  useEffect(() => {
    if (!chat.ready || autoLoaded.current) return;
    autoLoaded.current = true;
    if (autoGenerate && messages.length === 0) {
      sendMessage(TOPIC_PROMPTS.overview, { hidden: true, source: 'auto', topic: 'overview' });
    }
  }, [chat.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // 宫位分析只能由明确的用户操作触发，选中状态本身不发送请求。
  const analyzePalace = (selectedPalace: Palace) => {
    if (loading) return false;
    const majorStars = selectedPalace.stars.filter(s => s.type === 'major');
    const starDesc = majorStars.length > 0
      ? majorStars.map(s => `${s.name}${s.siHua ? '化' + s.siHua : ''}`).join('、')
      : '空宫（借对宫）';
    const palaceName = selectedPalace.name === '仆役' ? '交友宫' : selectedPalace.name.endsWith('宫') ? selectedPalace.name : `${selectedPalace.name}宫`;
    const role = PALACE_ROLES[palaceName] ?? '结合命盘结构判断';

    const prompt = `请重点分析【${selectedPalace.name}】（主管：${role}），该宫主星为${starDesc}，按以下结构输出：

**【宫位定性】**
${selectedPalace.name}在命盘中的意义，以及这种星曜配置的整体判断。

**【主星解读】**
主星在此宫的倪海夏体系解读，引用具体观点。

**【三方四正联动】**
三方四正宫位对此宫的影响。

**【实际建议】**
基于此宫的具体建议。`;

    return sendMessage(prompt, { hidden: true, source: 'palace', palaceBranch: selectedPalace.branch });
  };
  useImperativeHandle(ref, () => ({ analyzePalace }));

  // 注入四化飞化分析
  useEffect(() => {
    if (!selectedSiHua) return;
    const key = `${selectedSiHua.starName}-${selectedSiHua.siHua}-${selectedSiHua.view}`;
    if (key === lastSiHuaKey.current) return;
    lastSiHuaKey.current = key;

    // 找出该星所在宫位
    const palaceOfStar = chart.palaces.find(p =>
      p.stars.some(s => s.name === selectedSiHua.starName)
    );
    const palaceName = palaceOfStar?.name ?? '未知宫位';
    const viewLabel = selectedSiHua.view === 'daxian' ? '大限' : '流年';

    const prompt = `请分析【${viewLabel}${selectedSiHua.starName}化${selectedSiHua.siHua}】的飞化影响，按以下结构输出：

**【化${selectedSiHua.siHua}基本含义】**
化${selectedSiHua.siHua}在倪海夏体系中的核心含义，以及${selectedSiHua.starName}化${selectedSiHua.siHua}的特殊含义。

**【落宫影响】**
${selectedSiHua.starName}化${selectedSiHua.siHua}落在【${palaceName}】，该宫主管的领域受到何种影响，倪师如何解读。

**【三方四正飞化路径】**
化${selectedSiHua.siHua}入${palaceName}后，对其三方四正（对宫、两个三合宫）的联动影响。

**【当前运势影响】**
在${viewLabel}时间维度下，此化${selectedSiHua.siHua}对命主近期运势的具体影响。

**【实际建议】**
基于此四化的具体可操作建议。`;

    sendMessage(prompt, {
      hidden: true,
      source: 'sihua',
      sihuaType: selectedSiHua.siHua,
    });
  }, [selectedSiHua]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = (text: string, options: SendOptions = {}) => {
    const sent = chat.session.send(text, { ...options, transitLevel: transitContext?.level ?? null, targetDate: transitContext?.targetDate ?? null });
    if (sent) scrollToLatest('auto');
    return sent;
  };

  const handleTopicClick = (topicKey: string) => {
    if (loading) return;
    setActiveTopic(topicKey);
    sendMessage(TOPIC_PROMPTS[topicKey], { hidden: true, source: 'topic', topic: topicKey });
  };

  const handleSend = () => {
    sendMessage(input);
  };

  return (
    <div className="eastern-insight-panel">

      <ContextMemoryPanel
        conversationId={conversationId}
        open={memoryPanelOpen}
        onClose={() => setMemoryPanelOpen(false)}
      />

      {/* ── Chat header ── */}
      <div className="eastern-insight-header">
        <div className="eastern-insight-heading">
          <span className="eastern-insight-icon">
            <ChatCircleDots size={16} weight="fill" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="eastern-insight-title">
              {transitContext ? `${transitContext.label ?? `${transitContext.targetDate} 年`} AI 解读` : 'AI 命理解读'}
            </div>
            {!readingControls && <div className="eastern-insight-subtitle">融合东方智慧与结构化分析</div>}
          </div>
        </div>
        <div className="eastern-insight-status">
          <button
            onClick={() => setMemoryPanelOpen(true)}
            className="eastern-memory-button"
            title="管理对话记忆"
          >
            <Brain size={12} />记忆
          </button>
          {(!readingControls || loading) && <span className={loading ? 'is-loading' : ''}>
            {loading ? '正在生成' : '可以继续追问'}
          </span>}
          {readingControls}
        </div>
      </div>

      {/* ── Topic buttons ── */}
      <div className="eastern-topic-bar">
        <div className="eastern-topic-grid">
          {TOPICS.map(t => {
            const isActive = activeTopic === t.key;
            return (
              <button
                key={t.key}
                onClick={() => handleTopicClick(t.key)}
                disabled={loading}
                className={`eastern-topic-button ${isActive ? 'is-active' : ''}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          role="log"
          aria-label="AI 对话消息"
          aria-live="polite"
          tabIndex={0}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
          onKeyDown={handleKeyDown}
          className="eastern-message-list h-full"
        >

        {/* Loading state before first message */}
        {messages.length === 0 && (
          <div className="eastern-message-empty">
            <Sparkle size={28} weight="duotone" aria-hidden="true" />
            <p>
              {loading ? '命理解读生成中…' : '可从下方输入问题开始分析'}
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            if (msg.role === 'user' && msg.hidden) return null;

            if (msg.role === 'user') {
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div
                    className="eastern-user-message"
                  >
                    {msg.content}
                  </div>
                </motion.div>
              );
            }

            // Assistant message
            const isLastMsg = i === messages.length - 1;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="eastern-assistant-message"
              >
                <div className="eastern-assistant-label">
                  <Sparkle size={12} weight="fill" aria-hidden="true" />
                  命理解读
                </div>
                <AiContent text={msg.content} streaming={loading && isLastMsg} />
                <ChatRecoveryActions message={msg} chat={chat} />
              </motion.div>
            );
          })}
        </AnimatePresence>
        </div>
        <ChatScrollToLatestButton
          visible={showLatestButton}
          loading={loading}
          onClick={() => scrollToLatest('smooth')}
        />
      </div>

      <LifeEventCandidateInbox conversationId={conversationId} compact={Boolean(readingControls)} />
      <ChatGenerationControls chat={chat} />

      {/* ── Input ── */}
      <div className="eastern-chat-composer">
        <div className="eastern-chat-composer-row">
          <textarea
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (shouldSendChatMessage(e)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={transitContext ? `询问${transitContext.label ?? `${transitContext.targetDate} 年`}的事业、感情或财运…` : '继续追问，如：今年适合换工作吗？'}
            disabled={loading}
            className="eastern-chat-input"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            aria-label="发送消息"
            title="发送消息"
            className="eastern-chat-send"
          >
            {loading ? <span className="text-[11px]">…</span> : <PaperPlaneTilt size={17} weight="fill" aria-hidden="true" />}
          </button>
        </div>
        <div className="eastern-chat-hint">
          Enter 发送，Shift + Enter 换行
        </div>
      </div>

    </div>
  );
});

export default InsightPanel;
