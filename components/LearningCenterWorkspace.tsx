'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { LearningCourse, LearningCourseProgress } from '@/lib/learning/types';

interface CourseOverview {
  course: LearningCourse;
  progress: LearningCourseProgress;
}

export default function LearningCenterWorkspace() {
  const [courses, setCourses] = useState<CourseOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/learning/courses', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { courses?: CourseOverview[]; error?: string };
        if (!response.ok) throw new Error(data.error || '课程列表加载失败');
        setCourses(data.courses ?? []);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '课程列表加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回首页</Link>
          <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>LEARNING CENTER</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>紫微学习中心</h1>
          <p className="mt-3 max-w-2xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>
            从结构事实开始学习，再进入传统解释。课程、题目与来源随代码版本发布，学习进度保存在本地 SQLite。
          </p>
        </div>
        <Link
          href="/chart"
          className="rounded-lg px-4 py-2.5 text-xs"
          style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}
        >
          打开我的命盘 →
        </Link>
      </header>

      {loading && <PageState text="正在恢复学习进度…" />}
      {error && <PageState text={error} error />}

      {!loading && !error && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            {courses.map(({ course, progress }) => {
              const resumeLesson = progress.lastLessonId ?? course.lessons[0]?.id;
              const actionHref = resumeLesson
                ? `/learn/${course.slug}/${resumeLesson}`
                : `/learn/${course.slug}`;
              return (
                <article key={course.id} className="overflow-hidden rounded-2xl card-glass">
                  <div className="p-6 sm:p-7">
                    <div className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--t-faint)' }}>
                      <span className="rounded-full px-2.5 py-1" style={{ border: '1px solid var(--t-border)' }}>入门</span>
                      <span>{course.lessons.length} 章</span>
                      <span>·</span>
                      <span>约 {course.estimatedMinutes} 分钟</span>
                      <span>·</span>
                      <span>内容版本 {course.version}</span>
                    </div>
                    <h2 className="mt-4 text-xl font-semibold" style={{ color: 'var(--t-text)' }}>{course.title}</h2>
                    <p className="mt-2 text-sm leading-7" style={{ color: 'var(--t-text2)' }}>{course.subtitle}</p>
                    <p className="mt-4 text-xs leading-7" style={{ color: 'var(--t-faint)' }}>{course.description}</p>

                    <div className="mt-6">
                      <div className="mb-2 flex items-center justify-between text-[10px]" style={{ color: 'var(--t-faint)' }}>
                        <span>已完成 {progress.completedLessons}/{progress.totalLessons} 章</span>
                        <span>{progress.completionPercent}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--t-border)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${progress.completionPercent}%`, background: 'linear-gradient(90deg,#9a6210,#d4a843)' }} />
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link href={actionHref} className="rounded-lg px-5 py-2.5 text-xs" style={{ color: '#fff8e8', background: 'linear-gradient(135deg,#9a6210,#c88020)' }}>
                        {progress.startedLessons ? '继续学习' : '开始课程'}
                      </Link>
                      <Link href={`/learn/${course.slug}`} className="rounded-lg px-5 py-2.5 text-xs" style={{ color: 'var(--t-text)', border: '1px solid var(--t-border)' }}>
                        查看课程目录
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl card-glass p-5">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>这套课程怎么学</h2>
              <ol className="mt-4 space-y-3 text-[11px] leading-6" style={{ color: 'var(--t-text2)' }}>
                <li>1. 按章节顺序建立结构坐标。</li>
                <li>2. 每章完成确定性小测。</li>
                <li>3. 回到自己的命盘做同类识别。</li>
                <li>4. 通过后自动解锁下一章。</li>
              </ol>
            </div>
            <div className="rounded-xl p-5 text-[10px] leading-6" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>
              本阶段只做固定答案小测，不使用 AI 自由批改。后续开放综合题时，将先定义标准答案要点和评分规则。
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}

function PageState({ text, error = false }: { text: string; error?: boolean }) {
  return <div className="rounded-xl card-glass px-5 py-20 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>{text}</div>;
}
