'use client';

import { BirthDateFields, BirthTimeFields } from './BirthDateTimeFields';
import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  Check,
  ClockCounterClockwise,
  Plus,
  Scales,
} from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type {
  RectificationSessionListItem,
  RectificationStatus,
  RectificationTimeSlotKey,
  ReportedTimeSource,
} from '@/lib/rectification/types';
import type { BirthInfo } from '@/lib/ziwei/types';

const TIME_SLOTS: Array<{ key: RectificationTimeSlotKey; label: string; range: string }> = [
  { key: 'early_zi', label: '早子', range: '23:00-00:00' },
  { key: 'chou', label: '丑时', range: '01:00-03:00' },
  { key: 'yin', label: '寅时', range: '03:00-05:00' },
  { key: 'mao', label: '卯时', range: '05:00-07:00' },
  { key: 'chen', label: '辰时', range: '07:00-09:00' },
  { key: 'si', label: '巳时', range: '09:00-11:00' },
  { key: 'wu', label: '午时', range: '11:00-13:00' },
  { key: 'wei', label: '未时', range: '13:00-15:00' },
  { key: 'shen', label: '申时', range: '15:00-17:00' },
  { key: 'you', label: '酉时', range: '17:00-19:00' },
  { key: 'xu', label: '戌时', range: '19:00-21:00' },
  { key: 'hai', label: '亥时', range: '21:00-23:00' },
  { key: 'late_zi', label: '晚子', range: '00:00-01:00' },
];

const STATUS_LABELS: Record<RectificationStatus, string> = {
  draft: '草稿',
  ready: '待评估',
  evaluated: '已评估',
  confirmed: '已选定',
  archived: '已归档',
};

const SOURCE_OPTIONS: Array<{ value: ReportedTimeSource; label: string }> = [
  { value: 'unknown', label: '不清楚' },
  { value: 'birth_certificate', label: '出生证明' },
  { value: 'hospital_record', label: '医院记录' },
  { value: 'household_record', label: '户籍记录' },
  { value: 'family_written_record', label: '家人书面记录' },
  { value: 'family_memory', label: '家人口述' },
  { value: 'self_memory', label: '本人记忆' },
];

interface FormState {
  title: string;
  name: string;
  date: string;
  gender: '' | 'male' | 'female';
  province: string;
  city: string;
  longitude: string;
  source: ReportedTimeSource;
  precision: 'exact' | 'approximate' | 'range' | 'period' | 'unknown';
  startTime: string;
  endTime: string;
  timezoneId: string;
  notes: string;
}

const INITIAL_FORM: FormState = {
  title: '',
  name: '',
  date: '',
  gender: '',
  province: '',
  city: '',
  longitude: '',
  source: 'unknown',
  precision: 'unknown',
  startTime: '',
  endTime: '',
  timezoneId: 'Asia/Shanghai',
  notes: '',
};

