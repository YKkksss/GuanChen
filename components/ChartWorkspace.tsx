'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConversationChat } from '@/lib/ui/use-conversation-chat';
import { useChatSplit } from '@/lib/ui/use-chat-split';
import {
  BookOpen,
  ArrowsInSimple,
  ArrowsOutSimple,
  ArrowCounterClockwise,
  CalendarDots,
  ClockCounterClockwise,
  FileText,
  GraduationCap,
  List,
  SidebarSimple,
  TrendUp,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import ConversationHistory from '@/components/ConversationHistory';
import InsightPanel, { type InsightPanelHandle } from '@/components/InsightPanel';
import PalaceFacts from '@/components/PalaceFacts';
import StarKnowledgeDialog from '@/components/StarKnowledgeDialog';
import LearningPanel from '@/components/LearningPanel';
import ResultNotice from '@/components/eastern/ResultNotice';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { Conversation, ConversationMessage } from '@/lib/conversations/types';
import type { BirthInfo, Palace, Star, ZiweiChart } from '@/lib/ziwei/types';
import { useBodyScrollLock } from '@/lib/ui/use-body-scroll-lock';
import styles from './ChartWorkspace.module.css';

interface ChartWorkspaceProps {
  conversationId?: string;
}

export default function ChartWorkspace({ conversationId }: ChartWorkspaceProps) {
  const router = useRouter();
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const chat = useConversationChat(conversationId ?? '', 'ziwei', undefined, true);
  const hydrateChat = chat.session.hydrate;
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [learningMode, setLearningMode] = useState(false);
  const [mobilePane, setMobilePane] = useState<'chart' | 'insight'>('chart');
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [learningNoteDirty, setLearningNoteDirty] = useState(false);
  const [starSelection, setStarSelection] = useState<{ star: Star; palace: Palace } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [chatFocused, setChatFocused] = useState(false);
  const split = useChatSplit(Boolean(chart && conversationId && !loading));
  const insightRef = useRef<InsightPanelHandle>(null);
  useBodyScrollLock(!historyCollapsed || mobileActionsOpen);

  useEffect(() => {
    setHistoryCollapsed(true);
    setMobileActionsOpen(false);
    setStarSelection(null);
    setChatFocused(false);
  }, [conversationId, hydrateChat]);

  useEffect(() => {
    if (!chatFocused) return;
    const exitFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open], [role="dialog"]')) setChatFocused(false);
    };
    window.addEventListener('keydown', exitFocus);
    return () => window.removeEventListener('keydown', exitFocus);
  }, [chatFocused]);

  const toggleHistory = () => {
    setHistoryCollapsed(current => !current);
  };

  const closeMobileHistory = () => {
    setHistoryCollapsed(true);
  };

  useEffect(() => {
    const closeOverlays = () => { setMobileActionsOpen(false); setHistoryCollapsed(true); };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeOverlays();
    };

    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('eastern-navigation-open', closeOverlays);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('eastern-navigation-open', closeOverlays);
    };
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setChart(null);

      setLoading(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    setChart(null);

    setLoading(true);
    setError('');
    fetch(`/api/conversations/${conversationId}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error || '历史会话加载失败');
        }
        return response.json() as Promise<{ conversation: Conversation; messages: ConversationMessage[] }>;
      })
      .then(data => {
        if (controller.signal.aborted) return;
        if (!data.conversation.chartSnapshot) throw new Error('该会话缺少命盘快照');
        setChart(data.conversation.chartSnapshot);
        setSelectedPalace(null);
        hydrateChat(data.messages);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '历史会话加载失败');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [conversationId, hydrateChat]);

  const createChartConversation = async (birthInfo: BirthInfo) => {
    setCreating(true);
    setError('');
    try {
      const nextChart = generateChart(birthInfo);
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chart', birthInfo, chartSnapshot: nextChart }),
      });
      const data = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !data.conversation) throw new Error(data.error || '创建会话失败');
      router.replace(`/chart/${data.conversation.id}`);
      window.dispatchEvent(new Event('conversation-updated'));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建会话失败');
    } finally {
      setCreating(false);
    }
  };

  const toggleLearningMode = () => {
    if (learningMode && learningNoteDirty && !window.confirm('当前学习笔记尚未正式保存。确定退出学习模式吗？草稿仍会暂存在这个浏览器中。')) return;
    setLearningMode(current => {
      const next = !current;
      if (next && chart) setSelectedPalace(chart.palaces.find(palace => palace.branch === chart.mingGongBranch) ?? null);
      return next;
    });
  };

  const selectPalace = (palace: Palace | null) => {
    if (learningMode && learningNoteDirty && palace?.branch !== selectedPalace?.branch
      && !window.confirm('当前学习笔记尚未正式保存。确定切换宫位吗？草稿仍会暂存在这个浏览器中。')) return;
    setSelectedPalace(palace);
  };

  const navigateFromActions = (href: string) => {
    setMobileActionsOpen(false);
    router.push(href);
  };

  const analyzePalace = (palace: Palace) => {
    if (learningMode && learningNoteDirty && !window.confirm('当前学习笔记尚未正式保存。确定切换到 AI 解读吗？草稿仍会暂存在这个浏览器中。')) return;
    if (!insightRef.current?.analyzePalace(palace)) return;
    setLearningMode(false);
    setMobilePane('insight');
  };

  return (
    <main className={`eastern-workbench ${styles.embedded} ${chart ? styles.reading : ''} ${chatFocused ? styles.focused : ''}`}>
      <header className="eastern-app-header">
        <h1 className={styles.title}>命盘解读</h1>

        <div className="eastern-mobile-header-controls">
          <button
            type="button"
            className="eastern-mobile-history-button"
            onClick={() => { setMobileActionsOpen(false); toggleHistory(); }}
            aria-expanded={!historyCollapsed}
            aria-label={historyCollapsed ? '打开历史对话' : '关闭历史对话'}
          >
            <SidebarSimple size={16} aria-hidden="true" />
            <span>历史</span>
          </button>
          <button
            type="button"
            className="eastern-mobile-actions-button"
            onClick={() => { setHistoryCollapsed(true); setMobileActionsOpen(open => !open); }}
            aria-controls="eastern-chart-actions"
            aria-expanded={mobileActionsOpen}
          >
            {mobileActionsOpen ? <X size={17} aria-hidden="true" /> : <List size={17} aria-hidden="true" />}
            <span>命盘工具</span>
          </button>
        </div>

        <nav id="eastern-chart-actions" className={`eastern-app-actions ${mobileActionsOpen ? 'is-mobile-open' : ''}`} aria-label="命盘功能导航">
          <div className="eastern-mobile-actions-heading">
            <div>
              <strong>命盘功能</strong>
              <span>选择接下来要查看的内容</span>
            </div>
            <button type="button" onClick={() => setMobileActionsOpen(false)} aria-label="关闭命盘工具">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <button type="button" onClick={() => navigateFromActions('/learn')}>
            <BookOpen size={16} aria-hidden="true" />
            <span>学习中心</span>
          </button>
          {chart && (
            <button type="button" onClick={() => { toggleLearningMode(); setMobileActionsOpen(false); }} aria-pressed={learningMode} className={learningMode ? 'is-active' : ''}>
              <GraduationCap size={16} aria-hidden="true" />
              <span>{learningMode ? '退出学习' : '学习模式'}</span>
            </button>
          )}
          {conversationId && (
            <>
              <button type="button" onClick={() => navigateFromActions(`/chart/${conversationId}/reports`)}>
                <FileText size={16} aria-hidden="true" />
                <span>命盘报告</span>
              </button>
              <button type="button" onClick={() => navigateFromActions(`/chart/${conversationId}/events`)}>
                <CalendarDots size={16} aria-hidden="true" />
                <span>人生时间轴</span>
              </button>
              <button type="button" onClick={() => navigateFromActions(`/chart/${conversationId}/timeline`)}>
                <TrendUp size={16} aria-hidden="true" />
                <span>运限分析</span>
              </button>
              <button type="button" onClick={() => navigateFromActions(`/rectification?conversationId=${conversationId}`)}>
                <ClockCounterClockwise size={16} aria-hidden="true" />
                <span>校正时辰</span>
              </button>
            </>
          )}
        </nav>
        <button
          type="button"
          className={`eastern-actions-backdrop ${mobileActionsOpen ? 'is-visible' : ''}`}
          onClick={() => setMobileActionsOpen(false)}
          aria-label="关闭命盘工具"
          tabIndex={mobileActionsOpen ? 0 : -1}
        />
      </header>

      <div className={`eastern-shell ${historyCollapsed ? 'is-history-collapsed' : ''}`}>
        <ConversationHistory
          activeConversationId={conversationId}
          collapsed={historyCollapsed}
          onToggle={toggleHistory}
          onNavigate={closeMobileHistory}
        />
        <button
          type="button"
          className={`eastern-history-backdrop ${historyCollapsed ? '' : 'is-visible'}`}
          onClick={toggleHistory}
          aria-label="关闭历史对话"
          tabIndex={historyCollapsed ? -1 : 0}
        />

        <section className="eastern-main">
          {conversationId && (
            <div className="eastern-result-notice">
              <details className={styles.noticeDetails}>
                <summary>传统文化学习参考，不替代现实判断<span>温馨提示</span></summary>
                <ResultNotice compact />
              </details>
            </div>
          )}
          {chart?.birthInfo.unknownTime && conversationId && (
            <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-[11px] leading-5" style={{ color: '#9d342a', borderColor: 'rgba(164,63,49,.28)', background: 'rgba(164,63,49,.06)' }}>
              <span className="flex min-w-0 items-start gap-2"><WarningCircle className="mt-0.5 shrink-0" size={15} aria-hidden="true" />出生时辰未知，当前命盘按子时试排；与时辰相关的解读已降低置信度。</span>
              <button type="button" onClick={() => router.push(`/rectification?conversationId=${conversationId}`)} className="shrink-0 font-medium underline underline-offset-2">前往生时校正</button>
            </div>
          )}
          {loading && (
            <div className="eastern-state-panel">
              正在恢复命盘与聊天记录…
            </div>
          )}

          {!loading && error && !chart && (
            <div className="eastern-state-panel">
              <div>{error}</div>
              <button onClick={() => router.push('/chart')} className="eastern-text-action">
                返回并重新起盘
              </button>
            </div>
          )}

          {!loading && !chart && !error && (
            <div className="eastern-birth-panel">
              <div className="eastern-page-kicker">建立命档</div>
              <h1>紫微斗数排盘</h1>
              <p>
                输入出生信息后会建立一份本地历史会话，刷新或退出后仍可继续查看和追问。
              </p>
              <BirthForm onSubmit={createChartConversation} loading={creating} />
            </div>
          )}

          {!loading && chart && conversationId && (
            <div className={styles.readingLayout}>
              <div className="eastern-mobile-view-tabs" role="tablist" aria-label="命盘工作区视图">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobilePane === 'chart'}
                  className={mobilePane === 'chart' ? 'is-active' : ''}
                  onClick={() => setMobilePane('chart')}
                >
                  查看命盘
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobilePane === 'insight'}
                  className={mobilePane === 'insight' ? 'is-active' : ''}
                  onClick={() => setMobilePane('insight')}
                >
                  {learningMode ? '学习解读' : 'AI 解读'}
                </button>
              </div>
              <div ref={split.gridRef} className={`eastern-content-grid ${learningMode ? 'is-learning-mode' : ''}`} data-mobile-pane={mobilePane} data-chat-focused={chatFocused}>
                <section className="eastern-chart-region" aria-label="紫微斗数命盘">
                  <div className={styles.boardPane}>
                    <ChartBoard chart={chart} selectedBranch={selectedPalace?.branch ?? null} onPalaceSelect={selectPalace}
                      onStarSelect={(star, palace) => setStarSelection({ star, palace })} />
                  </div>
                  <PalaceFacts palace={selectedPalace} busy={analyzing} onAnalyze={analyzePalace} />
                </section>
                <div ref={split.dividerRef} className={styles.divider} role="separator" tabIndex={0}
                  aria-label="调整命盘与对话宽度" aria-orientation="vertical" aria-controls="chart-reading-chat"
                  aria-valuenow={45} aria-valuemin={20} aria-valuemax={80}
                  title="拖动调整宽度；左右方向键微调，双击或 Enter 恢复默认" {...split.dividerEvents} />
                <aside id="chart-reading-chat" className="eastern-insight-region" aria-label={learningMode ? '学习解读' : 'AI 命理解读'}>
                  {learningMode && selectedPalace && (
                    <LearningPanel
                      conversationId={conversationId}
                      branch={selectedPalace.branch}
                      onNavigate={branch => {
                        const palace = chart.palaces.find(item => item.branch === branch);
                        if (palace) selectPalace(palace);
                      }}
                      onDirtyChange={setLearningNoteDirty}
                    />
                  )}
                  <div hidden={learningMode && Boolean(selectedPalace)} className={styles.chatPane}>
                    <InsightPanel
                      ref={insightRef}
                      key={conversationId}
                      chart={chart}
                      conversationId={conversationId}
                      chat={chat}
                      onLoadingChange={setAnalyzing}
                      readingControls={<>
                        <button type="button" className={styles.resetSplit} onClick={split.reset} aria-label="重置分栏比例" title="恢复默认分栏比例"><ArrowCounterClockwise size={16} aria-hidden="true" /></button>
                        <button type="button" className={styles.focusButton} aria-pressed={chatFocused}
                          onClick={() => { setChatFocused(value => !value); setMobilePane('insight'); }}>
                          {chatFocused ? <ArrowsInSimple size={16} aria-hidden="true" /> : <ArrowsOutSimple size={16} aria-hidden="true" />}
                          {chatFocused ? '退出专注' : '专注对话'}
                        </button>
                      </>}
                    />
                  </div>
                </aside>
              </div>
            </div>
          )}
        </section>
      </div>
      <StarKnowledgeDialog selection={starSelection} onClose={() => setStarSelection(null)} />
    </main>
  );
}
