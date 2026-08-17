'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PracticeQuizForm from '@/components/PracticeQuizForm';
import type { LearningPracticeSet } from '@/lib/learning/types';

export default function FoundationPracticeWorkspace() {
  const [practice, setPractice] = useState<LearningPracticeSet | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/learning/practice/foundation-review', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { practice?: LearningPracticeSet; error?: string };
        if (!response.ok || !data.practice) throw new Error(data.error || '综合练习加载失败');
        setPractice(data.practice);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '综合练习加载失败');
      });
    return () => controller.abort();
  }, []);

  return <PracticePageShell practice={practice} error={error}><PracticeQuizForm practice={practice!} submitUrl="/api/learning/practice/foundation-review" /></PracticePageShell>;
}

function PracticePageShell({ practice, error, children }: { practice: LearningPracticeSet | null; error: string; children: React.ReactNode }) {
  if (!practice) return <main className="mx-auto max-w-[980px] px-4 py-24 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>{error || '正在加载综合练习…'}</main>;
  return (
    <main className="mx-auto min-h-screen max-w-[980px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7">
        <Link href="/practice" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回练习中心</Link>
        <div className="mt-5 text-[10px] tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>FOUNDATION REVIEW</div>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>{practice.title}</h1>
        <p className="mt-3 text-xs leading-7" style={{ color: 'var(--t-text2)' }}>{practice.description}</p>
        <div className="mt-3 text-[10px]" style={{ color: 'var(--t-faint)' }}>{practice.questions.length} 题 · 约 {practice.estimatedMinutes} 分钟 · {practice.passScore} 分通过</div>
      </header>
      {children}
      <div className="mt-6 rounded-xl px-4 py-3 text-[10px] leading-6" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>{practice.boundary}</div>
    </main>
  );
}
