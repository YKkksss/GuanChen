'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PracticeQuizForm from '@/components/PracticeQuizForm';
import type { ConversationListItem } from '@/lib/conversations/types';
import type { LearningPracticeSet } from '@/lib/learning/types';

export default function ChartPracticeWorkspace() {
  const [charts, setCharts] = useState<ConversationListItem[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [practice, setPractice] = useState<LearningPracticeSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/conversations?type=chart&limit=100', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { conversations?: ConversationListItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || '命盘列表加载失败');
        setCharts(data.conversations ?? []);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '命盘列表加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const generate = async () => {
    setError('');
    setPractice(null);
    try {
      const response = await fetch(`/api/learning/practice/chart-structure?conversationId=${encodeURIComponent(conversationId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { practice?: LearningPracticeSet; error?: string };
      if (!response.ok || !data.practice) throw new Error(data.error || '命盘练习生成失败');
      setPractice(data.practice);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '命盘练习生成失败');
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-[980px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7">
        <Link href="/practice" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回练习中心</Link>
        <div className="mt-5 text-[10px] tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>REAL CHART PRACTICE</div>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>我的命盘识别练习</h1>
        <p className="mt-3 text-xs leading-7" style={{ color: 'var(--t-text2)' }}>题目和标准答案由选中命盘的保存快照生成，不调用 AI 补算。</p>
      </header>

      <section className="mb-6 rounded-xl card-glass p-5">
        {loading ? <div className="text-xs" style={{ color: 'var(--t-faint)' }}>正在加载命盘列表…</div> : charts.length ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <select value={conversationId} onChange={event => { setConversationId(event.target.value); setPractice(null); }} className="min-w-0 flex-1 rounded-lg px-4 py-3 text-xs" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
              <option value="">请选择一份单人命盘</option>
              {charts.map(chart => <option key={chart.id} value={chart.id}>{chart.title}</option>)}
            </select>
            <button type="button" disabled={!conversationId} onClick={generate} className="rounded-lg px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40" style={{ color: '#fff8e8', background: 'linear-gradient(135deg,#9a6210,#c88020)' }}>生成识别题</button>
          </div>
        ) : <div className="text-xs" style={{ color: 'var(--t-faint)' }}>还没有已保存的单人命盘。<Link href="/chart" style={{ color: 'var(--t-gold)' }}>先去起盘 →</Link></div>}
      </section>

      {error && <div className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}
      {practice && (
        <section>
          <div className="mb-5 rounded-xl p-5" style={{ border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>{practice.title}</h2>
            <p className="mt-2 text-[10px] leading-6" style={{ color: 'var(--t-faint)' }}>{practice.description} · 共 {practice.questions.length} 题，{practice.passScore} 分通过。</p>
          </div>
          <PracticeQuizForm key={practice.id} practice={practice} submitUrl="/api/learning/practice/chart-structure" submitExtras={{ conversationId: practice.conversationId }} />
          <div className="mt-6 rounded-xl px-4 py-3 text-[10px] leading-6" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>{practice.boundary}</div>
        </section>
      )}
    </main>
  );
}
