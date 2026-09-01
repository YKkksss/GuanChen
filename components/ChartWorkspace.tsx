'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  BookOpen,
  CalendarDots,
  ClockCounterClockwise,
  FileText,
  GraduationCap,
  List,
  SidebarSimple,
  TrendUp,
  X,
} from '@phosphor-icons/react';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import ConversationHistory from '@/components/ConversationHistory';
import InsightPanel from '@/components/InsightPanel';
import LearningPanel from '@/components/LearningPanel';
import ResultNotice from '@/components/eastern/ResultNotice';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { Conversation, ConversationMessage } from '@/lib/conversations/types';
import type { BirthInfo, Palace, ZiweiChart } from '@/lib/ziwei/types';

interface ChartWorkspaceProps {
  conversationId?: string;
}

export default function ChartWorkspace({ conversationId }: ChartWorkspaceProps) {
  const router = useRouter();
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [learningMode, setLearningMode] = useState(false);
  const [mobilePane, setMobilePane] = useState<'chart' | 'insight'>('chart');
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  useEffect(() => {
    const compactMedia = window.matchMedia('(max-width: 1080px)');
    const syncHistoryState = () => {
      setHistoryCollapsed(compactMedia.matches || window.localStorage.getItem('ziwei-history-collapsed') === 'true');
    };
    syncHistoryState();
    compactMedia.addEventListener('change', syncHistoryState);
    return () => compactMedia.removeEventListener('change', syncHistoryState);
  }, []);

  const toggleHistory = () => {
    setHistoryCollapsed(current => {
      const next = !current;
      if (!window.matchMedia('(max-width: 1080px)').matches) {
        window.localStorage.setItem('ziwei-history-collapsed', String(next));
      }
      return next;
    });
  };

  const closeMobileHistory = () => {
    if (window.matchMedia('(max-width: 1080px)').matches) setHistoryCollapsed(true);
  };

  useEffect(() => {
    const compactMedia = window.matchMedia('(max-width: 1080px)');
    const previousOverflow = document.body.style.overflow;
    const syncBodyLock = () => {
      document.body.style.overflow = compactMedia.matches && (!historyCollapsed || mobileActionsOpen)
        ? 'hidden'
        : previousOverflow;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileActionsOpen(false);
      setHistoryCollapsed(true);
    };

    syncBodyLock();
    compactMedia.addEventListener('change', syncBodyLock);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      compactMedia.removeEventListener('change', syncBodyLock);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [historyCollapsed, mobileActionsOpen]);

  useEffect(() => {
    if (!conversationId) {
      setChart(null);
      setMessages([]);
      setLoading(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    setChart(null);
    setMessages([]);
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
        if (!data.conversation.chartSnapshot) throw new Error('该会话缺少命盘快照');
        setChart(data.conversation.chartSnapshot);
        setSelectedPalace(null);
        setMessages(data.messages);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '历史会话加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [conversationId]);

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
    setLearningMode(current => {
      const next = !current;
      if (next && chart) setSelectedPalace(chart.palaces.find(palace => palace.branch === chart.mingGongBranch) ?? null);
      return next;
    });
  };

  const navigateFromActions = (href: string) => {
    setMobileActionsOpen(false);
    router.push(href);
  };

  return (
    <main className="eastern-workbench">
      <header className="eastern-app-header">
        <button type="button" className="eastern-brand" onClick={() => router.push('/')} aria-label="返回首页">
          <Image src="/assets/brand/ziwei-seal.png" alt="紫微命盘印章" width={38} height={38} priority />
          <span className="eastern-brand-copy">
            <strong>紫微命盘</strong>
            <small>东方书院 · 知命而行</small>
          </span>
        </button>

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
            <span>功能</span>
          </button>
        </div>

        <nav id="eastern-chart-actions" className={`eastern-app-actions ${mobileActionsOpen ? 'is-mobile-open' : ''}`} aria-label="命盘功能导航">
          <div className="eastern-mobile-actions-heading">
            <div>
              <strong>命盘功能</strong>
              <span>选择接下来要查看的内容</span>
            </div>
            <button type="button" onClick={() => setMobileActionsOpen(false)} aria-label="关闭功能导航">
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
                <span>专题报告</span>
              </button>
              <button type="button" onClick={() => navigateFromActions(`/chart/${conversationId}/events`)}>
                <CalendarDots size={16} aria-hidden="true" />
                <span>人生事件</span>
              </button>
              <button type="button" onClick={() => navigateFromActions(`/chart/${conversationId}/timeline`)}>
                <TrendUp size={16} aria-hidden="true" />
                <span>年度分析</span>
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
          aria-label="关闭功能导航"
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
              <ResultNotice compact />
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
            <>
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
                  AI 解读
                </button>
              </div>
              <div className={`eastern-content-grid ${learningMode ? 'is-learning-mode' : ''}`} data-mobile-pane={mobilePane}>
                <section className="eastern-chart-region" aria-label="紫微斗数命盘">
                  <ChartBoard chart={chart} selectedBranch={selectedPalace?.branch ?? null} onPalaceSelect={setSelectedPalace} />
                </section>
                <aside className="eastern-insight-region" aria-label={learningMode ? '学习解读' : 'AI 命理解读'}>
                  {learningMode && selectedPalace ? (
                    <LearningPanel
                      conversationId={conversationId}
                      branch={selectedPalace.branch}
                      onNavigate={branch => setSelectedPalace(chart.palaces.find(palace => palace.branch === branch) ?? null)}
                    />
                  ) : (
                    <InsightPanel
                      key={conversationId}
                      chart={chart}
                      conversationId={conversationId}
                      initialMessages={messages}
                      selectedPalace={selectedPalace}
                    />
                  )}
                </aside>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
