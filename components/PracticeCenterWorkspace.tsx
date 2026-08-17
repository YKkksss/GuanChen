'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ConversationListItem } from '@/lib/conversations/types';
import type { LearningPracticeOverview } from '@/lib/learning/types';

export default function PracticeCenterWorkspace() {
  const [overview, setOverview] = useState<LearningPracticeOverview | null>(null);
  const [charts, setCharts] = useState<ConversationListItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/learning/practice/overview', { cache: 'no-store', signal: controller.signal }),
      fetch('/api/conversations?type=chart&limit=100', { cache: 'no-store', signal: controller.signal }),
    ]).then(async ([overviewResponse, chartResponse]) => {
      const overviewData = await overviewResponse.json().catch(() => ({})) as { overview?: LearningPracticeOverview; error?: string };
      const chartData = await chartResponse.json().catch(() => ({})) as { conversations?: ConversationListItem[]; error?: string };
      if (!overviewResponse.ok || !overviewData.overview) throw new Error(overviewData.error || '练习概览加载失败');
      if (!chartResponse.ok) throw new Error(chartData.error || '命盘列表加载失败');
      setOverview(overviewData.overview);
      setCharts(chartData.conversations ?? []);
    }).catch(loadError => {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error ? loadError.message : '练习中心加载失败');
    });
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/learn" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回学习中心</Link>
          <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>PRACTICE & REVIEW</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>结构化练习中心</h1>
          <p className="mt-3 max-w-2xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>通过跨章节练习和真实命盘识别巩固结构知识；错误会进入复习队列，连续答对后自动转为已掌握。</p>
        </div>
        <Link href="/practice/review" className="rounded-lg px-4 py-2.5 text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>
          错题本 {overview?.review.due ? `· ${overview.review.due} 题待复习` : ''} →
        </Link>
      </header>

      {error && <div className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="练习次数" value={overview?.practiceAttempts ?? 0} suffix="次" />
        <Metric label="待复习" value={overview?.review.due ?? 0} suffix="题" />
        <Metric label="复习中" value={overview?.review.reviewing ?? 0} suffix="题" />
        <Metric label="已掌握错题" value={overview?.review.mastered ?? 0} suffix="题" />
      </section>

      <section className="mt-6 grid gap-5 md:grid-cols-2">
        <article className="flex min-h-[260px] flex-col rounded-2xl card-glass p-6">
          <div className="text-[10px] tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>CROSS-LESSON</div>
          <h2 className="mt-3 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>命盘结构跨章节复习</h2>
          <p className="mt-3 flex-1 text-xs leading-7" style={{ color: 'var(--t-text2)' }}>八道固定标准题覆盖宫位、命身宫、星曜分层、三方四正、四化、空宫与时间边界。</p>
          <div className="mb-4 text-[10px]" style={{ color: 'var(--t-faint)' }}>约 10 分钟 · 75 分通过 · 无需选择命盘</div>
          <Link href="/practice/foundation-review" className="rounded-lg px-5 py-3 text-center text-xs" style={{ color: '#fff8e8', background: 'linear-gradient(135deg,#9a6210,#c88020)' }}>开始综合练习</Link>
        </article>

        <article className="flex min-h-[260px] flex-col rounded-2xl card-glass p-6">
          <div className="text-[10px] tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>REAL CHART</div>
          <h2 className="mt-3 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>我的命盘识别练习</h2>
          <p className="mt-3 flex-1 text-xs leading-7" style={{ color: 'var(--t-text2)' }}>选择一份已保存命盘，程序根据快照生成命宫、身宫、主星、三方四正、四化和空宫来源题。</p>
          <div className="mb-4 text-[10px]" style={{ color: 'var(--t-faint)' }}>{charts.length ? `检测到 ${charts.length} 份可用单人命盘` : '暂无命盘，可先完成起盘'}</div>
          <Link href={charts.length ? '/practice/chart-structure' : '/chart'} className="rounded-lg px-5 py-3 text-center text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>{charts.length ? '选择命盘开始' : '先去起盘'}</Link>
        </article>
      </section>

      <section className="mt-6 rounded-xl card-glass p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>知识点掌握度</h2>
          <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>至少作答 3 次且正确率达到 80% 才标记为已掌握</span>
        </div>
        {!overview?.knowledge.length && <div className="mt-5 text-xs" style={{ color: 'var(--t-faint)' }}>完成章节小测或综合练习后，这里会显示各知识点掌握度。</div>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {overview?.knowledge.map(item => (
            <div key={item.knowledgePointId} className="rounded-lg p-4" style={{ border: '1px solid var(--t-border)' }}>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span style={{ color: 'var(--t-text)' }}>{item.title}</span>
                <span style={{ color: item.status === 'mastered' ? '#22c55e' : item.status === 'reviewing' ? '#f59e0b' : 'var(--t-faint)' }}>{statusLabel(item.status)}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--t-border)' }}><div className="h-full rounded-full" style={{ width: `${item.masteryScore}%`, background: item.status === 'mastered' ? '#22c55e' : 'linear-gradient(90deg,#9a6210,#d4a843)' }} /></div>
              <div className="mt-2 text-[9px]" style={{ color: 'var(--t-faint)' }}>{item.masteryScore}% · {item.correctCount}/{item.attemptsCount} 次答对</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <div className="rounded-xl card-glass p-5"><div className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{label}</div><div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--t-text)' }}>{value}<span className="ml-1 text-[10px] font-normal" style={{ color: 'var(--t-faint)' }}>{suffix}</span></div></div>;
}

function statusLabel(status: 'learning' | 'reviewing' | 'mastered') {
  return status === 'mastered' ? '已掌握' : status === 'reviewing' ? '需巩固' : '学习中';
}
