'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { LearningCourse, LearningCourseProgress, LearningSourceReference } from '@/lib/learning/types';

export default function LearningCourseWorkspace({
  course,
  sources,
}: {
  course: LearningCourse;
  sources: LearningSourceReference[];
}) {
  const [progress, setProgress] = useState<LearningCourseProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/learning/courses/${course.id}/progress`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { progress?: LearningCourseProgress; error?: string };
        if (!response.ok || !data.progress) throw new Error(data.error || '学习进度加载失败');
        setProgress(data.progress);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '学习进度加载失败');
      });
    return () => controller.abort();
  }, [course.id]);

  const progressMap = useMemo(() => new Map(progress?.lessons.map(item => [item.lessonId, item]) ?? []), [progress]);
  const nextLesson = course.lessons.find(item => progressMap.get(item.id)?.status !== 'completed') ?? course.lessons.at(-1)!;

  return (
    <main className="mx-auto min-h-screen max-w-[1080px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7">
        <Link href="/learn" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回学习中心</Link>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--t-faint)' }}>
          <span>入门课程</span><span>·</span><span>{course.lessons.length} 章</span><span>·</span><span>约 {course.estimatedMinutes} 分钟</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>{course.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7" style={{ color: 'var(--t-text2)' }}>{course.subtitle}</p>
      </header>

      {error && <div className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}

      <section className="mb-6 rounded-xl card-glass p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px]" style={{ color: 'var(--t-faint)' }}>课程进度</div>
            <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>
              {progress ? `${progress.completedLessons}/${progress.totalLessons} 章` : '正在恢复…'}
            </div>
          </div>
          {progress && (
            <Link href={`/learn/${course.slug}/${nextLesson.slug}`} className="rounded-lg px-5 py-2.5 text-xs" style={{ color: '#fff8e8', background: 'linear-gradient(135deg,#9a6210,#c88020)' }}>
              {progress.startedLessons ? '继续学习' : '从第一章开始'}
            </Link>
          )}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--t-border)' }}>
          <div className="h-full rounded-full" style={{ width: `${progress?.completionPercent ?? 0}%`, background: 'linear-gradient(90deg,#9a6210,#d4a843)' }} />
        </div>
      </section>

      <section className="space-y-3">
        {course.lessons.map(item => {
          const itemProgress = progressMap.get(item.id);
          const accessible = item.prerequisiteLessonIds.every(id => progressMap.get(id)?.status === 'completed');
          const prerequisite = item.prerequisiteLessonIds.map(id => course.lessons.find(candidate => candidate.id === id)?.title).filter(Boolean).join('、');
          const content = (
            <article className="grid gap-4 rounded-xl card-glass p-5 sm:grid-cols-[48px_minmax(0,1fr)_130px] sm:items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold" style={{ color: itemProgress?.status === 'completed' ? '#fff8e8' : 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: itemProgress?.status === 'completed' ? '#9a6210' : 'var(--ac-bg)' }}>
                {itemProgress?.status === 'completed' ? '✓' : item.order}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>{item.title}</h2>
                  {itemProgress?.status === 'in_progress' && <span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>学习中</span>}
                  {!accessible && <span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>需先完成：{prerequisite}</span>}
                </div>
                <p className="mt-1 text-[11px] leading-6" style={{ color: 'var(--t-text2)' }}>{item.summary}</p>
              </div>
              <div className="text-left text-[10px] sm:text-right" style={{ color: 'var(--t-faint)' }}>
                <div>约 {item.durationMinutes} 分钟</div>
                {itemProgress && <div className="mt-1">最佳 {itemProgress.bestScore} 分 · {itemProgress.attemptsCount} 次</div>}
              </div>
            </article>
          );
          return accessible
            ? <Link key={item.id} href={`/learn/${course.slug}/${item.slug}`} className="block transition-transform hover:-translate-y-0.5">{content}</Link>
            : <div key={item.id} className="opacity-60">{content}</div>;
        })}
      </section>

      <section className="mt-7 grid gap-5 md:grid-cols-2">
        <div className="rounded-xl card-glass p-5">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>课程依据</h2>
          <div className="mt-4 space-y-3">
            {sources.map(source => (
              <div key={source.id} className="text-[10px] leading-6" style={{ color: 'var(--t-text2)' }}>
                {source.href ? <Link href={source.href} className="font-medium" style={{ color: 'var(--t-gold)' }}>{source.title} →</Link> : <span className="font-medium">{source.title}</span>}
                <div style={{ color: 'var(--t-faint)' }}>{source.note}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl p-5 text-[10px] leading-6" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>
          <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--t-text)' }}>内容边界</div>
          {course.boundary}
        </div>
      </section>
    </main>
  );
}
