'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import ConversationHistory from '@/components/ConversationHistory';
import InsightPanel from '@/components/InsightPanel';
import LearningPanel from '@/components/LearningPanel';
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

  useEffect(() => {
    setHistoryCollapsed(window.localStorage.getItem('ziwei-history-collapsed') === 'true');
  }, []);

  const toggleHistory = () => {
    setHistoryCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('ziwei-history-collapsed', String(next));
      return next;
    });
  };

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

  return (
    <main className="mx-auto max-w-[1800px] px-3 py-4 md:px-4">
      <div className={`grid grid-cols-1 items-start gap-4 ${historyCollapsed ? 'xl:grid-cols-[64px_minmax(0,1fr)]' : 'xl:grid-cols-[260px_minmax(0,1fr)]'}`}>
        <ConversationHistory
          activeConversationId={conversationId}
          collapsed={historyCollapsed}
          onToggle={toggleHistory}
        />

        <section className="min-w-0">
          {loading && (
            <div className="rounded-xl card-glass py-24 text-center text-sm" style={{ color: 'var(--t-faint)' }}>
              正在恢复命盘与聊天记录…
            </div>
          )}

          {!loading && error && !chart && (
            <div className="rounded-xl card-glass py-20 px-6 text-center">
              <div className="text-sm" style={{ color: 'var(--t-text)' }}>{error}</div>
              <button onClick={() => router.push('/chart')} className="mt-5 text-xs" style={{ color: 'var(--t-gold)' }}>
                返回并重新起盘
              </button>
            </div>
          )}

          {!loading && !chart && !error && (
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 0 48px' }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>紫微斗数排盘</h1>
              <p style={{ color: '#888', marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
                输入出生信息后会建立一份本地历史会话，刷新或退出后仍可继续查看和追问。
              </p>
              <BirthForm onSubmit={createChartConversation} loading={creating} />
            </div>
          )}

          {!loading && chart && conversationId && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/chart')}
                  className="whitespace-nowrap"
                  style={{
                    padding: '6px 14px', cursor: 'pointer', border: '1px solid #ccc',
                    borderRadius: 8, background: 'transparent',
                  }}
                >
                  ← 重新起盘
                </button>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={toggleLearningMode}
                    className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px]"
                    style={{ color: learningMode ? '#fff8e8' : 'var(--t-gold)', border: '1px solid rgba(212,168,67,0.35)', background: learningMode ? 'linear-gradient(135deg,#9a6210,#c88020)' : 'rgba(212,168,67,.04)' }}
                  >
                    {learningMode ? '退出学习模式' : '学习模式'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/chart/${conversationId}/reports`)}
                    className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px]"
                    style={{ color: 'var(--t-text)', border: '1px solid var(--t-border)' }}
                  >
                    专题报告
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/chart/${conversationId}/events`)}
                    className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px]"
                    style={{ color: 'var(--t-text)', border: '1px solid var(--t-border)' }}
                  >
                    人生事件
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/chart/${conversationId}/timeline`)}
                    className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px]"
                    style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,0.28)' }}
                  >
                    年度分析 →
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/rectification?conversationId=${conversationId}`)}
                    className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px]"
                    style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,0.28)' }}
                  >
                    校正时辰
                  </button>
                  <span className="whitespace-nowrap text-[10px]" style={{ color: 'var(--t-faint)' }}>
                    已自动保存到本地历史
                  </span>
                </div>
              </div>

              <div className={`mt-4 grid items-start gap-4 ${learningMode ? 'lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(340px,390px)]'}`}>
                <ChartBoard chart={chart} selectedBranch={selectedPalace?.branch ?? null} onPalaceSelect={setSelectedPalace} />
                <div className="min-w-0 lg:sticky lg:top-4">
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
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
