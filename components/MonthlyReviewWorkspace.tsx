'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarBlank, CheckCircle, FloppyDisk, Plus, Trash, X } from '@phosphor-icons/react';
import type { ConversationListItem } from '@/lib/conversations/types';
import { LIFE_EVENT_CATEGORIES, LIFE_EVENT_CATEGORY_LABELS, type LifeEventCategory } from '@/lib/events/types';
import type {
  MonthlyReview,
  MonthlyReviewDimension,
  MonthlyReviewMatch,
  MonthlyReviewScores,
} from '@/lib/monthly-reviews/types';

const DIMENSIONS: Array<{ key: MonthlyReviewDimension; label: string; hint: string }> = [
  { key: 'career', label: '事业', hint: '工作、学业与执行状态' },
  { key: 'relationship', label: '感情', hint: '亲密关系与人际感受' },
  { key: 'health', label: '健康', hint: '身体、睡眠与精力状态' },
  { key: 'finance', label: '财务', hint: '收入、支出与风险感受' },
];

const MATCH_OPTIONS: Array<{ value: MonthlyReviewMatch; label: string }> = [
  { value: 'not_reviewed', label: '暂不判断' },
  { value: 'matched', label: '基本符合' },
  { value: 'partial', label: '部分符合' },
  { value: 'not_matched', label: '明显不符' },
];

interface Props {
  initialConversationId: string;
  initialMonth: string;
  initialReminderInstanceId: string;
}

