'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { LearningPracticeSet, LearningQuizGrade } from '@/lib/learning/types';

export default function PracticeQuizForm({
  practice,
  submitUrl,
  submitExtras,
  onCompleted,
}: {
  practice: LearningPracticeSet;
  submitUrl: string;
  submitExtras?: Record<string, unknown>;
  onCompleted?: (grade: LearningQuizGrade) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<LearningQuizGrade | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...submitExtras, answers }),
      });
      const data = await response.json().catch(() => ({})) as { grade?: LearningQuizGrade; error?: string };
      if (!response.ok || !data.grade) throw new Error(data.error || '练习提交失败');
      setGrade(data.grade);
      onCompleted?.(data.grade);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '练习提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {error && <div className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}
      <div className="space-y-5">
        {practice.questions.map((question, index) => {
          const result = grade?.results.find(item => item.questionId === question.id);
          return (
            <fieldset key={question.id} className="rounded-xl card-glass p-5 sm:p-6">
              <legend className="w-full px-0 text-sm font-semibold leading-7" style={{ color: 'var(--t-text)' }}>
                <span className="mr-2 text-[10px]" style={{ color: 'var(--t-gold)' }}>{String(index + 1).padStart(2, '0')}</span>
                {question.prompt}
              </legend>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {question.options.map(option => (
                  <label key={option.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-4 py-3 text-[11px] leading-6" style={{ color: 'var(--t-text2)', border: `1px solid ${answers[question.id] === option.id ? 'var(--t-border-acc)' : 'var(--t-border)'}`, background: answers[question.id] === option.id ? 'var(--ac-bg)' : 'transparent' }}>
                    <input type="radio" name={question.id} value={option.id} checked={answers[question.id] === option.id} onChange={() => { setAnswers(current => ({ ...current, [question.id]: option.id })); setGrade(null); }} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              {result && (
                <div className="mt-4 rounded-lg px-4 py-3 text-[10px] leading-6" style={{ color: result.correct ? '#22c55e' : '#ef4444', background: result.correct ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)' }}>
                  {result.correct ? '回答正确。' : '回答错误，已加入错题本。'} {result.explanation}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      {grade && (
        <div className="mt-6 rounded-xl px-5 py-5" style={{ border: `1px solid ${grade.passed ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`, background: grade.passed ? 'rgba(34,197,94,.05)' : 'rgba(239,68,68,.04)' }}>
          <div className="text-base font-semibold" style={{ color: grade.passed ? '#22c55e' : '#ef4444' }}>{grade.passed ? '本次练习通过' : '本次尚未通过'}</div>
          <div className="mt-1 text-[11px]" style={{ color: 'var(--t-faint)' }}>得分 {grade.score} · 答对 {grade.correctCount}/{grade.totalCount} · 未答对题目已进入错题本</div>
          <Link href="/practice/review" className="mt-3 inline-block text-[11px]" style={{ color: 'var(--t-gold)' }}>前往错题本复习 →</Link>
        </div>
      )}

      <button type="button" disabled={submitting} onClick={submit} className="mt-6 w-full rounded-lg px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-50" style={{ color: '#fffaf3', background: 'var(--ac)' }}>
        {submitting ? '正在确定性批改…' : grade ? '重新提交练习' : '提交全部答案'}
      </button>
    </>
  );
}
