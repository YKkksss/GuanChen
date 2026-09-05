'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Check, X } from '@phosphor-icons/react';
import styles from './LifeEventCandidateInbox.module.css';
import {
  LIFE_EVENT_CATEGORIES,
  LIFE_EVENT_CATEGORY_LABELS,
  type LifeEventCandidate,
  type LifeEventCategory,
  type LifeEventDatePrecision,
} from '@/lib/events/types';

const PRECISIONS: Array<{ value: LifeEventDatePrecision; label: string }> = [
  { value: 'year', label: '仅年份' },
  { value: 'month', label: '年月' },
  { value: 'day', label: '完整日期' },
  { value: 'range', label: '日期范围' },
  { value: 'unknown', label: '日期不详' },
];

type CandidateForm = ReturnType<typeof candidateToForm>;

export default function LifeEventCandidateInbox({ conversationId, compact = false }: { conversationId: string; compact?: boolean }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<LifeEventCandidate[]>([]);
  const [active, setActive] = useState<LifeEventCandidate | null>(null);
  const [form, setForm] = useState<CandidateForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  const [expanded, setExpanded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/event-candidates?status=pending`, { cache: 'no-store' });
      const data = await response.json() as { candidates?: LifeEventCandidate[] };
      if (response.ok) setCandidates(data.candidates ?? []);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (!detail?.conversationId || detail.conversationId === conversationId) void reload();
    };
    window.addEventListener('life-event-candidates-updated', handleUpdate);
    return () => window.removeEventListener('life-event-candidates-updated', handleUpdate);
  }, [conversationId, reload]);

  const openReview = (candidate: LifeEventCandidate) => {
    setActive(candidate);
    setForm(candidateToForm(candidate));
    setError('');
  };

  const dismiss = async (candidate: LifeEventCandidate) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/event-candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || '候选忽略失败');
      setCandidates(current => current.filter(item => item.id !== candidate.id));
      if (active?.id === candidate.id) { setActive(null); setForm(null); }
    } catch (dismissError) {
      setError(dismissError instanceof Error ? dismissError.message : '候选忽略失败');
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (!active || !form || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/event-candidates/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', event: form }),
      });
      const data = await response.json() as { event?: { title: string }; error?: string };
      if (!response.ok || !data.event) throw new Error(data.error || '事件确认失败');
      setCandidates(current => current.filter(item => item.id !== active.id));
      setSavedTitle(data.event.title);
      setActive(null);
      setForm(null);
      window.dispatchEvent(new Event('conversation-updated'));
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : '事件确认失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading || (!candidates.length && !savedTitle)) return null;
  const first = candidates[0];

  return <>
    <div className={compact ? styles.compact : 'shrink-0 border-t px-3 py-2.5'} style={{ borderColor: 'var(--t-border)', background: 'rgba(212,168,67,.045)' }}>
      {compact && <button type="button" className={styles.toggle} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <CalendarCheck size={15} aria-hidden="true" />
        <span>{candidates.length ? `待核对事件 · ${candidates.length}` : '事件已保存'}</span>
        <span className={styles.toggleHint}>{expanded ? '收起' : '展开'}</span>
      </button>}
      {(!compact || expanded) && <div className={compact ? styles.preview : undefined}>
      {savedTitle && (!compact || !first) ? (
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="flex min-w-0 items-center gap-1.5" style={{ color: 'var(--t-gold)' }}><Check size={13} weight="bold" /><span className="truncate">已保存：{savedTitle}</span></span>
          <button type="button" onClick={() => router.push(`/chart/${conversationId}/events`)} style={{ color: 'var(--t-faint)' }}>查看时间轴 →</button>
        </div>
      ) : first ? (
        <div>
          <div className="flex items-start gap-2">
            <CalendarCheck size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--t-gold)' }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-medium" style={{ color: 'var(--t-text)' }}>发现可能的人生事件：{first.title}</span>
                {candidates.length > 1 && <span className="shrink-0 text-[9px]" style={{ color: 'var(--t-faint)' }}>共 {candidates.length} 条</span>}
              </div>
              <p className="mt-1 line-clamp-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{first.sourceExcerpt}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => openReview(first)} className="rounded-md px-2.5 py-1 text-[9px]" style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.3)' }}>核对后保存</button>
                <button type="button" disabled={saving} onClick={() => void dismiss(first)} className="px-2 py-1 text-[9px] disabled:opacity-40" style={{ color: 'var(--t-faint)' }}>忽略</button>
              </div>
            </div>
          </div>
          {error && <p className="mt-2 text-[9px] text-red-500">{error}</p>}
        </div>
      ) : null}
      </div>}
    </div>

    {active && form && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="核对人生事件候选">
        <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-xl p-4 shadow-2xl" style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>核对后保存人生事件</h3><p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>AI 只生成候选；你确认前不会进入时间轴和长期记忆。</p></div>
            <button type="button" onClick={() => { setActive(null); setForm(null); setError(''); }} aria-label="关闭"><X size={17} style={{ color: 'var(--t-faint)' }} /></button>
          </div>

          <div className="mt-3 rounded-lg p-3 text-[10px] leading-5" style={{ background: 'rgba(212,168,67,.05)', border: '1px solid rgba(212,168,67,.16)', color: 'var(--t-text2)' }}>
            <div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>用户原话</div>
            {active.sourceExcerpt}
            {!!active.reviewNotes.length && <div className="mt-1" style={{ color: 'var(--t-gold)' }}>需核对：{active.reviewNotes.join('；')}</div>}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="事件标题"><input className="candidate-input" value={form.title} maxLength={100} onChange={event => setForm({ ...form, title: event.target.value })} /></Field>
            <Field label="事件类型"><select className="candidate-input" value={form.category} onChange={event => setForm({ ...form, category: event.target.value as LifeEventCategory })}>{LIFE_EVENT_CATEGORIES.map(category => <option key={category} value={category}>{LIFE_EVENT_CATEGORY_LABELS[category]}</option>)}</select></Field>
            {form.category === 'custom' && <Field label="自定义类型"><input className="candidate-input" value={form.customCategory} maxLength={40} onChange={event => setForm({ ...form, customCategory: event.target.value })} /></Field>}
            <Field label="日期精度"><select className="candidate-input" value={form.datePrecision} onChange={event => setForm(changePrecision(form, event.target.value as LifeEventDatePrecision))}>{PRECISIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
            {form.datePrecision !== 'unknown' && <Field label={form.datePrecision === 'range' ? '开始日期' : '事件日期'}><input className="candidate-input" type={form.datePrecision === 'year' ? 'number' : form.datePrecision === 'month' ? 'month' : 'date'} value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} /></Field>}
            {form.datePrecision === 'range' && <Field label="结束日期"><input className="candidate-input" type="date" value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })} /></Field>}
            <Field label="影响程度"><select className="candidate-input" value={form.impactLevel} onChange={event => setForm({ ...form, impactLevel: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 })}>{[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>{level} / 5</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="事件说明（可修改）"><textarea className="candidate-input min-h-24 resize-y" value={form.description} maxLength={2000} onChange={event => setForm({ ...form, description: event.target.value })} /></Field></div>
          </div>
          {error && <p className="mt-3 text-[10px] text-red-500">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={saving} onClick={() => void dismiss(active)} className="rounded-lg px-4 py-2 text-[10px] disabled:opacity-40" style={{ border: '1px solid var(--t-border)', color: 'var(--t-faint)' }}>忽略候选</button>
            <button type="button" disabled={saving || !form.title.trim()} onClick={() => void confirm()} className="flex-1 rounded-lg py-2 text-[10px] disabled:opacity-40" style={{ border: '1px solid rgba(212,168,67,.32)', background: 'rgba(212,168,67,.1)', color: 'var(--t-gold)' }}>{saving ? '正在保存…' : '确认并写入时间轴'}</button>
          </div>
        </div>
      </div>
    )}

    <style jsx global>{`
      .candidate-input { width: 100%; border-radius: .5rem; border: 1px solid var(--t-border); background: var(--t-bg); color: var(--t-text); padding: .6rem .7rem; font-size: .6875rem; outline: none; }
      .candidate-input:focus { border-color: rgba(212,168,67,.45); }
    `}</style>
  </>;
}

function candidateToForm(candidate: LifeEventCandidate) {
  return {
    title: candidate.title,
    category: candidate.category,
    customCategory: candidate.customCategory ?? '',
    startDate: candidate.startDate,
    endDate: candidate.endDate ?? '',
    datePrecision: candidate.datePrecision,
    description: candidate.description ?? '',
    impactLevel: candidate.impactLevel,
  };
}

function changePrecision(form: CandidateForm, precision: LifeEventDatePrecision): CandidateForm {
  const year = form.startDate.slice(0, 4) || String(new Date().getFullYear());
  return {
    ...form,
    datePrecision: precision,
    startDate: precision === 'unknown' ? '' : precision === 'year' ? year : precision === 'month' ? `${year}-01` : `${year}-01-01`,
    endDate: precision === 'range' ? `${year}-12-31` : '',
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</span>{children}</label>;
}
