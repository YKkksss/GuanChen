'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type {
  LearningCourse,
  LearningCourseLesson,
  LearningCourseProgress,
  LearningQuizGrade,
  LearningSourceReference,
} from '@/lib/learning/types';

export default function LearningLessonWorkspace({
  course,
  lesson,
  sources,
}: {
  course: LearningCourse;
  lesson: LearningCourseLesson;
  sources: LearningSourceReference[];
}) {
  const [progress, setProgress] = useState<LearningCourseProgress | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<LearningQuizGrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const currentIndex = course.lessons.findIndex(item => item.id === lesson.id);
  const previousLesson = currentIndex > 0 ? course.lessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < course.lessons.length - 1 ? course.lessons[currentIndex + 1] : null;
  const currentProgress = useMemo(() => progress?.lessons.find(item => item.lessonId === lesson.id) ?? null, [lesson.id, progress]);
  const completed = currentProgress?.status === 'completed' || grade?.passed === true;

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      setLockedBy(null);
      setGrade(null);
      try {
        const progressResponse = await fetch(`/api/learning/courses/${course.id}/progress`, { cache: 'no-store', signal: controller.signal });
        const progressData = await progressResponse.json().catch(() => ({})) as { progress?: LearningCourseProgress; error?: string };
        if (!progressResponse.ok || !progressData.progress) throw new Error(progressData.error || '学习进度加载失败');
        const progressMap = new Map(progressData.progress.lessons.map(item => [item.lessonId, item]));
        const unfinished = lesson.prerequisiteLessonIds.find(id => progressMap.get(id)?.status !== 'completed');
        if (unfinished) {
          setProgress(progressData.progress);
          setLockedBy(unfinished);
          return;
        }
        const startResponse = await fetch(`/api/learning/courses/${course.id}/lessons/${lesson.id}/progress`, { method: 'PUT', signal: controller.signal });
        const startData = await startResponse.json().catch(() => ({})) as { courseProgress?: LearningCourseProgress; error?: string };
        if (!startResponse.ok || !startData.courseProgress) throw new Error(startData.error || '章节学习状态更新失败');
        setProgress(startData.courseProgress);
        const saved = startData.courseProgress.lessons.find(item => item.lessonId === lesson.id);
        if (saved?.latestAnswers) setAnswers(saved.latestAnswers);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '章节加载失败');
      } finally {
        setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [course.id, lesson.id, lesson.prerequisiteLessonIds]);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/learning/courses/${course.id}/lessons/${lesson.id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await response.json().catch(() => ({})) as { grade?: LearningQuizGrade; courseProgress?: LearningCourseProgress; error?: string };
      if (!response.ok || !data.grade || !data.courseProgress) throw new Error(data.error || '答题提交失败');
      setGrade(data.grade);
      setProgress(data.courseProgress);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '答题提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const lockedLesson = lockedBy ? course.lessons.find(item => item.id === lockedBy) : null;

  if (loading) return <PageState text="正在恢复章节进度…" />;
  if (lockedLesson) {
    return (
      <main className="mx-auto max-w-[900px] px-4 py-20 text-center sm:px-6">
        <div className="rounded-2xl card-glass px-6 py-14">
          <div className="text-3xl">🔒</div>
          <h1 className="mt-4 text-xl font-semibold" style={{ color: 'var(--t-text)' }}>本章尚未解锁</h1>
          <p className="mt-3 text-xs" style={{ color: 'var(--t-faint)' }}>请先完成前置章节“{lockedLesson.title}”并通过小测。</p>
          <Link href={`/learn/${course.slug}/${lockedLesson.slug}`} className="mt-6 inline-block rounded-lg px-5 py-2.5 text-xs" style={{ color: '#fffaf3', background: 'var(--ac)' }}>前往前置章节</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-[980px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/learn/${course.slug}`} className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回课程目录</Link>
          <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>第 {lesson.order}/{course.lessons.length} 章 · 约 {lesson.durationMinutes} 分钟</span>
        </div>
        <h1 className="mt-5 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>{lesson.title}</h1>
        <p className="mt-3 text-sm leading-7" style={{ color: 'var(--t-text2)' }}>{lesson.summary}</p>
        <div className="mt-5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--t-border)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.round((lesson.order / course.lessons.length) * 100)}%`, background: 'var(--ac)' }} />
        </div>
      </header>

      {error && <div className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}

      <section className="rounded-xl card-glass p-5 sm:p-6">
        <div className="text-[10px] font-medium tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>本章目标</div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {lesson.objectives.map(item => <li key={item} className="text-[11px] leading-6" style={{ color: 'var(--t-text2)' }}>✓ {item}</li>)}
        </ul>
      </section>

      <div className="mt-5 space-y-5">
        {lesson.sections.map((section, index) => (
          <section key={section.id} className="rounded-xl card-glass p-5 sm:p-6">
            <div className="text-[10px]" style={{ color: 'var(--t-faint)' }}>0{index + 1}</div>
            <h2 className="mt-1 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>{section.title}</h2>
            <div className="mt-4 space-y-3">
              {section.paragraphs.map(paragraph => <p key={paragraph} className="text-[12px] leading-7" style={{ color: 'var(--t-text2)' }}>{paragraph}</p>)}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {section.keyPoints.map(point => <span key={point} className="rounded-full px-3 py-1 text-[9px]" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>{point}</span>)}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-5 rounded-xl p-5 sm:p-6" style={{ border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.035)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>常见错误</h2>
        <ul className="mt-3 space-y-2 text-[11px] leading-6" style={{ color: 'var(--t-text2)' }}>
          {lesson.commonMistakes.map(item => <li key={item}>• {item}</li>)}
        </ul>
      </section>

      <section className="mt-5 rounded-2xl card-glass p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>DETERMINISTIC QUIZ</div>
            <h2 className="mt-2 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>章节小测</h2>
          </div>
          <span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>全部答对即通过 · 可重复作答</span>
        </div>

        <div className="mt-6 space-y-7">
          {lesson.quiz.map((question, questionIndex) => {
            const result = grade?.results.find(item => item.questionId === question.id);
            return (
              <fieldset key={question.id}>
                <legend className="text-xs font-medium leading-6" style={{ color: 'var(--t-text)' }}>{questionIndex + 1}. {question.prompt}</legend>
                <div className="mt-3 grid gap-2">
                  {question.options.map(option => (
                    <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-[11px]" style={{ color: 'var(--t-text2)', border: `1px solid ${answers[question.id] === option.id ? 'var(--t-border-acc)' : 'var(--t-border)'}`, background: answers[question.id] === option.id ? 'var(--ac-bg)' : 'transparent' }}>
                      <input type="radio" name={question.id} value={option.id} checked={answers[question.id] === option.id} onChange={() => { setAnswers(current => ({ ...current, [question.id]: option.id })); setGrade(null); }} />
                      {option.label}
                    </label>
                  ))}
                </div>
                {result && (
                  <div className="mt-3 rounded-lg px-4 py-3 text-[10px] leading-6" style={{ color: result.correct ? '#22c55e' : '#ef4444', background: result.correct ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)' }}>
                    {result.correct ? '回答正确。' : '回答错误。'} {result.explanation}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>

        {grade && (
          <div className="mt-6 rounded-xl px-5 py-4" style={{ border: `1px solid ${grade.passed ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`, background: grade.passed ? 'rgba(34,197,94,.05)' : 'rgba(239,68,68,.04)' }}>
            <div className="text-sm font-semibold" style={{ color: grade.passed ? '#22c55e' : '#ef4444' }}>{grade.passed ? '本章已通过' : '还差一点，再核对后重试'}</div>
            <div className="mt-1 text-[10px]" style={{ color: 'var(--t-faint)' }}>得分 {grade.score} · 答对 {grade.correctCount}/{grade.totalCount}</div>
          </div>
        )}

        <button type="button" disabled={submitting} onClick={submit} className="mt-6 w-full rounded-lg px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-50" style={{ color: '#fffaf3', background: 'var(--ac)' }}>
          {submitting ? '正在批改…' : completed ? '重新提交本章小测' : '提交本章小测'}
        </button>
      </section>

      <section className="mt-5 rounded-xl card-glass p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>本章依据</h2>
        <div className="mt-3 space-y-3">
          {sources.map(source => (
            <div key={source.id} className="text-[10px] leading-6" style={{ color: 'var(--t-text2)' }}>
              {source.href ? <Link href={source.href} className="font-medium" style={{ color: 'var(--t-gold)' }}>{source.title} →</Link> : <span className="font-medium">{source.title}</span>}
              <div style={{ color: 'var(--t-faint)' }}>{source.note} · {source.locator}</div>
            </div>
          ))}
        </div>
      </section>

      <nav className="mt-7 flex flex-wrap items-center justify-between gap-3">
        {previousLesson ? <Link href={`/learn/${course.slug}/${previousLesson.slug}`} className="rounded-lg px-4 py-2.5 text-xs" style={{ color: 'var(--t-text)', border: '1px solid var(--t-border)' }}>← 上一章</Link> : <span />}
        <div className="flex flex-wrap gap-3">
          <Link href="/chart" className="rounded-lg px-4 py-2.5 text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)' }}>去我的命盘练习</Link>
          {nextLesson && completed && <Link href={`/learn/${course.slug}/${nextLesson.slug}`} className="rounded-lg px-4 py-2.5 text-xs" style={{ color: '#fffaf3', background: 'var(--ac)' }}>下一章 →</Link>}
          {!nextLesson && completed && <Link href={`/learn/${course.slug}`} className="rounded-lg px-4 py-2.5 text-xs" style={{ color: '#fffaf3', background: 'var(--ac)' }}>查看课程完成情况</Link>}
        </div>
      </nav>
    </main>
  );
}

function PageState({ text }: { text: string }) {
  return <main className="mx-auto max-w-[980px] px-4 py-24 text-center text-sm" style={{ color: 'var(--t-faint)' }}>{text}</main>;
}
