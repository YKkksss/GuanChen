'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ConversationListItem } from '@/lib/conversations/types';
import type {
  LearningOpenExercise,
  LearningOpenExerciseTemplateId,
  LearningOpenExerciseTemplateSummary,
  LearningOpenPracticeAttempt,
} from '@/lib/learning/types';

interface WorkspaceResponse {
  templates?: LearningOpenExerciseTemplateSummary[];
  exercise?: LearningOpenExercise;
  attempts?: LearningOpenPracticeAttempt[];
  error?: string;
}

export default function OpenEndedPracticeWorkspace() {
  const [charts, setCharts] = useState<ConversationListItem[]>([]);
  const [templates, setTemplates] = useState<LearningOpenExerciseTemplateSummary[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [templateId, setTemplateId] = useState<LearningOpenExerciseTemplateId>('ming-structure');
  const [exercise, setExercise] = useState<LearningOpenExercise | null>(null);
  const [attempts, setAttempts] = useState<LearningOpenPracticeAttempt[]>([]);
  const [currentAttempt, setCurrentAttempt] = useState<LearningOpenPracticeAttempt | null>(null);
  const [parentAttemptId, setParentAttemptId] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/conversations?type=chart&limit=100', { cache: 'no-store', signal: controller.signal }),
      fetch('/api/learning/practice/open-ended', { cache: 'no-store', signal: controller.signal }),
    ]).then(async ([chartResponse, templateResponse]) => {
      const chartData = await chartResponse.json().catch(() => ({})) as { conversations?: ConversationListItem[]; error?: string };
      const templateData = await templateResponse.json().catch(() => ({})) as WorkspaceResponse;
      if (!chartResponse.ok) throw new Error(chartData.error || '命盘列表加载失败');
      if (!templateResponse.ok) throw new Error(templateData.error || '练习类型加载失败');
      setCharts(chartData.conversations ?? []);
      setTemplates(templateData.templates ?? []);
    }).catch(loadError => {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error ? loadError.message : '开放式练习加载失败');
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const loadExercise = async () => {
    setError('');
    setExercise(null);
    setCurrentAttempt(null);
    setAttempts([]);
    setAnswer('');
    setParentAttemptId(null);
    try {
      const response = await fetch(`/api/learning/practice/open-ended?conversationId=${encodeURIComponent(conversationId)}&templateId=${encodeURIComponent(templateId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as WorkspaceResponse;
      if (!response.ok || !data.exercise) throw new Error(data.error || '开放式练习生成失败');
      setExercise(data.exercise);
      setAttempts(data.attempts ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '开放式练习生成失败');
    }
  };

  const submit = async () => {
    if (!exercise) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/learning/practice/open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: exercise.conversationId, templateId: exercise.templateId, answer, parentAttemptId }),
      });
      const data = await response.json().catch(() => ({})) as { attempt?: LearningOpenPracticeAttempt; error?: string };
      if (!response.ok || !data.attempt) throw new Error(data.error || '开放式练习提交失败');
      setCurrentAttempt(data.attempt);
      setAttempts(current => [data.attempt!, ...current.filter(item => item.id !== data.attempt!.id)]);
      setParentAttemptId(null);
      window.scrollTo({ top: document.body.scrollHeight * 0.45, behavior: 'smooth' });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '开放式练习提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const retryFeedback = async (attempt: LearningOpenPracticeAttempt) => {
    setRetrying(true);
    setError('');
    try {
      const response = await fetch(`/api/learning/practice/open-ended/${attempt.id}/feedback`, { method: 'POST' });
      const data = await response.json().catch(() => ({})) as { attempt?: LearningOpenPracticeAttempt; error?: string };
      if (!response.ok || !data.attempt) throw new Error(data.error || 'AI 反馈重试失败');
      setCurrentAttempt(data.attempt);
      setAttempts(current => current.map(item => item.id === data.attempt!.id ? data.attempt! : item));
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'AI 反馈重试失败');
    } finally {
      setRetrying(false);
    }
  };

  const revise = (attempt: LearningOpenPracticeAttempt) => {
    setAnswer(attempt.answer);
    setParentAttemptId(attempt.id);
    setCurrentAttempt(attempt);
    window.scrollTo({ top: 360, behavior: 'smooth' });
  };

  const evidenceById = useMemo(() => new Map(exercise?.evidencePoints.map(item => [item.id, item]) ?? []), [exercise]);

  return (
    <main className="mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7">
        <Link href="/practice" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回练习中心</Link>
        <div className="mt-5 text-[10px] font-medium tracking-[.24em]" style={{ color: 'var(--t-gold)' }}>OPEN-ENDED INTERPRETATION</div>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>开放式命盘解读训练</h1>
        <p className="mt-3 max-w-3xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>先由程序按命盘快照和固定量表评分，再由 AI 解释遗漏、事实问题和表达顺序。AI 不参与排盘，也不能修改程序分数。</p>
      </header>

      {error && <div className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}

      <section className="mb-6 rounded-2xl card-glass p-5 sm:p-6">
        {loading ? <div className="text-xs" style={{ color: 'var(--t-faint)' }}>正在准备命盘和练习类型…</div> : charts.length ? (
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
              选择单人命盘
              <select value={conversationId} onChange={event => { setConversationId(event.target.value); setExercise(null); }} className="mt-2 w-full rounded-lg px-4 py-3 text-xs" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
                <option value="">请选择命盘</option>
                {charts.map(chart => <option key={chart.id} value={chart.id}>{chart.title}</option>)}
              </select>
            </label>
            <label className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
              选择训练题型
              <select value={templateId} onChange={event => { setTemplateId(event.target.value as LearningOpenExerciseTemplateId); setExercise(null); }} className="mt-2 w-full rounded-lg px-4 py-3 text-xs" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
                {templates.map(template => <option key={template.id} value={template.id}>{template.title}</option>)}
              </select>
            </label>
            <button type="button" disabled={!conversationId} onClick={loadExercise} className="self-end rounded-lg px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40" style={{ color: '#fffaf3', background: 'var(--ac)' }}>载入练习</button>
          </div>
        ) : <div className="text-xs" style={{ color: 'var(--t-faint)' }}>还没有已保存的单人命盘。<Link href="/chart" style={{ color: 'var(--t-gold)' }}>先去起盘 →</Link></div>}
      </section>

      {exercise && (
        <>
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,.85fr)]">
            <div className="space-y-5">
              <article className="rounded-2xl card-glass p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] tracking-[.18em]" style={{ color: 'var(--t-gold)' }}>CURRENT EXERCISE</div>
                    <h2 className="mt-2 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>{exercise.title}</h2>
                  </div>
                  <span className="rounded-full px-3 py-1 text-[9px]" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>约 {exercise.estimatedMinutes} 分钟</span>
                </div>
                <p className="mt-4 text-xs leading-7" style={{ color: 'var(--t-text2)' }}>{exercise.prompt}</p>
                <div className="mt-4 text-[10px]" style={{ color: 'var(--t-faint)' }}>{exercise.recommendedLength} · {exercise.passScore} 分通过</div>
              </article>

              <article className="rounded-2xl card-glass p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>写下你的分析</h2>
                  <span className="text-[10px]" style={{ color: answer.replace(/\s+/g, '').length < 120 ? 'var(--t-faint)' : '#22c55e' }}>{answer.replace(/\s+/g, '').length} 字符</span>
                </div>
                {parentAttemptId && <div className="mt-3 rounded-lg px-3 py-2 text-[10px]" style={{ color: 'var(--t-gold)', background: 'var(--ac-bg)' }}>正在基于上一版答案修订；提交后会保留版本关联。</div>}
                <textarea value={answer} onChange={event => setAnswer(event.target.value)} rows={15} placeholder="建议按“盘面事实 → 结构关系 → 传统解释 → 现实验证边界”的顺序作答……" className="mt-4 w-full resize-y rounded-xl px-4 py-4 text-xs leading-7 outline-none" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }} />
                <button type="button" disabled={submitting || !answer.trim()} onClick={submit} className="mt-4 w-full rounded-lg px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-50" style={{ color: '#fffaf3', background: 'var(--ac)' }}>
                  {submitting ? '程序评分完成，正在生成 AI 学习反馈…' : '提交答案并获取反馈'}
                </button>
              </article>
            </div>

            <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
              <details open className="rounded-2xl card-glass p-5">
                <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--t-text)' }}>可核对的盘面事实</summary>
                <div className="mt-4 space-y-3">
                  {exercise.evidencePoints.map(point => <div key={point.id} className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)' }}><div className="text-[10px] font-medium" style={{ color: 'var(--t-text)' }}>{point.label}</div><div className="mt-1 text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>{point.fact}</div></div>)}
                </div>
              </details>
              <details className="rounded-2xl card-glass p-5">
                <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--t-text)' }}>公开评分量表</summary>
                <div className="mt-4 space-y-3">
                  {exercise.rubric.map(item => <div key={item.id} className="flex gap-3 text-[10px] leading-5"><span className="min-w-10 font-semibold" style={{ color: 'var(--t-gold)' }}>{item.maxScore} 分</span><span style={{ color: 'var(--t-text2)' }}><b style={{ color: 'var(--t-text)' }}>{item.title}</b><br />{item.description}</span></div>)}
                </div>
              </details>
              <div className="rounded-xl px-4 py-3 text-[9px] leading-5" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>{exercise.boundary}</div>
            </aside>
          </section>

          {currentAttempt && <AttemptResult attempt={currentAttempt} evidenceById={evidenceById} retrying={retrying} onRetry={() => retryFeedback(currentAttempt)} onRevise={() => revise(currentAttempt)} />}

          <section className="mt-7 rounded-2xl card-glass p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4"><h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>历史尝试与修订记录</h2><span className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{attempts.length} 次</span></div>
            {!attempts.length && <div className="mt-5 text-xs" style={{ color: 'var(--t-faint)' }}>提交第一版答案后，这里会保留程序评分、AI 反馈和后续修订关系。</div>}
            <div className="mt-5 space-y-3">
              {attempts.map((attempt, index) => (
                <details key={attempt.id} className="rounded-xl p-4" style={{ border: '1px solid var(--t-border)' }}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-[11px]">
                    <span style={{ color: 'var(--t-text)' }}>第 {attempts.length - index} 次 · {formatDate(attempt.createdAt)} {attempt.parentAttemptId ? '· 修订版' : ''}</span>
                    <span style={{ color: attempt.passed ? '#22c55e' : '#f59e0b' }}>{attempt.score} 分 · {attemptStatusLabel(attempt.status)}</span>
                  </summary>
                  <p className="mt-4 whitespace-pre-wrap text-[10px] leading-6" style={{ color: 'var(--t-text2)' }}>{attempt.answer}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => setCurrentAttempt(attempt)} className="text-[10px]" style={{ color: 'var(--t-gold)' }}>查看完整反馈</button>
                    <button type="button" onClick={() => revise(attempt)} className="text-[10px]" style={{ color: 'var(--t-gold)' }}>基于此版本继续修改</button>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function AttemptResult({ attempt, evidenceById, retrying, onRetry, onRevise }: {
  attempt: LearningOpenPracticeAttempt;
  evidenceById: Map<string, LearningOpenExercise['evidencePoints'][number]>;
  retrying: boolean;
  onRetry: () => void;
  onRevise: () => void;
}) {
  const deductions = attempt.grade.rawScore - attempt.grade.score;
  return (
    <section className="mt-7 space-y-5" aria-live="polite">
      <article className="rounded-2xl p-6" style={{ border: `1px solid ${attempt.passed ? 'rgba(34,197,94,.28)' : 'rgba(245,158,11,.28)'}`, background: attempt.passed ? 'rgba(34,197,94,.04)' : 'rgba(245,158,11,.04)' }}>
        <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-[10px]" style={{ color: 'var(--t-faint)' }}>程序最终评分</div><div className="mt-1 text-4xl font-semibold" style={{ color: attempt.passed ? '#22c55e' : '#f59e0b' }}>{attempt.score}<span className="text-sm font-normal"> / 100</span></div></div><div className="text-right text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>{attempt.passed ? '已达到本题通过线' : `距离通过线还差 ${Math.max(0, attempt.grade.passScore - attempt.score)} 分`}<br />要点原始分 {attempt.grade.rawScore}{deductions ? ` · 规则扣分 ${deductions}` : ''}</div></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{attempt.grade.criteria.map(item => <div key={item.criterionId} className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)' }}><div className="flex justify-between gap-2 text-[9px]"><span style={{ color: 'var(--t-text)' }}>{item.title}</span><span style={{ color: 'var(--t-gold)' }}>{item.score}/{item.maxScore}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: 'var(--t-border)' }}><div className="h-full rounded-full" style={{ width: `${item.maxScore ? item.score / item.maxScore * 100 : 100}%`, background: 'var(--ac)' }} /></div></div>)}</div>
        {!!attempt.grade.detectedIssues.length && <div className="mt-5 space-y-2">{attempt.grade.detectedIssues.map(issue => <div key={issue.ruleId} className="rounded-lg px-3 py-2 text-[10px] leading-5 text-red-500" style={{ border: '1px solid rgba(239,68,68,.2)' }}>{issue.title}（-{issue.deduction}）：{issue.detail}</div>)}</div>}
        <details className="mt-5"><summary className="cursor-pointer text-[10px]" style={{ color: 'var(--t-gold)' }}>查看程序识别的覆盖与遗漏</summary><div className="mt-3 grid gap-4 sm:grid-cols-2"><EvidenceList title="已覆盖" ids={attempt.grade.coveredEvidencePointIds} evidenceById={evidenceById} good /><EvidenceList title="待补齐" ids={attempt.grade.missingEvidencePointIds} evidenceById={evidenceById} /></div></details>
      </article>

      {attempt.status === 'completed' && attempt.feedback ? (
        <article className="rounded-2xl card-glass p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>AI 学习反馈</h2><span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{attempt.provider} / {attempt.model}</span></div>
          <p className="mt-4 text-xs leading-7" style={{ color: 'var(--t-text2)' }}>{attempt.feedback.summary}</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2"><FeedbackList title="做得好的部分" items={attempt.feedback.strengths} /><FeedbackList title="遗漏要点" items={attempt.feedback.omissions} /><FeedbackList title="事实与层级问题" items={attempt.feedback.factIssues} /><FeedbackList title="推理顺序建议" items={attempt.feedback.reasoningSuggestions} /><FeedbackList title="表达改进" items={attempt.feedback.expressionSuggestions} /><FeedbackList title="下一版优先修改" items={attempt.feedback.nextRevisionFocus} /></div>
          <div className="mt-5 space-y-3">{attempt.feedback.criterionComments.map(comment => <div key={comment.criterionId} className="rounded-lg p-4" style={{ border: '1px solid var(--t-border)' }}><div className="text-[10px] font-medium" style={{ color: 'var(--t-gold)' }}>{attempt.exercise.rubric.find(item => item.id === comment.criterionId)?.title ?? comment.criterionId}</div><p className="mt-2 text-[10px] leading-6" style={{ color: 'var(--t-text2)' }}>{comment.comment}</p></div>)}</div>
          <div className="mt-5 text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>{attempt.feedback.disclaimer}</div>
          <button type="button" onClick={onRevise} className="mt-5 rounded-lg px-5 py-2.5 text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>基于反馈修改下一版</button>
        </article>
      ) : (
        <article className="rounded-2xl card-glass p-6"><h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>程序评分已保存</h2><p className="mt-3 text-xs leading-6" style={{ color: 'var(--t-faint)' }}>AI 学习反馈暂时生成失败，不影响本次答案、程序得分和版本记录。</p><button type="button" disabled={retrying} onClick={onRetry} className="mt-4 rounded-lg px-5 py-2.5 text-xs disabled:opacity-50" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>{retrying ? '正在重试 AI 反馈…' : '重试生成 AI 反馈'}</button></article>
      )}
    </section>
  );
}

function EvidenceList({ title, ids, evidenceById, good = false }: { title: string; ids: string[]; evidenceById: Map<string, LearningOpenExercise['evidencePoints'][number]>; good?: boolean }) {
  return <div><div className="text-[10px] font-medium" style={{ color: good ? '#22c55e' : '#f59e0b' }}>{title} · {ids.length}</div><ul className="mt-2 space-y-1 text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>{ids.map(id => <li key={id}>· {evidenceById.get(id)?.label ?? id}</li>)}</ul></div>;
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-xl p-4" style={{ border: '1px solid var(--t-border)' }}><div className="text-[10px] font-medium" style={{ color: 'var(--t-text)' }}>{title}</div>{items.length ? <ul className="mt-3 space-y-2 text-[10px] leading-5" style={{ color: 'var(--t-text2)' }}>{items.map((item, index) => <li key={`${title}-${index}`}>· {item}</li>)}</ul> : <div className="mt-3 text-[9px]" style={{ color: 'var(--t-faint)' }}>本次未发现</div>}</div>;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function attemptStatusLabel(status: LearningOpenPracticeAttempt['status']) {
  return status === 'completed' ? '反馈完成' : status === 'feedback_failed' ? '反馈待重试' : '反馈生成中';
}
