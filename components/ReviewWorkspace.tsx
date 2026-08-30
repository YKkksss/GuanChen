'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { LearningReviewItem, LearningReviewStatus, LearningReviewSummary } from '@/lib/learning/types';

const FILTERS: Array<{ value: 'all' | LearningReviewStatus; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'due', label: '待复习' },
  { value: 'reviewing', label: '复习中' },
  { value: 'mastered', label: '已掌握' },
];

export default function ReviewWorkspace() {
  const [filter, setFilter] = useState<'all' | LearningReviewStatus>('all');
  const [items, setItems] = useState<LearningReviewItem[]>([]);
  const [summary, setSummary] = useState<LearningReviewSummary>({ due: 0, reviewing: 0, mastered: 0, total: 0 });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = filter === 'all' ? '' : `?status=${filter}`;
      const response = await fetch(`/api/learning/review${query}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { items?: LearningReviewItem[]; summary?: LearningReviewSummary; error?: string };
      if (!response.ok || !data.items || !data.summary) throw new Error(data.error || '错题本加载失败');
      setItems(data.items);
      setSummary(data.summary);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '错题本加载失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (item: LearningReviewItem) => {
    const selectedOptionId = answers[item.id];
    if (!selectedOptionId) { setError('请先选择一个答案'); return; }
    setBusyId(item.id);
    setError('');
    try {
      const response = await fetch(`/api/learning/review/${item.id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedOptionId }),
      });
      const data = await response.json().catch(() => ({})) as { item?: LearningReviewItem; correct?: boolean; error?: string };
      if (!response.ok || !data.item || typeof data.correct !== 'boolean') throw new Error(data.error || '复习答案提交失败');
      setFeedback(current => ({ ...current, [item.id]: data.correct! }));
      setItems(current => current.map(entry => entry.id === item.id ? data.item! : entry));
      const summaryResponse = await fetch('/api/learning/review', { cache: 'no-store' });
      const summaryData = await summaryResponse.json().catch(() => ({})) as { summary?: LearningReviewSummary };
      if (summaryData.summary) setSummary(summaryData.summary);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '复习答案提交失败');
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = async (item: LearningReviewItem, status: 'due' | 'mastered') => {
    setBusyId(item.id);
    setError('');
    try {
      const response = await fetch(`/api/learning/review/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({})) as { item?: LearningReviewItem; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error || '复习状态更新失败');
      await load();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : '复习状态更新失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1050px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/practice" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回练习中心</Link>
          <div className="mt-5 text-[10px] tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>REVIEW QUEUE</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>错题本与复习队列</h1>
          <p className="mt-3 text-xs leading-7" style={{ color: 'var(--t-text2)' }}>答错自动进入待复习；答对一次进入复习中，连续答对两次自动转为已掌握。</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
          <Metric label="待复习" value={summary.due} />
          <Metric label="复习中" value={summary.reviewing} />
          <Metric label="已掌握" value={summary.mastered} />
        </div>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(item => <button key={item.value} type="button" onClick={() => setFilter(item.value)} className="rounded-full px-4 py-2 text-[10px]" style={{ color: filter === item.value ? '#fffaf3' : 'var(--t-text2)', border: '1px solid var(--t-border)', background: filter === item.value ? 'var(--ac)' : 'transparent' }}>{item.label}</button>)}
      </div>

      {error && <div className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}
      {loading && <div className="rounded-xl card-glass py-20 text-center text-sm" style={{ color: 'var(--t-faint)' }}>正在整理复习队列…</div>}
      {!loading && !items.length && <div className="rounded-xl card-glass px-6 py-20 text-center"><div className="text-2xl">✓</div><div className="mt-3 text-sm font-semibold" style={{ color: 'var(--t-text)' }}>当前分类没有错题</div><p className="mt-2 text-xs" style={{ color: 'var(--t-faint)' }}>完成章节小测或综合练习后，未答对的题目会自动出现在这里。</p></div>}

      <div className="space-y-5">
        {items.map((item, index) => {
          const result = feedback[item.id];
          return (
            <article key={item.id} className="rounded-xl card-glass p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>#{index + 1} · {item.sourceType === 'lesson_quiz' ? '章节小测' : '综合练习'} · 错误 {item.wrongCount} 次</div>
                  <h2 className="mt-2 text-sm font-semibold leading-7" style={{ color: 'var(--t-text)' }}>{item.question.prompt}</h2>
                </div>
                <span className="rounded-full px-3 py-1 text-[9px]" style={{ color: statusColor(item.status), border: '1px solid var(--t-border)' }}>{statusLabel(item.status)}</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {item.question.options.map(option => (
                  <label key={option.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-4 py-3 text-[11px] leading-6" style={{ color: 'var(--t-text2)', border: `1px solid ${answers[item.id] === option.id ? 'var(--t-border-acc)' : 'var(--t-border)'}`, background: answers[item.id] === option.id ? 'var(--ac-bg)' : 'transparent' }}>
                    <input type="radio" name={`review-${item.id}`} checked={answers[item.id] === option.id} onChange={() => { setAnswers(current => ({ ...current, [item.id]: option.id })); setFeedback(current => { const next = { ...current }; delete next[item.id]; return next; }); }} />
                    {option.label}
                  </label>
                ))}
              </div>
              {typeof result === 'boolean' && <div className="mt-4 rounded-lg px-4 py-3 text-[10px] leading-6" style={{ color: result ? '#22c55e' : '#ef4444', background: result ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)' }}>{result ? '回答正确。' : '回答错误，复习进度已重置。'} {item.question.explanation}</div>}
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={busyId === item.id} onClick={() => submit(item)} className="rounded-lg px-4 py-2.5 text-xs disabled:opacity-40" style={{ color: '#fffaf3', background: 'var(--ac)' }}>{busyId === item.id ? '正在更新…' : '提交复习答案'}</button>
                {item.status !== 'mastered' ? <button type="button" disabled={busyId === item.id} onClick={() => changeStatus(item, 'mastered')} className="rounded-lg px-4 py-2.5 text-[10px]" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)' }}>手动标记已掌握</button> : <button type="button" disabled={busyId === item.id} onClick={() => changeStatus(item, 'due')} className="rounded-lg px-4 py-2.5 text-[10px]" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>重新加入复习</button>}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-[70px] rounded-lg px-3 py-2" style={{ border: '1px solid var(--t-border)' }}><div style={{ color: 'var(--t-faint)' }}>{label}</div><div className="mt-1 text-base font-semibold" style={{ color: 'var(--t-text)' }}>{value}</div></div>;
}

function statusLabel(status: LearningReviewStatus) { return status === 'due' ? '待复习' : status === 'reviewing' ? '复习中' : '已掌握'; }
function statusColor(status: LearningReviewStatus) { return status === 'due' ? '#ef4444' : status === 'reviewing' ? '#f59e0b' : '#22c55e'; }
