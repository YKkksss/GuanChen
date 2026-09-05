'use client';
import AiMarkdown from './AiMarkdown';

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
import { useCallback, useEffect, useState } from 'react';
import { useConversationChat } from '@/lib/ui/use-conversation-chat';
import { ChatRecoveryActions, ChatGenerationControls } from './ChatRecoveryActions';
import { useRouter } from 'next/navigation';
import type {
  BaziConversationDetail,
  BaziConversationListItem,
  BaziConversationMessage,
} from '@/lib/bazi/conversation-types';
import { useSmartChatScroll } from '@/lib/ui/use-smart-chat-scroll';
import { shouldSendChatMessage } from '@/lib/client/chat-keyboard';
import ChatScrollToLatestButton from './ChatScrollToLatestButton';

const QUICK_PROMPTS = [
  '请按精确片段比较今天各格局检查的静态状态、岁运既有角色和流月流日新增角色，不判断成格破格',
  '今天哪些成格支持、破格风险或救应候选命中了流月流日表层角色？只讲映射入口',
  '请列出今天与格局规则相关的五合、月支关系和藏干触达上下文，并说明为什么不能称救应完成',
  '请按精确片段比较今天的大运流年既有方向、流月流日新增方向和五层合并方向，不判断最终旺衰',
  '今天的流月流日表层方向与既有岁运是同向、异向还是并见？请逐项列出表层证据',
  '请把今天的藏干位置、日主根气和月令触达单列为条件上下文，并解释为什么不能计入旺衰方向',
  '请列出今天由流月或流日参与的同干和同十神重复簇，区分表层、藏干与日主参照',
  '今天哪些藏干满足流月流日参与的完全同干透出条件？不要判断是否有效',
  '请比较今天的严格同干根候选和仅同五行支持，为什么不能据此判断强弱？',
  '今天哪些藏干被流月流日的同干表层、同支重复或冲合刑害触达？只讲入口证据',
  '请按精确时间片段解释今天的原局、大运、流年、流月、流日五层关系，只讲证据',
  '今天的流月和流日分别是什么十神角色？藏干也请分开列出，不要映射现实事件',
  '今天有哪些三合、三会或三刑缺一候选？为什么不能称完整关系？',
  '今天哪些流月流日关系存在并见？不要判断哪一种关系优先',
  '请列出当前流年的十二流月干支和精确节界，只讲时间轴事实',
  '请说明今天的流日干支、起止时刻、所属流月和大运，不要推断吉凶',
  '为什么八字流月不能直接按公历每月一日切换？',
  '如果某个流日跨越节界或交运时刻，请逐段解释它的时间归属',
  '请按成格支持、破格风险、救应候选三列解释我的月令格局候选，不要下成格或破格结论',
  '哪些格局条件只在藏干出现而没有透到表层？为什么不能算条件齐备？',
  '当前有哪些救应候选与具体风险相连接？为什么五合位置不等于已经救应？',
  '请比较当前年份 M9-3 静态基线与岁运表层方向，只讲同向、异向或并见，不判断身强身弱',
  '请按生扶、泄耗制、条件上下文三列解释当前年份的综合证据矩阵',
  '当前年份月令命中了哪些触达条件？为什么不能据此说月令增强、受损或失效？',
  '请列出当前年份哪些藏干命中了岁运表层同干、同支重复或明确关系触达，只讲条件证据',
  '请比较当前年份藏干的单类触达与多类触达并见，为什么仍不能说已经发动？',
  '哪些藏干所在支参与了冲合刑害证据？请同时说明 M9-7 条件状态',
  '请列出当前年份哪些藏干满足完全同干的透出条件，区分月令藏干和一般藏干',
  '请比较当前年份的严格同干根、仅同五行支持和坐支同干位置，不判断强弱',
  '为什么透出条件匹配仍然不能说透干有效，严格同干根也不能直接说根气有力？',
  '请列出当前年份同干和同十神的重复位置，区分表层、藏干和日主参照',
  '哪些重复簇有 M9-6 表层关系证据连接？这和力量增强有什么区别？',
  '为什么表层与藏干出现同一个字，仍然不能直接说透干或通根？',
  '请解释当前年份大运和流年的表层天干、藏干分别是什么十神，只讲角色证据',
  '当前年份的动态干支通过哪些关系证据指向原局哪些柱位？不要推断事件',
  '为什么地支里有某个藏干，仍然不能说它已经透出或引动？',
  '请解释当前年份哪些关系条件齐备、缺失或存在关系并见，不要判断合化和优先级',
  '为什么“可核验条件齐备”仍然不能直接说合化成功？',
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

export default function BaziChatWorkspace({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [conversation, setConversation] = useState<BaziConversationDetail | null>(null);
  const [history, setHistory] = useState<BaziConversationListItem[]>([]);
  const chat = useConversationChat(conversationId, 'bazi');
  const { messages, input, busy: sending } = chat;
  const setInput = chat.session.setInput;
  const hydrateChat = chat.session.hydrate;
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState('');
  const {
    scrollRef,
    showLatestButton,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleKeyDown,
    scrollToLatest,
  } = useSmartChatScroll<HTMLDivElement>(messages);

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
      if (controller.signal.aborted) return;
      setConversation(detail.conversation);
      hydrateChat(detail.messages ?? []);
      if (historyResponse.ok) setHistory(historyData.conversations ?? []);
    }).catch(loadError => {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '八字会话加载失败');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [conversationId, hydrateChat]);

  useEffect(() => {
    const refreshHistory = () => { void loadHistory(); };
    window.addEventListener('conversation-updated', refreshHistory);
    return () => window.removeEventListener('conversation-updated', refreshHistory);
  }, [loadHistory]);

  const sendMessage = (raw: string, source: 'question' | 'quick_prompt' = 'question') => {
    if (chat.session.send(raw, { source })) scrollToLatest('auto');
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
  const relationAdjudication = conversation.relationAdjudication?.result ?? null;
  const dynamicTenGod = conversation.dynamicTenGod?.result ?? null;
  const tenGodRepeat = conversation.tenGodRepeat?.result ?? null;
  const transparencyRoot = conversation.transparencyRoot?.result ?? null;
  const hiddenStemActivation = conversation.hiddenStemActivation?.result ?? null;
  const strengthComposite = conversation.strengthComposite?.result ?? null;
  const patternCondition = conversation.patternCondition?.result ?? null;
  const monthDayTimeline = conversation.monthDayTimeline?.result ?? null;
  const monthDayRelation = conversation.monthDayRelation?.result ?? null;
  const monthDayVisibility = conversation.monthDayVisibility?.result ?? null;
  const monthDayStrength = conversation.monthDayStrength?.result ?? null;
  const monthDayPattern = conversation.monthDayPattern?.result ?? null;
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
              {relationAdjudication && <>
                <p>条件裁决：<span style={{ color: 'var(--tx-1)' }}>齐备／缺失／并见／暂缓</span></p>
                <p>裁决版本：{relationAdjudication.methodologyVersion}</p>
              </>}
              {dynamicTenGod && <>
                <p>动态十神：<span style={{ color: 'var(--tx-1)' }}>表层／藏干角色已建立</span></p>
                <p>方向口径：<span style={{ color: 'var(--tx-1)' }}>只绑定原局关系证据</span></p>
                <p>十神版本：{dynamicTenGod.methodologyVersion}</p>
              </>}
              {monthDayTimeline && <>
                <p>流月流日：<span style={{ color: 'var(--tx-1)' }}>{monthDayTimeline.source.targetYear} 年 · {monthDayTimeline.counts.months} 月 / {monthDayTimeline.counts.days} 日</span></p>
                <p>换日口径：<span style={{ color: 'var(--tx-1)' }}>{monthDayTimeline.source.lateZiPolicy === 'next_day' ? '23 点起按次日' : '23 点仍按当天'}</span></p>
                <p>流月流日版本：{monthDayTimeline.methodologyVersion}</p>
              </>}
              {monthDayRelation && <>
                <p>五层审计日期：<span style={{ color: 'var(--tx-1)' }}>{monthDayRelation.target.effectiveDate} · {monthDayRelation.target.dayGanZhi ?? '未生成'}</span></p>
                <p>关系与角色：<span style={{ color: 'var(--tx-1)' }}>{monthDayRelation.counts.evidence} 条关系 / {monthDayRelation.counts.roles} 个角色</span></p>
                <p>五层审计版本：{monthDayRelation.methodologyVersion}</p>
              </>}
              {monthDayVisibility && <>
                <p>流日显隐条件：<span style={{ color: 'var(--tx-1)' }}>{monthDayVisibility.counts.stemClusters} 个同干簇 / {monthDayVisibility.counts.transparencyMatched} 个透出匹配</span></p>
                <p>根与触达：<span style={{ color: 'var(--tx-1)' }}>{monthDayVisibility.counts.exactSameStemRoots} 个严格同干根候选 / {monthDayVisibility.counts.touchedHiddenStems} 个藏干触达</span></p>
                <p>流日条件版本：{monthDayVisibility.methodologyVersion}</p>
              </>}
              {monthDayStrength && <>
                <p>流日方向矩阵：<span style={{ color: 'var(--tx-1)' }}>{monthDayStrength.target.effectiveDate} · {monthDayStrength.target.segmentCount} 个精确片段</span></p>
                <p>比较口径：<span style={{ color: 'var(--tx-1)' }}>岁运既有／流月流日新增／五层合并</span></p>
                <p>流日矩阵版本：{monthDayStrength.methodologyVersion}</p>
              </>}
              {monthDayPattern && <>
                <p>流日格局映射：<span style={{ color: 'var(--tx-1)' }}>{monthDayPattern.target.effectiveDate} · {monthDayPattern.target.segmentCount} 个精确片段</span></p>
                <p>条件分层：<span style={{ color: 'var(--tx-1)' }}>静态状态／岁运既有／流月流日新增</span></p>
                <p>格局映射版本：{monthDayPattern.methodologyVersion}</p>
              </>}
              {tenGodRepeat && <>
                <p>显隐重复：<span style={{ color: 'var(--tx-1)' }}>同干／同十神簇已建立</span></p>
                <p>重复口径：<span style={{ color: 'var(--tx-1)' }}>位置计数，不是力量评分</span></p>
                <p>重复版本：{tenGodRepeat.methodologyVersion}</p>
              </>}
              {transparencyRoot && <>
                <p>透出条件：<span style={{ color: 'var(--tx-1)' }}>完全同干匹配／缺失</span></p>
                <p>根气口径：<span style={{ color: 'var(--tx-1)' }}>严格同干／仅同五行分离</span></p>
                <p>透根版本：{transparencyRoot.methodologyVersion}</p>
              </>}
              {hiddenStemActivation && <>
                <p>藏干触达：<span style={{ color: 'var(--tx-1)' }}>同干岁运表层／同支／关系证据</span></p>
                <p>触达边界：<span style={{ color: 'var(--tx-1)' }}>只记入口，不判发动结果</span></p>
                <p>藏干版本：{hiddenStemActivation.methodologyVersion}</p>
              </>}
              {strengthComposite && <>
                <p>综合矩阵：<span style={{ color: 'var(--tx-1)' }}>静态基线／岁运表层／条件上下文</span></p>
                <p>比较口径：<span style={{ color: 'var(--tx-1)' }}>同向／异向／并见，不判旺衰变化</span></p>
                <p>矩阵版本：{strengthComposite.methodologyVersion}</p>
              </>}
              {patternCondition && <>
                <p>格局条件：<span style={{ color: 'var(--tx-1)' }}>成格支持／破格风险／救应候选</span></p>
                <p>结论边界：<span style={{ color: 'var(--tx-1)' }}>只审条件，不判成败高低</span></p>
                <p>格局版本：{patternCondition.methodologyVersion}</p>
              </>}
            </div>
            <div className="mt-4 rounded-lg border p-3 text-[10px] leading-5" style={{ borderColor: 'rgba(180,125,35,.25)', color: 'var(--tx-3)', background: 'rgba(180,125,35,.06)' }}>当前可解释格局静态条件及指定流日的角色覆盖、关系入口、藏干上下文与三层方向对照；角色覆盖、同向、异向、根气或触达都不等于成格破格、救应完成、旺衰变化、吉凶或具体事件。</div>
          </aside>

          <div className="flex min-h-0 flex-col overflow-hidden" style={{ background: 'var(--bg-card)' }}>
            <div className="shrink-0 overflow-x-auto border-b px-3 py-2" style={{ borderColor: 'var(--bdr)' }}><div className="flex min-w-max gap-2">{QUICK_PROMPTS.map(prompt => <button key={prompt} type="button" disabled={sending} onClick={() => void sendMessage(prompt, 'quick_prompt')} className="rounded-lg border px-3 py-1.5 text-[10px] disabled:opacity-40" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>{prompt}</button>)}</div></div>
            <div className="relative min-h-0 flex-1">
              <div
                ref={scrollRef}
                role="log"
                aria-label="八字 AI 对话消息"
                aria-live="polite"
                tabIndex={0}
                onScroll={handleScroll}
                onWheel={handleWheel}
                onTouchMove={handleTouchMove}
                onKeyDown={handleKeyDown}
                className="h-full space-y-5 overflow-y-auto overscroll-contain px-4 py-5 md:px-8"
              >
              {messages.length === 0 && <div className="flex h-full flex-col items-center justify-center text-center"><ChatCircleDots size={42} className="mb-4 opacity-20" /><h2 className="text-base font-semibold">从这份已保存的规则快照开始解读</h2><p className="mt-2 max-w-md text-xs leading-6" style={{ color: 'var(--tx-3)' }}>可以指定日期核对五层关系、显隐透根、藏干触达、三层方向和格局条件角色映射；消息会保存在本地，刷新后仍可继续。</p></div>}
              {messages.map((message, index) => message.role === 'user'
                ? <div key={message.id ?? index} className="flex justify-end"><div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6" style={{ color: 'var(--ac)', background: 'var(--ac-bg)', border: '1px solid var(--ac-bdr)' }}>{message.content}</div></div>
                : <div key={message.id ?? index} className="max-w-3xl"><div className="mb-2 flex items-center gap-2 text-[10px] tracking-wider" style={{ color: 'var(--ac-dim)' }}><ShieldCheck size={13} /> 八字基础解读</div><AiMarkdown text={message.content} theme="bazi" streaming={sending && index === messages.length - 1} incomplete={message.status === 'cancelled' || message.status === 'failed'} /><ChatRecoveryActions message={message} chat={chat} /></div>)}
              </div>
              <ChatScrollToLatestButton
                visible={showLatestButton}
                loading={sending}
                onClick={() => scrollToLatest('smooth')}
              />
            </div>
            <ChatGenerationControls chat={chat} />
            <div className="shrink-0 border-t p-3 md:px-6" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
              {error && <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--ji)' }}>{error}</p>}
              <div className="mx-auto flex max-w-4xl items-end gap-2"><textarea rows={2} value={input} disabled={sending} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (shouldSendChatMessage(event)) { event.preventDefault(); void sendMessage(input); } }} placeholder="询问这份八字基础盘…" className="min-h-[54px] flex-1 resize-none rounded-xl border px-4 py-3 text-sm outline-none disabled:opacity-60" style={{ color: 'var(--tx-1)', borderColor: 'var(--bdr)', background: 'var(--bg-1)' }} /><button type="button" aria-label="发送消息" disabled={sending || !input.trim()} onClick={() => void sendMessage(input)} className="flex h-[54px] w-12 items-center justify-center rounded-xl disabled:opacity-30" style={{ color: 'var(--ac)', border: '1px solid var(--ac-bdr)', background: 'var(--ac-bg)' }}>{sending ? '…' : <PaperPlaneTilt size={18} weight="fill" />}</button></div>
              <p className="mt-1.5 text-center text-[9px]" style={{ color: 'var(--tx-3)' }}>本地保存 · 自动压缩 · 格局条件与显隐触达可追溯 · 不判成败、力量结果及运势</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function PageState({ text, error = false }: { text: string; error?: boolean }) {
  return <main className="flex min-h-[100dvh] items-center justify-center p-6" style={{ color: error ? 'var(--ji)' : 'var(--tx-3)', background: 'var(--bg-0)' }}>{text}</main>;
}