export default function MonthlyReviewWorkspace({
  initialConversationId,
  initialMonth,
  initialReminderInstanceId,
}: Props) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [reviews, setReviews] = useState<MonthlyReview[]>([]);
  const [active, setActive] = useState<MonthlyReview | null>(null);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [reviewMonth, setReviewMonth] = useState(validMonth(initialMonth) ? initialMonth : currentMonth());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [conversationResponse, reviewResponse] = await Promise.all([
        fetch('/api/conversations?type=chart&status=active&limit=100', { cache: 'no-store' }),
        fetch('/api/monthly-reviews?limit=100', { cache: 'no-store' }),
      ]);
      const conversationData = await conversationResponse.json() as { conversations?: ConversationListItem[]; error?: string };
      const reviewData = await reviewResponse.json() as { reviews?: MonthlyReview[]; error?: string };
      if (!conversationResponse.ok) throw new Error(conversationData.error || '命盘列表加载失败');
      if (!reviewResponse.ok) throw new Error(reviewData.error || '月度复盘加载失败');
      setConversations(conversationData.conversations ?? []);
      setReviews(reviewData.reviews ?? []);
      if (!conversationId && conversationData.conversations?.length === 1) {
        setConversationId(conversationData.conversations[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '月度复盘加载失败');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const conversationNames = useMemo(
    () => new Map(conversations.map(item => [item.id, item.title])),
    [conversations],
  );

  async function startReview() {
    if (!conversationId) { setError('请先选择需要复盘的单人命盘'); return; }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/monthly-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          reviewMonth,
          reminderInstanceId: initialReminderInstanceId || null,
        }),
      });
      const data = await response.json() as { review?: MonthlyReview; error?: string };
      if (!response.ok || !data.review) throw new Error(data.error || '月度复盘创建失败');
      setActive(data.review);
      setDirty(false);
      setReviews(current => upsertReview(current, data.review!));
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : '月度复盘创建失败');
    } finally {
      setSaving(false);
    }
  }

  function updateActive(patch: Partial<MonthlyReview>) {
    setActive(current => current ? { ...current, ...patch } : current);
    setDirty(true);
  }

  async function saveDraft(): Promise<MonthlyReview | null> {
    if (!active || active.status !== 'draft') return active;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/monthly-reviews/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importantEvents: active.importantEvents,
          scores: active.scores,
          priorPrediction: active.priorPrediction,
          actualOutcome: active.actualOutcome,
          predictionMatch: active.predictionMatch,
          corrections: active.corrections,
          nextFocus: active.nextFocus,
        }),
      });
      const data = await response.json() as { review?: MonthlyReview; error?: string };
      if (!response.ok || !data.review) throw new Error(data.error || '复盘草稿保存失败');
      setActive(data.review);
      setReviews(current => upsertReview(current, data.review!));
      setDirty(false);
      return data.review;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '复盘草稿保存失败');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft(review: MonthlyReview) {
    if (!window.confirm(`确定删除 ${monthLabel(review.reviewMonth)} 的复盘草稿吗？`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/monthly-reviews/${review.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || '复盘草稿删除失败');
      }
      setReviews(current => current.filter(item => item.id !== review.id));
      if (active?.id === review.id) setActive(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '复盘草稿删除失败');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReview(input: { saveToMemory: boolean; event: { title: string; category: LifeEventCategory; impactLevel: 1 | 2 | 3 | 4 | 5 } | null }) {
    const saved = await saveDraft();
    if (!saved) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/monthly-reviews/${saved.id}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const data = await response.json() as { review?: MonthlyReview; error?: string };
      if (!response.ok || !data.review) throw new Error(data.error || '月度复盘确认失败');
      setActive(data.review);
      setReviews(current => upsertReview(current, data.review!));
      setConfirmOpen(false);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : '月度复盘确认失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="case-form mx-auto min-h-screen max-w-[1280px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--t-faint)' }}>
            <Link href="/reminders">← 返回提醒中心</Link>
            <Link href="/">首页</Link>
          </div>
          <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>MONTHLY REALITY REVIEW</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>月度复盘</h1>
          <p className="mt-3 max-w-3xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>把当月真实经历与既往判断分开记录。草稿不会进入 AI 上下文，只有你确认后才会按勾选项沉淀为人生事件或长期记忆。</p>
        </div>
      </header>

      {error && <div className="mb-5 rounded-lg p-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.3)' }}>{error}</div>}

      <section className="mb-6 grid gap-3 rounded-xl card-glass p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <Field label="复盘命盘">
          <select value={conversationId} onChange={event => setConversationId(event.target.value)} className="field-control">
            <option value="">请选择单人命盘</option>
            {conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </Field>
        <Field label="复盘月份"><input type="month" value={reviewMonth} onChange={event => setReviewMonth(event.target.value)} className="field-control" /></Field>
        <button type="button" disabled={saving || loading || !conversations.length} onClick={() => void startReview()} className="flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-xs disabled:opacity-40" style={{ color: '#fffaf3', background: 'var(--ac)' }}><Plus size={14} />开始或继续复盘</button>
      </section>

      <div className="grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside>
          <div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>复盘记录</h2><p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>每个命盘每月一份</p></div><span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>{reviews.length} 份</span></div>
          {loading ? <PanelState text="正在加载复盘…" /> : !reviews.length ? <PanelState text="还没有复盘记录。" /> : <div className="space-y-2">{reviews.map(review => <ReviewListItem key={review.id} review={review} active={active?.id === review.id} conversationTitle={conversationNames.get(review.conversationId) || '未知命盘'} onOpen={() => { setActive(review); setDirty(false); }} onDelete={() => void deleteDraft(review)} />)}</div>}
        </aside>

        <section className="min-w-0">
          {!active ? <EmptyEditor /> : active.status === 'confirmed' ? <ConfirmedReview review={active} conversationTitle={conversationNames.get(active.conversationId) || '未知命盘'} /> : (
            <ReviewEditor review={active} dirty={dirty} saving={saving} onUpdate={updateActive} onSave={() => void saveDraft()} onConfirm={() => setConfirmOpen(true)} />
          )}
        </section>
      </div>

      {confirmOpen && active && <ConfirmReviewDialog review={active} saving={saving} onClose={() => setConfirmOpen(false)} onConfirm={confirmReview} />}
    </main>
  );
}

function ReviewEditor({ review, dirty, saving, onUpdate, onSave, onConfirm }: {
  review: MonthlyReview;
  dirty: boolean;
  saving: boolean;
  onUpdate: (patch: Partial<MonthlyReview>) => void;
  onSave: () => void;
  onConfirm: () => void;
}) {
  const setScore = (key: MonthlyReviewDimension, value: number | null) => onUpdate({ scores: { ...review.scores, [key]: value } });
  return <div className="rounded-2xl card-glass p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="rounded-full px-2 py-1 text-[8px]" style={{ color: '#f59e0b', border: '1px solid #f59e0b' }}>草稿</span><h2 className="mt-3 text-xl font-semibold" style={{ color: 'var(--t-text)' }}>{monthLabel(review.reviewMonth)}复盘</h2><p className="mt-2 text-[10px]" style={{ color: 'var(--t-faint)' }}>预测与现实分别填写，避免事后把结论改写成“早已预测到”。</p></div><span className="text-[9px]" style={{ color: dirty ? '#f59e0b' : '#22c55e' }}>{dirty ? '有未保存修改' : '草稿已保存'}</span></div>

    <div className="mt-7 space-y-7">
      <ReviewBlock index="01" title="本月发生的重要事件" hint="只记录事实：发生了什么、时间节点和结果。"><textarea rows={4} value={review.importantEvents} onChange={event => onUpdate({ importantEvents: event.target.value })} className="field-control resize-y" placeholder="例如：完成项目交付、搬家、开始一段关系……" /></ReviewBlock>
      <ReviewBlock index="02" title="四项状态自评" hint="1 分代表明显承压，5 分代表状态很好；允许留空。"><div className="grid gap-3 sm:grid-cols-2">{DIMENSIONS.map(item => <ScoreField key={item.key} item={item} value={review.scores[item.key]} onChange={value => setScore(item.key, value)} />)}</div></ReviewBlock>
      <ReviewBlock index="03" title="检验上月预测" hint="先写当时的原始判断，再单独写本月真实结果。"><div className="grid gap-4 md:grid-cols-2"><Field label="上月预测或判断"><textarea rows={5} value={review.priorPrediction} onChange={event => onUpdate({ priorPrediction: event.target.value })} className="field-control resize-y" placeholder="尽量保留原意，不要按结果倒推改写。" /></Field><Field label="本月实际情况（确认前必填）"><textarea rows={5} value={review.actualOutcome} onChange={event => onUpdate({ actualOutcome: event.target.value })} className="field-control resize-y" placeholder="只写现实中实际发生或没有发生的情况。" /></Field></div><div className="mt-4 flex flex-wrap gap-2">{MATCH_OPTIONS.map(item => <button key={item.value} type="button" onClick={() => onUpdate({ predictionMatch: item.value })} className="rounded-lg px-3 py-2 text-[9px]" style={review.predictionMatch === item.value ? { color: '#fffaf3', background: 'var(--ac)' } : { color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{item.label}</button>)}</div></ReviewBlock>
      <ReviewBlock index="04" title="需要修正的判断" hint="写清楚哪些结论过度、遗漏或证据不足。"><textarea rows={4} value={review.corrections} onChange={event => onUpdate({ corrections: event.target.value })} className="field-control resize-y" placeholder="例如：之前把短期压力误判成长期趋势……" /></ReviewBlock>
      <ReviewBlock index="05" title="下月观察重点" hint="设置可验证、可回看的观察项，不必下绝对结论。"><textarea rows={4} value={review.nextFocus} onChange={event => onUpdate({ nextFocus: event.target.value })} className="field-control resize-y" placeholder="例如：观察项目资源是否到位、睡眠是否持续改善……" /></ReviewBlock>
    </div>

    <div className="mt-7 flex flex-wrap justify-end gap-3"><button type="button" disabled={saving || !dirty} onClick={onSave} className="flex items-center gap-2 rounded-lg px-5 py-3 text-xs disabled:opacity-40" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}><FloppyDisk size={14} />保存草稿</button><button type="button" disabled={saving || !review.actualOutcome.trim()} onClick={onConfirm} className="flex items-center gap-2 rounded-lg px-5 py-3 text-xs disabled:opacity-40" style={{ color: '#fffaf3', background: 'var(--ac)' }}><CheckCircle size={14} />确认本月复盘</button></div>
  </div>;
}

function ConfirmReviewDialog({ review, saving, onClose, onConfirm }: {
  review: MonthlyReview;
  saving: boolean;
  onClose: () => void;
  onConfirm: (input: { saveToMemory: boolean; event: { title: string; category: LifeEventCategory; impactLevel: 1 | 2 | 3 | 4 | 5 } | null }) => Promise<void>;
}) {
  const [saveToMemory, setSaveToMemory] = useState(true);
  const [createEvent, setCreateEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventCategory, setEventCategory] = useState<LifeEventCategory>('career');
  const [impactLevel, setImpactLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const canSubmit = !saving && (!createEvent || eventTitle.trim().length > 0);
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-5"><section role="dialog" aria-modal="true" aria-labelledby="confirm-review-title" className="max-h-[92vh] w-full max-w-[640px] overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl sm:p-6" style={{ background: 'var(--t-bg)', border: '1px solid var(--t-border-acc)' }}><div className="flex items-start justify-between gap-4"><div><div className="text-[9px] tracking-[.22em]" style={{ color: 'var(--t-gold)' }}>USER CONFIRMATION</div><h2 id="confirm-review-title" className="mt-2 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>确认 {monthLabel(review.reviewMonth)}复盘</h2><p className="mt-2 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>确认后复盘内容会锁定，并自动完成关联提醒。以下沉淀操作只执行你明确勾选的项目。</p></div><button type="button" aria-label="关闭确认复盘" onClick={onClose} className="rounded-lg p-2" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}><X size={15} /></button></div>
    <div className="mt-6 space-y-3"><ToggleCard checked={saveToMemory} onChange={setSaveToMemory} title="保存为长期记忆" description="把本月实际情况、判断修正和下月观察重点提供给以后相关的 AI 对话。" /><ToggleCard checked={createEvent} onChange={setCreateEvent} title="同步一条重要人生事件" description="只有本月确有值得进入时间轴的重要事件时才建议开启。" /></div>
    {createEvent && <div className="mt-5 grid gap-4 rounded-xl p-4 sm:grid-cols-2" style={{ background: 'var(--ac-bg)', border: '1px solid var(--t-border)' }}><div className="sm:col-span-2"><Field label="事件标题"><input autoFocus value={eventTitle} onChange={event => setEventTitle(event.target.value)} maxLength={100} className="field-control" placeholder="例如：完成重要项目交付" /></Field></div><Field label="事件类型"><select value={eventCategory} onChange={event => setEventCategory(event.target.value as LifeEventCategory)} className="field-control">{LIFE_EVENT_CATEGORIES.map(category => <option key={category} value={category}>{LIFE_EVENT_CATEGORY_LABELS[category]}</option>)}</select></Field><Field label="影响程度"><select value={impactLevel} onChange={event => setImpactLevel(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)} className="field-control">{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} 级</option>)}</select></Field></div>}
    <div className="mt-5 rounded-lg p-3 text-[10px] leading-5" style={{ color: 'var(--t-text2)', background: 'var(--ac-bg)', border: '1px solid var(--t-border)' }}>未勾选的内容不会进入人生事件或长期记忆。复盘原文仍会作为已确认记录保存在本机 SQLite 中。</div>
    <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-5 py-3 text-xs" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>返回修改</button><button type="button" disabled={!canSubmit} onClick={() => void onConfirm({ saveToMemory, event: createEvent ? { title: eventTitle, category: eventCategory, impactLevel } : null })} className="rounded-lg px-5 py-3 text-xs disabled:opacity-40" style={{ color: '#fffaf3', background: 'var(--ac)' }}>{saving ? '正在确认…' : '确认并锁定'}</button></div>
  </section></div>;
}

function ConfirmedReview({ review, conversationTitle }: { review: MonthlyReview; conversationTitle: string }) {
  return <article className="rounded-2xl card-glass p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="rounded-full px-2 py-1 text-[8px]" style={{ color: '#22c55e', border: '1px solid #22c55e' }}>已确认</span><h2 className="mt-3 text-xl font-semibold" style={{ color: 'var(--t-text)' }}>{monthLabel(review.reviewMonth)}复盘</h2><p className="mt-2 text-[10px]" style={{ color: 'var(--t-faint)' }}>{conversationTitle} · 确认后内容已锁定</p></div><div className="flex flex-wrap gap-2">{review.generatedMemoryId && <Tag text="已写入长期记忆" />}{review.generatedEventId && <Tag text="已写入人生事件" />}</div></div><div className="mt-7 space-y-5"><ReadBlock title="重要事件" content={review.importantEvents} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{DIMENSIONS.map(item => <div key={item.key} className="rounded-xl p-3 text-center" style={{ background: 'var(--ac-bg)', border: '1px solid var(--t-border)' }}><div className="text-lg font-semibold" style={{ color: review.scores[item.key] ? 'var(--t-gold)' : 'var(--t-faint)' }}>{review.scores[item.key] ?? '—'}</div><div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{item.label}</div></div>)}</div><div className="grid gap-4 md:grid-cols-2"><ReadBlock title="原始预测" content={review.priorPrediction} /><ReadBlock title={`实际结果 · ${MATCH_OPTIONS.find(item => item.value === review.predictionMatch)?.label}`} content={review.actualOutcome} /></div><ReadBlock title="判断修正" content={review.corrections} /><ReadBlock title="下月观察重点" content={review.nextFocus} /></div><div className="mt-7 flex flex-wrap gap-3">{review.generatedEventId && <Link href={`/chart/${review.conversationId}/events`} className="rounded-lg px-4 py-2 text-[10px]" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)' }}>查看人生事件 →</Link>}<Link href={`/chart/${review.conversationId}`} className="rounded-lg px-4 py-2 text-[10px]" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>返回关联命盘 →</Link></div></article>;
}

function ReviewListItem({ review, active, conversationTitle, onOpen, onDelete }: { review: MonthlyReview; active: boolean; conversationTitle: string; onOpen: () => void; onDelete: () => void }) {
  return <div className="group relative"><button type="button" onClick={onOpen} className="w-full rounded-xl p-4 pr-10 text-left transition" style={active ? { background: 'var(--ac-bg)', border: '1px solid var(--t-border-acc)' } : { background: 'var(--t-card)', border: '1px solid var(--t-border)' }}><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium" style={{ color: 'var(--t-text)' }}>{monthLabel(review.reviewMonth)}</span><span className="text-[8px]" style={{ color: review.status === 'confirmed' ? '#22c55e' : '#f59e0b' }}>{review.status === 'confirmed' ? '已确认' : '草稿'}</span></div><p className="mt-2 truncate text-[9px]" style={{ color: 'var(--t-faint)' }}>{conversationTitle}</p></button>{review.status === 'draft' && <button type="button" aria-label={`删除 ${monthLabel(review.reviewMonth)} 草稿`} onClick={onDelete} className="absolute bottom-3 right-3 rounded p-1 opacity-70 sm:opacity-0 sm:group-hover:opacity-100" style={{ color: '#ef4444' }}><Trash size={13} /></button>}</div>;
}

function ScoreField({ item, value, onChange }: { item: typeof DIMENSIONS[number]; value: number | null; onChange: (value: number | null) => void }) {
  return <div className="rounded-xl p-3" style={{ background: 'var(--ac-bg)', border: '1px solid var(--t-border)' }}><div className="flex items-start justify-between"><div><div className="text-xs" style={{ color: 'var(--t-text)' }}>{item.label}</div><div className="mt-1 text-[8px]" style={{ color: 'var(--t-faint)' }}>{item.hint}</div></div>{value && <button type="button" onClick={() => onChange(null)} className="text-[8px]" style={{ color: 'var(--t-faint)' }}>清空</button>}</div><div className="mt-3 grid grid-cols-5 gap-1">{[1, 2, 3, 4, 5].map(score => <button key={score} type="button" onClick={() => onChange(score)} className="rounded-md py-2 text-[10px]" style={value === score ? { color: '#fffaf3', background: 'var(--ac)' } : { color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{score}</button>)}</div></div>;
}

function ReviewBlock({ index, title, hint, children }: { index: string; title: string; hint: string; children: ReactNode }) { return <section><div className="mb-3 flex gap-3"><span className="pt-0.5 text-[9px]" style={{ color: 'var(--t-gold)' }}>{index}</span><div><h3 className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>{title}</h3><p className="mt-1 text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>{hint}</p></div></div>{children}</section>; }
function ReadBlock({ title, content }: { title: string; content: string }) { return <section><h3 className="text-[10px] font-medium" style={{ color: 'var(--t-gold)' }}>{title}</h3><p className="mt-2 whitespace-pre-wrap text-xs leading-6" style={{ color: content ? 'var(--t-text2)' : 'var(--t-faint)' }}>{content || '未填写'}</p></section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-[10px]" style={{ color: 'var(--t-faint)' }}>{label}<div className="mt-2">{children}</div></label>; }
function ToggleCard({ checked, onChange, title, description }: { checked: boolean; onChange: (value: boolean) => void; title: string; description: string }) { return <label className="flex cursor-pointer items-start gap-3 rounded-xl p-4" style={{ background: checked ? 'var(--ac-bg)' : 'var(--t-card)', border: `1px solid ${checked ? 'var(--t-border-acc)' : 'var(--t-border)'}` }}><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5 accent-amber-700" /><span><span className="block text-xs" style={{ color: 'var(--t-text)' }}>{title}</span><span className="mt-1 block text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>{description}</span></span></label>; }
function Tag({ text }: { text: string }) { return <span className="rounded-full px-2 py-1 text-[8px]" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)' }}>{text}</span>; }
function PanelState({ text }: { text: string }) { return <div className="rounded-xl card-glass px-4 py-12 text-center text-[10px]" style={{ color: 'var(--t-faint)' }}>{text}</div>; }
function EmptyEditor() { return <div className="rounded-2xl card-glass px-6 py-24 text-center"><CalendarBlank size={30} className="mx-auto" style={{ color: 'var(--t-gold)' }} /><h2 className="mt-5 text-base font-semibold" style={{ color: 'var(--t-text)' }}>选择或开始一份月度复盘</h2><p className="mx-auto mt-2 max-w-md text-[10px] leading-6" style={{ color: 'var(--t-faint)' }}>建议月底或下月初完成。先记现实，再核对预测，最后决定是否沉淀到长期数据。</p></div>; }
function monthLabel(value: string) { const [year, month] = value.split('-'); return `${year} 年 ${Number(month)} 月`; }
function validMonth(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function currentMonth() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date()); }
function upsertReview(reviews: MonthlyReview[], review: MonthlyReview) { return [review, ...reviews.filter(item => item.id !== review.id)].sort((a, b) => b.reviewMonth.localeCompare(a.reviewMonth)); }
