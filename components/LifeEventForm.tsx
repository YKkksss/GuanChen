'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  LIFE_EVENT_CATEGORIES,
  LIFE_EVENT_CATEGORY_LABELS,
  type LifeEventCategory,
  type LifeEventDatePrecision,
  type LifeEventWithTransits,
} from '@/lib/events/types';

interface LifeEventFormProps {
  event?: LifeEventWithTransits | null;
  birthYear: number;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (input: Record<string, unknown>) => void;
}

const PRECISION_OPTIONS: Array<{ value: LifeEventDatePrecision; label: string }> = [
  { value: 'year', label: '仅年份' },
  { value: 'month', label: '年月' },
  { value: 'day', label: '完整日期' },
  { value: 'range', label: '日期范围' },
  { value: 'unknown', label: '日期不详' },
];

function initialForm(event: LifeEventWithTransits | null | undefined, birthYear: number) {
  return {
    title: event?.title ?? '',
    category: event?.category ?? 'career' as LifeEventCategory,
    customCategory: event?.customCategory ?? '',
    datePrecision: event?.datePrecision ?? 'year' as LifeEventDatePrecision,
    startDate: event?.startDate ?? String(Math.max(birthYear, new Date().getFullYear())),
    endDate: event?.endDate ?? '',
    description: event?.description ?? '',
    impactLevel: event?.impactLevel ?? 3,
  };
}

export default function LifeEventForm({
  event,
  birthYear,
  saving,
  error,
  onCancel,
  onSave,
}: LifeEventFormProps) {
  const [form, setForm] = useState(() => initialForm(event, birthYear));
  const titleId = useId();
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleInput.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => setForm(initialForm(event, birthYear)), [event, birthYear]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const changePrecision = (precision: LifeEventDatePrecision) => {
    const currentYear = form.startDate.slice(0, 4) || String(birthYear);
    setForm(current => ({
      ...current,
      datePrecision: precision,
      startDate: precision === 'unknown'
        ? ''
        : precision === 'year'
          ? currentYear
          : precision === 'month'
            ? `${currentYear}-01`
            : `${currentYear}-01-01`,
      endDate: precision === 'range' ? `${currentYear}-12-31` : '',
    }));
  };

  return (
    <section aria-labelledby={titleId} aria-busy={saving} className="rounded-xl card-glass p-4 lg:sticky lg:top-4"
      onKeyDown={e => { if (e.key === 'Escape' && !saving) { e.stopPropagation(); onCancel(); } }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>{event ? '编辑人生事件' : '记录人生事件'}</h2>
          <p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>只有你确认保存后，才会进入长期档案</p>
        </div>
        <button type="button" disabled={saving} onClick={onCancel} className="text-lg" style={{ color: 'var(--t-faint)' }} aria-label="关闭表单">×</button>
      </div>

      <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); if (!saving && form.title.trim()) onSave(form); }}>
        <Field label="事件标题">
          <input
            ref={titleInput}
            required
            value={form.title}
            onChange={e => set('title', e.target.value)}
            maxLength={100}
            placeholder="例如：第一次正式工作"
            className="event-input"
          />
        </Field>

        <Field label="事件类型">
          <select value={form.category} onChange={e => set('category', e.target.value as LifeEventCategory)} className="event-input">
            {LIFE_EVENT_CATEGORIES.map(category => (
              <option key={category} value={category}>{LIFE_EVENT_CATEGORY_LABELS[category]}</option>
            ))}
          </select>
        </Field>

        {form.category === 'custom' && (
          <Field label="自定义类型">
            <input required value={form.customCategory} onChange={e => set('customCategory', e.target.value)} maxLength={40} className="event-input" />
          </Field>
        )}

        <ChoiceGroup label="日期精度">
          <div className="grid grid-cols-3 gap-1.5">
            {PRECISION_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => changePrecision(option.value)}
                aria-pressed={form.datePrecision === option.value}
                className="rounded-lg px-2 py-2 text-[10px]"
                style={{
                  color: form.datePrecision === option.value ? 'var(--t-gold)' : 'var(--t-faint)',
                  border: `1px solid ${form.datePrecision === option.value ? 'rgba(212,168,67,.32)' : 'var(--t-border)'}`,
                  background: form.datePrecision === option.value ? 'rgba(212,168,67,.08)' : 'transparent',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </ChoiceGroup>

        {form.datePrecision !== 'unknown' && (
          <Field label={form.datePrecision === 'range' ? '开始日期' : '事件日期'}>
            <input
              type={form.datePrecision === 'year' ? 'number' : form.datePrecision === 'month' ? 'month' : 'date'}
              required
              min={form.datePrecision === 'year' ? birthYear : undefined}
              max={form.datePrecision === 'year' ? birthYear + 130 : undefined}
              value={form.startDate}
              onChange={e => set('startDate', e.target.value)}
              className="event-input"
            />
          </Field>
        )}

        {form.datePrecision === 'range' && (
          <Field label="结束日期">
            <input required type="date" min={form.startDate} value={form.endDate} onChange={e => set('endDate', e.target.value)} className="event-input" />
          </Field>
        )}

        <ChoiceGroup label="影响程度">
          <div className="flex gap-1.5">
            {([1, 2, 3, 4, 5] as const).map(level => (
              <button
                key={level}
                type="button"
                onClick={() => set('impactLevel', level)}
                aria-pressed={form.impactLevel === level}
                aria-label={`影响程度 ${level}`}
                className="h-8 flex-1 rounded-lg text-[10px]"
                style={{
                  color: form.impactLevel >= level ? 'var(--t-gold)' : 'var(--t-faint)',
                  border: '1px solid var(--t-border)',
                  background: form.impactLevel >= level ? 'rgba(212,168,67,.08)' : 'transparent',
                }}
              >
                {level}
              </button>
            ))}
          </div>
        </ChoiceGroup>

        <Field label="事件说明（可选）">
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="记录当时发生了什么，以及这件事对你的影响"
            className="event-input resize-none"
          />
        </Field>

        {error && <div role="alert" className="rounded-lg px-3 py-2 text-[10px] text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}

        <div className="flex gap-2 pt-1">
          <button type="button" disabled={saving} onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-[11px]" style={{ border: '1px solid var(--t-border)', color: 'var(--t-faint)' }}>取消</button>
          <button
            type="submit"
            disabled={saving || !form.title.trim()}
            className="flex-1 rounded-lg py-2.5 text-[11px] disabled:opacity-40"
            style={{ border: '1px solid rgba(212,168,67,.32)', background: 'rgba(212,168,67,.10)', color: 'var(--t-gold)' }}
          >
            {saving ? '正在保存…' : event ? '保存修改' : '确认记录'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .event-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--t-border);
          background: var(--t-card);
          color: var(--t-text);
          padding: 0.625rem 0.75rem;
          font-size: 0.6875rem;
          outline: none;
        }
        .event-input:focus { border-color: var(--t-gold); outline: 2px solid var(--t-gold); outline-offset: 2px; }
      `}</style>
    </section>
  );
}

function ChoiceGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <fieldset><legend className="mb-1.5 text-[10px]" style={{ color: 'var(--t-faint)' }}>{label}</legend>{children}</fieldset>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</span>
      {children}
    </label>
  );
}