export default function RectificationHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const [sessions, setSessions] = useState<RectificationSessionListItem[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [selectedSlots, setSelectedSlots] = useState<RectificationTimeSlotKey[]>(TIME_SLOTS.map(item => item.key));
  const [loading, setLoading] = useState(true);
  const [prefillLoading, setPrefillLoading] = useState(Boolean(conversationId));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/rectifications?limit=50', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { sessions?: RectificationSessionListItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || '读取校时记录失败');
        setSessions(data.sessions ?? []);
      })
      .catch(fetchError => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(fetchError instanceof Error ? fetchError.message : '读取校时记录失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    const controller = new AbortController();
    fetch(`/api/conversations/${conversationId}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as {
          conversation?: { chartSnapshot?: { birthInfo: BirthInfo } | null };
          error?: string;
        };
        if (!response.ok || !data.conversation?.chartSnapshot) {
          throw new Error(data.error || '关联命盘不存在');
        }
        const birth = data.conversation.chartSnapshot.birthInfo;
        setForm(current => ({
          ...current,
          title: `${birth.name || '当前命盘'}的出生时辰校正`,
          name: birth.name ?? '',
          date: toDateInput(birth.year, birth.month, birth.day),
          gender: birth.gender,
          province: birth.province ?? '',
          city: birth.city ?? '',
          longitude: birth.longitude === undefined ? '' : String(birth.longitude),
        }));
      })
      .catch(fetchError => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(fetchError instanceof Error ? fetchError.message : '关联命盘读取失败');
      })
      .finally(() => setPrefillLoading(false));
    return () => controller.abort();
  }, [conversationId]);

  const selectedSummary = useMemo(() => {
    if (selectedSlots.length === TIME_SLOTS.length) return '全部 13 个时段';
    return `${selectedSlots.length} 个候选时段`;
  }, [selectedSlots]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const toggleSlot = (slot: RectificationTimeSlotKey) => {
    setSelectedSlots(current => (
      current.includes(slot) ? current.filter(item => item !== slot) : [...current, slot]
    ));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (selectedSlots.length < 2) {
      setError('请至少选择两个候选时段');
      return;
    }
    if (!form.date) {
      setError('请选择出生日期');
      return;
    }
    const [year, month, day] = form.date.split('-').map(Number);
    setCreating(true);
    try {
      const longitude = form.longitude.trim() === '' ? undefined : Number(form.longitude);
      const response = await fetch('/api/rectifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceConversationId: conversationId || undefined,
          title: form.title.trim() || undefined,
          baseBirthInfo: {
            year,
            month,
            day,
            gender: form.gender,
            name: form.name.trim() || undefined,
            province: form.province.trim() || undefined,
            city: form.city.trim() || undefined,
            longitude,
          },
          reportedTimeEvidence: {
            source: form.source,
            precision: form.precision,
            reportedStartLocal: form.precision === 'unknown' ? null : normalizeInputTime(form.startTime),
            reportedEndLocal: form.precision === 'range' || form.precision === 'period'
              ? normalizeInputTime(form.endTime)
              : null,
            timezoneId: form.timezoneId.trim() || null,
            longitude: longitude ?? null,
            notes: form.notes.trim() || null,
          },
          candidateSlotKeys: selectedSlots,
        }),
      });
      const data = await response.json() as { session?: { id: string }; error?: string };
      if (!response.ok || !data.session) throw new Error(data.error || '创建校时任务失败');
      router.push(`/rectification/${data.session.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '创建校时任务失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-[100dvh]" style={{ background: 'var(--bg-0)', color: 'var(--tx-1)' }}>
      <header className="border-b" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 md:px-6">
          <button type="button" className="btn-ghost !px-4 !py-2" onClick={() => router.push('/')}>
            <ArrowLeft size={16} weight="bold" /> 返回首页
          </button>
          <div className="text-right">
            <h1 className="text-lg font-semibold tracking-wide">出生时辰校正</h1>
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>用已发生事件比较候选命盘</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 md:px-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <section className="min-w-0">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">校时记录</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--tx-3)' }}>每次事件、评估和选定结果都会保留。</p>
            </div>
            <span className="font-mono text-xs" style={{ color: 'var(--tx-3)' }}>{sessions.length} 条</span>
          </div>

          {loading && <SessionSkeleton />}
          {!loading && sessions.length === 0 && (
            <div className="rounded-xl border px-6 py-16 text-center" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
              <ClockCounterClockwise className="mx-auto mb-4" size={34} style={{ color: 'var(--ac)' }} />
              <p className="font-medium">还没有校时记录</p>
              <p className="mt-2 text-sm" style={{ color: 'var(--tx-3)' }}>在右侧填写出生信息后创建第一份任务。</p>
            </div>
          )}
          {!loading && sessions.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {sessions.map(session => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => router.push(`/rectification/${session.id}`)}
                  className="group rounded-xl border p-5 text-left transition-transform active:scale-[0.99]"
                  style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{session.title}</h3>
                      <p className="mt-1 text-xs" style={{ color: 'var(--tx-3)' }}>
                        {formatBirthDate(session.baseBirthInfo)} · {session.baseBirthInfo.gender === 'male' ? '男' : '女'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md px-2 py-1 text-[11px]" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}>
                      {STATUS_LABELS[session.status]}
                    </span>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t pt-3 text-xs" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>
                    <span>{session.candidateCount} 个候选</span>
                    <span className="flex items-center gap-1" style={{ color: 'var(--ac-dim)' }}>
                      打开工作台 <ArrowRight size={13} weight="bold" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)', boxShadow: 'var(--sh-sm)' }}>
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}>
              <Plus size={20} weight="bold" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">新建校时任务</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--tx-3)' }}>
                {conversationId ? '已从当前命盘带入基本信息。' : '先建立候选时段，再录入人生事件。'}
              </p>
            </div>
          </div>

          {prefillLoading ? <FormSkeleton /> : (
            <form className="rectification-form space-y-5" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="任务名称" className="sm:col-span-2">
                  <input value={form.title} onChange={event => updateForm('title', event.target.value)} placeholder="例如：我的出生时辰校正" className="rectification-input" />
                </Field>
                <Field label="姓名">
                  <input value={form.name} onChange={event => updateForm('name', event.target.value)} placeholder="选填" className="rectification-input" />
                </Field>
                <Field label="性别">
                  <select required aria-label="性别" value={form.gender} onChange={event => updateForm('gender', event.target.value as FormState['gender'])} className="rectification-input">
                    <option value="">请选择性别</option><option value="male">男</option>
                    <option value="female">女</option>
                  </select>
                </Field>
                <fieldset className="sm:col-span-2"><legend className="mb-1.5 text-xs">出生日期</legend><BirthDateFields value={form.date} onChange={value => updateForm('date', value)} /></fieldset>
                <Field label="省份">
                  <input value={form.province} onChange={event => updateForm('province', event.target.value)} placeholder="选填" className="rectification-input" />
                </Field>
                <Field label="城市">
                  <input value={form.city} onChange={event => updateForm('city', event.target.value)} placeholder="选填" className="rectification-input" />
                </Field>
                <details className="sm:col-span-2 space-y-3 rounded-lg border p-3" style={{ borderColor: 'var(--bdr)' }}><summary className="cursor-pointer py-2 text-sm">高级设置 · 经度与历史时区</summary>
                <Field label="出生地经度" hint="用于真太阳时换算">
                  <input type="number" min="-180" max="180" step="0.0001" value={form.longitude} onChange={event => updateForm('longitude', event.target.value)} placeholder="例如 116.4074" className="rectification-input" />
                </Field>
                <Field label="历史时区">
                  <input value={form.timezoneId} onChange={event => updateForm('timezoneId', event.target.value)} placeholder="Asia/Shanghai" className="rectification-input" />
                </Field>
                </details>
              </div>

              <div className="border-t pt-5" style={{ borderColor: 'var(--bdr)' }}>
                <h3 className="mb-4 text-sm font-medium">已有出生时间线索</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="来源">
                    <select value={form.source} onChange={event => updateForm('source', event.target.value as ReportedTimeSource)} className="rectification-input">
                      {SOURCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field label="精度">
                    <select value={form.precision} onChange={event => updateForm('precision', event.target.value as FormState['precision'])} className="rectification-input">
                      <option value="unknown">完全不清楚</option>
                      <option value="exact">精确时间</option>
                      <option value="approximate">大约时间</option>
                      <option value="range">时间范围</option>
                      <option value="period">大致时段</option>
                    </select>
                  </Field>
                  {form.precision !== 'unknown' && (
                    <fieldset><legend className="mb-1.5 text-xs">开始时间</legend><BirthTimeFields label="开始" value={form.startTime} onChange={value => updateForm('startTime', value)} /></fieldset>
                  )}
                  {(form.precision === 'range' || form.precision === 'period') && (
                    <fieldset><legend className="mb-1.5 text-xs">结束时间</legend><BirthTimeFields label="结束" value={form.endTime} onChange={value => updateForm('endTime', value)} /></fieldset>
                  )}
                  <Field label="补充说明" className="sm:col-span-2">
                    <textarea value={form.notes} onChange={event => updateForm('notes', event.target.value)} rows={2} placeholder="例如：家人记得接近中午" className="rectification-input resize-none" />
                  </Field>
                </div>
              </div>

              <div className="border-t pt-5" style={{ borderColor: 'var(--bdr)' }}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">候选时段</h3>
                    <p className="mt-1 text-xs" style={{ color: 'var(--tx-3)' }}>至少选择两个，子时分为早子和晚子。</p>
                  </div>
                  <button type="button" onClick={() => setSelectedSlots(TIME_SLOTS.map(item => item.key))} className="text-xs" style={{ color: 'var(--ac-dim)' }}>全选</button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TIME_SLOTS.map(slot => {
                    const active = selectedSlots.includes(slot.key);
                    return (
                      <button
                        key={slot.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleSlot(slot.key)}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left active:scale-[0.98]"
                        style={{ borderColor: active ? 'var(--ac-bdr)' : 'var(--bdr)', background: active ? 'var(--ac-bg)' : 'var(--bg-1)' }}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border" style={{ borderColor: active ? 'var(--ac)' : 'var(--bdr-heavy)', background: active ? 'var(--ac)' : 'transparent', color: '#fff' }}>
                          {active && <Check size={11} weight="bold" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-medium">{slot.label}</span>
                          <span className="block font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{slot.range}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && <div role="alert" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(168,50,40,.35)', color: 'var(--ji)', background: 'rgba(168,50,40,.06)' }}>{error}</div>}

              <button type="submit" disabled={creating} className="btn-accent w-full justify-center disabled:cursor-not-allowed disabled:opacity-60">
                <Scales size={17} weight="bold" />
                {creating ? '正在建立候选命盘…' : `创建任务，比较${selectedSummary}`}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="flex items-center justify-between gap-2 text-xs font-medium">
        {label}
        {hint && <span className="font-normal" style={{ color: 'var(--tx-3)' }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function SessionSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-label="正在加载校时记录">
      {[0, 1, 2, 3].map(item => <div key={item} className="h-32 animate-pulse rounded-xl" style={{ background: 'var(--bg-1)' }} />)}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-label="正在带入命盘信息">
      {[0, 1, 2, 3, 4].map(item => <div key={item} className="h-12 animate-pulse rounded-lg" style={{ background: 'var(--bg-1)' }} />)}
    </div>
  );
}

function formatBirthDate(birthInfo: RectificationSessionListItem['baseBirthInfo']): string {
  const { year, month, day, name } = birthInfo;
  return `${name ? `${name} · ` : ''}${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toDateInput(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeInputTime(value: string): string | null {
  return value ? `${value}:00` : null;
}
