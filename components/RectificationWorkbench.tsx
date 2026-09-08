'use client';

import {
  ArrowLeft,
  ArrowsLeftRight,
  CaretDown,
  CaretRight,
  Check,
  Clock,
  FloppyDisk,
  FileText,
  Plus,
  Scales,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { LIFE_EVENT_CATEGORIES, LIFE_EVENT_CATEGORY_LABELS, type LifeEventCategory } from '@/lib/events/types';
import { RECTIFICATION_METHODOLOGY } from '@/lib/rectification/methodology';
import type {
  RectificationCandidate,
  RectificationCandidateEvaluation,
  RectificationEvaluation,
  RectificationEvaluationState,
  RectificationEventEvidenceQuality,
  RectificationEventMatrix,
  RectificationEvidenceOutcome,
  RectificationRuleHit,
  RectificationSelection,
  RectificationSessionDetail,
  RectificationStatus,
  RectificationTimeSlotKey,
} from '@/lib/rectification/types';

const SLOT_LABELS: Record<RectificationTimeSlotKey, string> = {
  early_zi: '早子时', chou: '丑时', yin: '寅时', mao: '卯时', chen: '辰时', si: '巳时',
  wu: '午时', wei: '未时', shen: '申时', you: '酉时', xu: '戌时', hai: '亥时', late_zi: '晚子时',
};

// 与录入页和排盘引擎共用时段定义，避免早晚子时及边界显示不一致。
const SLOT_RANGES = Object.fromEntries(
  RECTIFICATION_METHODOLOGY.timePolicy.slots.map(slot => [slot.key, `${slot.apparentSolarStart}–${slot.apparentSolarEnd}`]),
) as Record<RectificationTimeSlotKey, string>;

const STATUS_LABELS: Record<RectificationStatus, string> = {
  draft: '草稿', ready: '待评估', evaluated: '已评估', confirmed: '已选定', archived: '已归档',
};

const OUTCOME_LABELS: Record<RectificationEvidenceOutcome, string> = {
  support: '支持', weak_support: '弱支持', neutral: '中性', conflict: '冲突', insufficient: '证据不足',
};

const RULE_LABELS: Record<string, string> = {
  'reported-window-contains': '出生时间窗口',
  'decadal-topic-focus': '大限主题宫位',
  'annual-flow-topic-focus': '流年命宫主题',
  'annual-key-palace-topic-focus': '年度重点宫位',
  'annual-transformation-topic-focus': '流年四化落宫',
  'multi-layer-convergence': '多层信息汇合',
  'insufficient-event-guard': '证据不足保护',
  'indistinguishable-candidate-guard': '候选不可区分保护',
};

const QUALITY_OPTIONS: Array<{ value: RectificationEventEvidenceQuality; label: string }> = [
  { value: 'documented', label: '有文档记录' },
  { value: 'corroborated_memory', label: '多人记忆一致' },
  { value: 'single_person_memory', label: '单人口述' },
  { value: 'conversation_extracted', label: '从对话中提取' },
  { value: 'unconfirmed', label: '尚未确认' },
];

interface WorkbenchPayload {
  session: RectificationSessionDetail;
  matrix: RectificationEventMatrix;
  evaluationState: RectificationEvaluationState;
  selections: RectificationSelection[];
}

interface EventFormState {
  title: string;
  category: LifeEventCategory;
  customCategory: string;
  startDate: string;
  endDate: string;
  datePrecision: 'day' | 'month' | 'year' | 'range' | 'unknown';
  description: string;
  impactLevel: 1 | 2 | 3 | 4 | 5;
  evidenceQuality: RectificationEventEvidenceQuality;
  userConfirmed: boolean;
}

const INITIAL_EVENT_FORM: EventFormState = {
  title: '', category: 'career', customCategory: '', startDate: '', endDate: '',
  datePrecision: 'year', description: '', impactLevel: 4,
  evidenceQuality: 'corroborated_memory', userConfirmed: true,
};

export default function RectificationWorkbench({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [data, setData] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState<EventFormState>(INITIAL_EVENT_FORM);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [expandedCell, setExpandedCell] = useState('');
  const [selectionCandidateId, setSelectionCandidateId] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [selectionNote, setSelectionNote] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setError('');
    try {
      const [sessionResponse, matrixResponse, evaluationResponse, selectionResponse] = await Promise.all([
        fetch(`/api/rectifications/${sessionId}`, { cache: 'no-store', signal }),
        fetch(`/api/rectifications/${sessionId}/event-matrix`, { cache: 'no-store', signal }),
        fetch(`/api/rectifications/${sessionId}/evaluation`, { cache: 'no-store', signal }),
        fetch(`/api/rectifications/${sessionId}/selection`, { cache: 'no-store', signal }),
      ]);
      const sessionJson = await sessionResponse.json() as { session?: RectificationSessionDetail; error?: string };
      const matrixJson = await matrixResponse.json() as { matrix?: RectificationEventMatrix; error?: string };
      const evaluationJson = await evaluationResponse.json() as RectificationEvaluationState & { error?: string };
      const selectionJson = await selectionResponse.json() as { selections?: RectificationSelection[]; error?: string };
      const failed = [sessionResponse, matrixResponse, evaluationResponse, selectionResponse].find(response => !response.ok);
      if (failed || !sessionJson.session || !matrixJson.matrix) {
        throw new Error(sessionJson.error || matrixJson.error || evaluationJson.error || selectionJson.error || '工作台数据读取失败');
      }
      setData({
        session: sessionJson.session,
        matrix: matrixJson.matrix,
        evaluationState: { evaluation: evaluationJson.evaluation, isCurrent: evaluationJson.isCurrent },
        selections: selectionJson.selections ?? [],
      });
      setCompareIds(current => {
        const valid = current.filter(id => sessionJson.session!.candidates.some(candidate => candidate.id === id));
        if (valid.length > 0) return valid.slice(0, 2);
        return sessionJson.session!.candidates.filter(candidate => !candidate.duplicateOfCandidateId).slice(0, 2).map(candidate => candidate.id);
      });
      setSelectionCandidateId(current => current || sessionJson.session!.selectedCandidateId || '');
      if (matrixJson.matrix.events.length === 0) setShowEventForm(true);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error ? loadError.message : '工作台数据读取失败');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const evaluation = data?.evaluationState.evaluation ?? null;
  const candidateEvaluations = useMemo(() => new Map(
    evaluation?.candidates.map(item => [item.candidateId, item]) ?? [],
  ), [evaluation]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '操作失败');
    } finally {
      setBusy('');
    }
  };

  const evaluate = () => runAction('evaluate', async () => {
    const response = await fetch(`/api/rectifications/${sessionId}/evaluation`, { method: 'POST' });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || '评估失败');
  });

  const addEvent = async (event: FormEvent) => {
    event.preventDefault();
    await runAction('event', async () => {
      const response = await fetch(`/api/rectifications/${sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidenceQuality: eventForm.evidenceQuality,
          userConfirmed: eventForm.userConfirmed,
          event: {
            title: eventForm.title,
            category: eventForm.category,
            customCategory: eventForm.category === 'custom' ? eventForm.customCategory : null,
            startDate: eventForm.datePrecision === 'unknown' ? '' : eventForm.startDate,
            endDate: eventForm.datePrecision === 'range' ? eventForm.endDate : null,
            datePrecision: eventForm.datePrecision,
            description: eventForm.description || null,
            impactLevel: eventForm.impactLevel,
            source: 'user_input',
            confirmedByUser: eventForm.userConfirmed,
          },
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '添加事件失败');
      setEventForm(INITIAL_EVENT_FORM);
      setShowEventForm(false);
    });
  };

  const removeEvent = (eventId: string, title: string) => {
    if (!window.confirm(`确定删除事件“${title}”吗？删除后会影响候选时辰评分和后续报告，且当前页面无法撤销。`)) return;
    void runAction(`delete-${eventId}`, async () => {
    const response = await fetch(`/api/rectifications/${sessionId}/events/${eventId}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      throw new Error(result.error || '删除事件失败');
    }
    });
  };

  const selectCandidate = () => runAction('selection', async () => {
    if (!evaluation || !data?.evaluationState.isCurrent) throw new Error('请先运行或更新评估');
    if (!selectionCandidateId) throw new Error('请选择一个候选命盘');
    const response = await fetch(`/api/rectifications/${sessionId}/selection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: selectionCandidateId,
        evaluationId: evaluation.id,
        acknowledgedLimitations: acknowledged,
        note: selectionNote,
      }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || '选定工作命盘失败');
    setAcknowledged(false);
    setSelectionNote('');
  });

  const toggleCompare = (candidateId: string) => {
    setCompareIds(current => {
      if (current.includes(candidateId)) return current.filter(id => id !== candidateId);
      return current.length >= 2 ? [current[1], candidateId] : [...current, candidateId];
    });
  };

  if (loading) return <WorkbenchSkeleton />;
  if (!data) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-4" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-md rounded-xl border p-8 text-center" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <WarningCircle className="mx-auto mb-3" size={32} style={{ color: 'var(--ji)' }} />
          <p className="font-medium">{error || '校时任务不存在'}</p>
          <button type="button" className="btn-ghost mt-5" onClick={() => router.push('/rectification')}>返回校时记录</button>
        </div>
      </main>
    );
  }

  const { session, matrix, selections } = data;
  const uniqueCandidates = session.candidates.filter(candidate => !candidate.duplicateOfCandidateId);
  const comparisonCandidates = compareIds.map(id => session.candidates.find(candidate => candidate.id === id)).filter(Boolean) as RectificationCandidate[];

  return (
    <main className="min-h-[100dvh]" style={{ background: 'var(--bg-0)', color: 'var(--tx-1)' }}>
      <header className="sticky top-0 z-20 border-b" style={{ borderColor: 'var(--bdr)', background: 'color-mix(in srgb, var(--bg-0) 94%, transparent)', backdropFilter: 'blur(14px)' }}>
        <div className="mx-auto flex max-w-[1900px] flex-wrap items-center justify-between gap-3 px-3 py-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="btn-ghost !px-3 !py-2" onClick={() => router.push('/rectification')} aria-label="返回校时记录">
              <ArrowLeft size={16} weight="bold" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold md:text-lg">{session.title}</h1>
                <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px]" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}>{STATUS_LABELS[session.status]}</span>
              </div>
              <p className="truncate text-[11px]" style={{ color: 'var(--tx-3)' }}>
                {formatBirthInfo(session)} · {uniqueCandidates.length} 个独立命盘
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost !px-4 !py-2" onClick={() => router.push(`/rectification/${sessionId}/reports`)}>
              <FileText size={15} weight="bold" /> 结论报告
            </button>
            <button type="button" className="btn-ghost !px-4 !py-2" onClick={() => setShowEventForm(true)}>
              <Plus size={15} weight="bold" /> 添加事件
            </button>
            <button type="button" disabled={busy !== ''} className="btn-accent !px-4 !py-2 disabled:opacity-60" onClick={evaluate}>
              <Scales size={16} weight="bold" /> {busy === 'evaluate' ? '评估中…' : evaluation && data.evaluationState.isCurrent ? '重新评估' : '运行评估'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] space-y-5 px-3 py-5 md:px-5">
        {error && <div role="alert" className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'rgba(168,50,40,.35)', color: 'var(--ji)', background: 'rgba(168,50,40,.06)' }}>{error}</div>}

        <ReadinessBar matrix={matrix} evaluation={evaluation} isCurrent={data.evaluationState.isCurrent} />

        {showEventForm && (
          <EventForm
            form={eventForm}
            onChange={setEventForm}
            onSubmit={addEvent}
            onCancel={() => setShowEventForm(false)}
            busy={busy === 'event'}
          />
        )}

        <section className="rounded-xl border" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--bdr)' }}>
            <div>
              <h2 className="font-semibold">候选命盘</h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--tx-3)' }}>勾选两个候选可查看结构差异。</p>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--tx-3)' }}>
              <ArrowsLeftRight size={16} /> 已选 {compareIds.length}/2
            </div>
          </div>
          <div className="overflow-x-auto p-3">
            <div className="flex min-w-max gap-3">
              {session.candidates.map(candidate => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  evaluation={candidateEvaluations.get(candidate.id)}
                  compared={compareIds.includes(candidate.id)}
                  selected={session.selectedCandidateId === candidate.id}
                  onCompare={() => toggleCompare(candidate.id)}
                  onSelect={() => {
                    setSelectionCandidateId(candidate.id);
                    document.getElementById('selection-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        {comparisonCandidates.length === 2 && <CandidateDifference first={comparisonCandidates[0]} second={comparisonCandidates[1]} />}

        <section className="rounded-xl border" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--bdr)' }}>
            <div>
              <h2 className="font-semibold">事件证据矩阵</h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--tx-3)' }}>点击单元格查看规则依据。未命中规则保持中性，不作为反证。</p>
            </div>
            <span className="text-xs" style={{ color: 'var(--tx-3)' }}>{matrix.events.length} 个事件</span>
          </div>
          {matrix.events.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <CalendarBlankIcon />
              <p className="font-medium">还没有人生事件</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--tx-3)' }}>建议录入至少 4 个事件，并覆盖 3 个不同类别。</p>
              <button type="button" className="btn-accent mt-5" onClick={() => setShowEventForm(true)}><Plus size={15} weight="bold" /> 添加第一个事件</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-52 border-b border-r px-4 py-3 text-left font-medium" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>事件</th>
                    {session.candidates.map(candidate => (
                      <th key={candidate.id} className="min-w-32 border-b px-3 py-3 text-center font-medium" style={{ borderColor: 'var(--bdr)' }}>
                        <span className="block">{SLOT_LABELS[candidate.slotKey]}</span>
                        <span className="mt-0.5 block font-mono text-[9px] font-normal" style={{ color: 'var(--tx-3)' }}>{candidateEvaluationLabel(candidateEvaluations.get(candidate.id))}</span>
                      </th>
                    ))}
                    <th className="min-w-16 border-b px-3 py-3" style={{ borderColor: 'var(--bdr)' }} />
                  </tr>
                </thead>
                <tbody>
                  {matrix.events.map(event => (
                    <EventMatrixRow
                      key={event.id}
                      event={event}
                      candidates={session.candidates}
                      candidateEvaluations={candidateEvaluations}
                      expandedCell={expandedCell}
                      onExpand={setExpandedCell}
                      onRemove={() => removeEvent(event.id, event.snapshot.title)}
                      deleting={busy === `delete-${event.id}`}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <SelectionPanel
          session={session}
          evaluation={evaluation}
          isCurrent={data.evaluationState.isCurrent}
          candidateId={selectionCandidateId}
          onCandidateChange={setSelectionCandidateId}
          acknowledged={acknowledged}
          onAcknowledgedChange={setAcknowledged}
          note={selectionNote}
          onNoteChange={setSelectionNote}
          onSubmit={selectCandidate}
          busy={busy === 'selection'}
          selections={selections}
        />
      </div>
    </main>
  );
}

function ReadinessBar({ matrix, evaluation, isCurrent }: { matrix: RectificationEventMatrix; evaluation: RectificationEvaluation | null; isCurrent: boolean }) {
  const ready = matrix.readiness;
  return (
    <section className="grid gap-px overflow-hidden rounded-xl border md:grid-cols-[1fr_1fr_1fr_1.6fr]" style={{ borderColor: 'var(--bdr)', background: 'var(--bdr)' }}>
      <Metric label="可评分事件" value={`${ready.confirmedEligibleEvents}/${ready.recommendedEvents}`} ok={ready.confirmedEligibleEvents >= ready.recommendedEvents} />
      <Metric label="事件类别" value={`${ready.distinctScoreableCategories}/${ready.recommendedCategories}`} ok={ready.distinctScoreableCategories >= ready.recommendedCategories} />
      <Metric label="评估版本" value={evaluation ? `V${evaluation.version}` : '未评估'} ok={Boolean(evaluation && isCurrent)} />
      <div className="px-4 py-3" style={{ background: 'var(--bg-card)' }}>
        <p className="text-[10px]" style={{ color: 'var(--tx-3)' }}>当前结论</p>
        <p className="mt-1 text-xs font-medium" style={{ color: evaluation && isCurrent ? (evaluation.stable ? 'var(--lu)' : 'var(--ke)') : 'var(--tx-2)' }}>
          {!evaluation ? '添加事件后运行规则评估' : !isCurrent ? '证据已变化，需要重新评估' : evaluation.stable ? '留一事件检验稳定' : '结论尚不稳定，请谨慎使用'}
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="px-4 py-3" style={{ background: 'var(--bg-card)' }}>
      <p className="text-[10px]" style={{ color: 'var(--tx-3)' }}>{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold" style={{ color: ok ? 'var(--lu)' : 'var(--tx-1)' }}>{value}</p>
    </div>
  );
}

function EventForm({ form, onChange, onSubmit, onCancel, busy }: {
  form: EventFormState;
  onChange: (form: EventFormState) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const set = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => onChange({ ...form, [key]: value });
  return (
    <section className="rounded-xl border p-4 md:p-5" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">添加关键人生事件</h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--tx-3)' }}>优先填写日期清楚、影响较大、能够核实的事件。</p>
        </div>
        <button type="button" onClick={onCancel} className="text-xs" style={{ color: 'var(--tx-3)' }}>收起</button>
      </div>
      <form className="rectification-form grid gap-4 md:grid-cols-4" onSubmit={onSubmit}>
        <Field label="事件名称" className="md:col-span-2">
          <input required value={form.title} onChange={event => set('title', event.target.value)} placeholder="例如：开始第一份正式工作" className="rectification-input" />
        </Field>
        <Field label="类别">
          <select value={form.category} onChange={event => set('category', event.target.value as LifeEventCategory)} className="rectification-input">
            {LIFE_EVENT_CATEGORIES.map(category => <option key={category} value={category}>{LIFE_EVENT_CATEGORY_LABELS[category]}</option>)}
          </select>
        </Field>
        <Field label="影响程度">
          <select value={form.impactLevel} onChange={event => set('impactLevel', Number(event.target.value) as EventFormState['impactLevel'])} className="rectification-input">
            {[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>{level} 级{level >= 4 ? '，关键事件' : ''}</option>)}
          </select>
        </Field>
        {form.category === 'custom' && (
          <Field label="自定义类别" className="md:col-span-2">
            <input required value={form.customCategory} onChange={event => set('customCategory', event.target.value)} className="rectification-input" />
          </Field>
        )}
        <Field label="日期精度">
          <select value={form.datePrecision} onChange={event => set('datePrecision', event.target.value as EventFormState['datePrecision'])} className="rectification-input">
            <option value="day">精确到日</option><option value="month">精确到月</option><option value="year">精确到年</option><option value="range">一段时期</option><option value="unknown">日期不详</option>
          </select>
        </Field>
        <Field label={form.datePrecision === 'range' ? '开始日期' : '发生日期'}>
          <input required={form.datePrecision !== 'unknown'} disabled={form.datePrecision === 'unknown'} value={form.datePrecision === 'unknown' ? '' : form.startDate} onChange={event => set('startDate', event.target.value)} placeholder={datePlaceholder(form.datePrecision)} className="rectification-input" />
        </Field>
        {form.datePrecision === 'range' && <Field label="结束日期"><input required value={form.endDate} onChange={event => set('endDate', event.target.value)} placeholder="例如 2011-06" className="rectification-input" /></Field>}
        <Field label="证据质量">
          <select value={form.evidenceQuality} onChange={event => set('evidenceQuality', event.target.value as RectificationEventEvidenceQuality)} className="rectification-input">
            {QUALITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="补充描述" className="md:col-span-3">
          <input value={form.description} onChange={event => set('description', event.target.value)} placeholder="选填，记录地点、结果或持续时间" className="rectification-input" />
        </Field>
        <label className="flex items-center gap-2 self-end rounded-lg border px-3 py-2.5 text-xs" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
          <input type="checkbox" checked={form.userConfirmed} onChange={event => set('userConfirmed', event.target.checked)} /> 已由本人确认
        </label>
        <div className="flex justify-end gap-2 md:col-span-4">
          <button type="button" className="btn-ghost !py-2" onClick={onCancel}>取消</button>
          <button type="submit" disabled={busy} className="btn-accent !py-2 disabled:opacity-60"><FloppyDisk size={15} weight="bold" /> {busy ? '保存中…' : '保存事件'}</button>
        </div>
      </form>
    </section>
  );
}

function CandidateCard({ candidate, evaluation, compared, selected, onCompare, onSelect }: {
  candidate: RectificationCandidate;
  evaluation?: RectificationCandidateEvaluation;
  compared: boolean;
  selected: boolean;
  onCompare: () => void;
  onSelect: () => void;
}) {
  const ming = getPalace(candidate, candidate.chartSnapshot.mingGongBranch);
  const shen = getPalace(candidate, candidate.chartSnapshot.shenGongBranch);
  return (
    <article className="w-48 rounded-xl border p-3" style={{ borderColor: selected ? 'var(--ac)' : compared ? 'var(--ac-bdr)' : 'var(--bdr)', background: selected || compared ? 'var(--ac-bg)' : 'var(--bg-1)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{SLOT_LABELS[candidate.slotKey]}</h3>
          <p className="font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{SLOT_RANGES[candidate.slotKey]}</p>
        </div>
        {evaluation && <span className="font-mono text-lg font-semibold" style={{ color: 'var(--ac-dim)' }}>{evaluation.relativeEvidenceIndex.toFixed(0)}</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Summary label="命宫" value={`${branchName(candidate.chartSnapshot.mingGongBranch)} · ${majorStars(ming)}`} />
        <Summary label="身宫" value={`${branchName(candidate.chartSnapshot.shenGongBranch)} · ${shen?.name ?? '未知'}`} />
      </div>
      <div className="mt-3 flex min-h-5 flex-wrap gap-1">
        {selected && <Tag text="当前工作命盘" color="var(--ac-dim)" />}
        {candidate.duplicateOfCandidateId && <Tag text="重复命盘" color="var(--tx-3)" />}
        {evaluation && <Tag text={`第 ${evaluation.rank} 位${evaluation.tiedForRank ? '，并列' : ''}`} color="var(--tx-2)" />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCompare} className="rounded-md border px-2 py-1.5 text-[10px]" style={{ borderColor: compared ? 'var(--ac)' : 'var(--bdr-med)', color: compared ? 'var(--ac-dim)' : 'var(--tx-2)' }}>
          {compared ? '移出对比' : '加入对比'}
        </button>
        <button type="button" disabled={Boolean(candidate.duplicateOfCandidateId)} onClick={onSelect} className="rounded-md border px-2 py-1.5 text-[10px] disabled:opacity-40" style={{ borderColor: 'var(--ac-bdr)', color: 'var(--ac-dim)' }}>选定</button>
      </div>
    </article>
  );
}

function CandidateDifference({ first, second }: { first: RectificationCandidate; second: RectificationCandidate }) {
  const rows = buildDifferenceRows(first, second);
  return (
    <section className="rounded-xl border" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--bdr)' }}>
        <h2 className="font-semibold">候选结构差异</h2>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--tx-3)' }}>{SLOT_LABELS[first.slotKey]} 与 {SLOT_LABELS[second.slotKey]}，只显示不同之处。</p>
      </div>
      <div className="grid gap-px overflow-hidden md:grid-cols-[160px_1fr_1fr]" style={{ background: 'var(--bdr)' }}>
        <div className="hidden px-4 py-2 text-xs font-medium md:block" style={{ background: 'var(--bg-1)', color: 'var(--tx-3)' }}>比较项</div>
        <div className="hidden px-4 py-2 text-xs font-medium md:block" style={{ background: 'var(--bg-1)' }}>{SLOT_LABELS[first.slotKey]}</div>
        <div className="hidden px-4 py-2 text-xs font-medium md:block" style={{ background: 'var(--bg-1)' }}>{SLOT_LABELS[second.slotKey]}</div>
        {rows.length === 0 ? <div className="px-4 py-6 text-sm md:col-span-3" style={{ background: 'var(--bg-card)', color: 'var(--tx-3)' }}>两者命盘结构相同，系统会将其作为重复候选处理。</div> : rows.map(row => (
          <div key={row.label} className="grid grid-cols-2 gap-px md:contents" style={{ background: 'var(--bdr)' }}>
            <div className="col-span-2 px-4 py-2 text-xs font-medium md:col-span-1 md:py-3" style={{ background: 'var(--bg-card)', color: 'var(--tx-3)' }}>{row.label}</div>
            <div className="px-4 py-3 text-sm" style={{ background: 'var(--bg-card)' }}>
              <span className="mb-1 block text-[9px] md:hidden" style={{ color: 'var(--tx-3)' }}>{SLOT_LABELS[first.slotKey]}</span>
              {row.first}
            </div>
            <div className="px-4 py-3 text-sm" style={{ background: 'var(--bg-card)' }}>
              <span className="mb-1 block text-[9px] md:hidden" style={{ color: 'var(--tx-3)' }}>{SLOT_LABELS[second.slotKey]}</span>
              {row.second}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EventMatrixRow({ event, candidates, candidateEvaluations, expandedCell, onExpand, onRemove, deleting }: {
  event: RectificationEventMatrix['events'][number];
  candidates: RectificationCandidate[];
  candidateEvaluations: Map<string, RectificationCandidateEvaluation>;
  expandedCell: string;
  onExpand: (key: string) => void;
  onRemove: () => void;
  deleting: boolean;
}) {
  return (
    <>
      <tr>
        <td className="sticky left-0 z-10 border-b border-r px-4 py-3 align-top" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <p className="font-medium">{event.snapshot.title}</p>
          <p className="mt-1 text-[10px]" style={{ color: 'var(--tx-3)' }}>{LIFE_EVENT_CATEGORY_LABELS[event.snapshot.category]} · {event.snapshot.startDate}{event.snapshot.endDate ? ` 至 ${event.snapshot.endDate}` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Tag text={event.scoreEligible ? '可评分' : '不计分'} color={event.scoreEligible ? 'var(--lu)' : 'var(--tx-3)'} />
            <Tag text={`${event.snapshot.impactLevel} 级影响`} color="var(--tx-3)" />
          </div>
        </td>
        {candidates.map(candidate => {
          const key = `${event.id}:${candidate.id}`;
          const hits = candidateEvaluations.get(candidate.id)?.ruleHits.filter(hit => hit.sessionEventId === event.id) ?? [];
          const outcome = summarizeOutcome(hits);
          const contribution = candidateEvaluations.get(candidate.id)?.eventContributions[event.id] ?? 0;
          return (
            <td key={candidate.id} className="border-b p-2 text-center align-top" style={{ borderColor: 'var(--bdr)' }}>
              <button type="button" disabled={hits.length === 0} onClick={() => onExpand(expandedCell === key ? '' : key)} className="w-full rounded-lg border px-2 py-2 disabled:cursor-default" style={outcomeStyle(outcome)}>
                <span className="block text-[11px] font-medium">{hits.length ? OUTCOME_LABELS[outcome] : '未评估'}</span>
                {hits.length > 0 && <span className="mt-0.5 block font-mono text-[9px]">{formatSigned(contribution)}</span>}
                {hits.length > 0 && <span className="mt-1 flex justify-center">{expandedCell === key ? <CaretDown size={11} /> : <CaretRight size={11} />}</span>}
              </button>
            </td>
          );
        })}
        <td className="border-b px-3 py-3 text-center align-top" style={{ borderColor: 'var(--bdr)' }}>
          <button type="button" disabled={deleting} onClick={onRemove} aria-label={`删除事件：${event.snapshot.title}`} className="rounded-md p-2 disabled:opacity-50" style={{ color: 'var(--ji)' }}><Trash size={15} /></button>
        </td>
      </tr>
      {candidates.map(candidate => {
        const key = `${event.id}:${candidate.id}`;
        if (expandedCell !== key) return null;
        const hits = candidateEvaluations.get(candidate.id)?.ruleHits.filter(hit => hit.sessionEventId === event.id) ?? [];
        return (
          <tr key={key}>
            <td colSpan={candidates.length + 2} className="border-b px-4 py-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Scales size={14} /> {event.snapshot.title} 对 {SLOT_LABELS[candidate.slotKey]} 的规则依据</div>
              <div className="grid gap-2 lg:grid-cols-2">
                {hits.map(hit => <RuleHit key={hit.id} hit={hit} />)}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function RuleHit({ hit }: { hit: RectificationRuleHit }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">{RULE_LABELS[hit.ruleId] ?? hit.ruleId}</span>
        <span className="font-mono text-[10px]" style={{ color: outcomeStyle(hit.outcome).color }}>{OUTCOME_LABELS[hit.outcome]} {formatSigned(hit.adjustedWeight)}</span>
      </div>
      <p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>{describeEvidence(hit.evidence)}{!hit.discriminating ? '。各候选结果一致，本条不计分' : ''}</p>
    </div>
  );
}

function SelectionPanel({ session, evaluation, isCurrent, candidateId, onCandidateChange, acknowledged, onAcknowledgedChange, note, onNoteChange, onSubmit, busy, selections }: {
  session: RectificationSessionDetail;
  evaluation: RectificationEvaluation | null;
  isCurrent: boolean;
  candidateId: string;
  onCandidateChange: (id: string) => void;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  selections: RectificationSelection[];
}) {
  const available = session.candidates.filter(candidate => !candidate.duplicateOfCandidateId);
  const chosen = session.candidates.find(candidate => candidate.id === candidateId);
  return (
    <section id="selection-panel" className="grid gap-5 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)] md:p-5" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
      <div>
        <div className="flex items-start gap-3">
          <div className="rounded-lg p-2" style={{ background: 'var(--ac-bg)', color: 'var(--ac-dim)' }}><Check size={20} weight="bold" /></div>
          <div>
            <h2 className="font-semibold">设为当前工作命盘</h2>
            <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>此操作只更新校时任务的当前选择，不会删除候选、事件、评估版本或以往选择。</p>
          </div>
        </div>
        <div className="rectification-form mt-5 grid gap-4 md:grid-cols-2">
          <Field label="候选时段">
            <select value={candidateId} onChange={event => onCandidateChange(event.target.value)} className="rectification-input">
              <option value="">请选择</option>
              {available.map(candidate => <option key={candidate.id} value={candidate.id}>{SLOT_LABELS[candidate.slotKey]}，{SLOT_RANGES[candidate.slotKey]}</option>)}
            </select>
          </Field>
          <Field label="选定说明">
            <input value={note} onChange={event => onNoteChange(event.target.value)} placeholder="选填，记录人工判断依据" className="rectification-input" />
          </Field>
        </div>
        <label className="mt-4 flex items-start gap-2 rounded-lg border px-3 py-3 text-xs leading-5" style={{ borderColor: 'rgba(138,112,24,.28)', background: 'rgba(138,112,24,.06)' }}>
          <input className="mt-1" type="checkbox" checked={acknowledged} onChange={event => onAcknowledgedChange(event.target.checked)} />
          <span>我已理解相对证据指数不是概率，当前版本不会给出高置信度结论。并列、低证据或稳定性不足时，结果只能作为校时工作假设。</span>
        </label>
        <button type="button" disabled={busy || !chosen || !evaluation || !isCurrent || !acknowledged} onClick={onSubmit} className="btn-accent mt-4 disabled:cursor-not-allowed disabled:opacity-50">
          <Check size={16} weight="bold" /> {busy ? '正在保存…' : '确认当前工作命盘'}
        </button>
        {(!evaluation || !isCurrent) && <p className="mt-2 text-xs" style={{ color: 'var(--ji)' }}>选定前需要一份与当前事件证据一致的评估。</p>}
      </div>
      <div className="border-t pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0" style={{ borderColor: 'var(--bdr)' }}>
        <h3 className="text-sm font-medium">选定历史</h3>
        {selections.length === 0 ? <p className="mt-4 text-xs" style={{ color: 'var(--tx-3)' }}>尚未选定过工作命盘。</p> : (
          <div className="mt-3 space-y-3">
            {selections.slice(0, 6).map(selection => {
              const candidate = session.candidates.find(item => item.id === selection.candidateId);
              return (
                <div key={selection.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium">{candidate ? SLOT_LABELS[candidate.slotKey] : '历史候选'}</span>
                    <span className="font-mono" style={{ color: 'var(--ac-dim)' }}>V{selection.evaluationVersion} · {selection.relativeEvidenceIndex.toFixed(0)}</span>
                  </div>
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--tx-3)' }}>{formatDateTime(selection.createdAt)}{selection.note ? ` · ${selection.note}` : ''}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function WorkbenchSkeleton() {
  return (
    <main className="min-h-[100dvh] p-4" style={{ background: 'var(--bg-0)' }} aria-label="正在加载校时工作台">
      <div className="mx-auto max-w-[1900px] space-y-4">
        <div className="h-16 animate-pulse rounded-xl" style={{ background: 'var(--bg-1)' }} />
        <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map(item => <div key={item} className="h-20 animate-pulse rounded-xl" style={{ background: 'var(--bg-1)' }} />)}</div>
        <div className="h-60 animate-pulse rounded-xl" style={{ background: 'var(--bg-1)' }} />
        <div className="h-96 animate-pulse rounded-xl" style={{ background: 'var(--bg-1)' }} />
      </div>
    </main>
  );
}

function CalendarBlankIcon() {
  return <Clock className="mx-auto mb-3" size={32} style={{ color: 'var(--ac)' }} />;
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-2 ${className}`}><span className="text-xs font-medium">{label}</span>{children}</label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span className="block text-[9px]" style={{ color: 'var(--tx-3)' }}>{label}</span><span className="mt-0.5 block truncate">{value}</span></div>;
}

function Tag({ text, color }: { text: string; color: string }) {
  return <span className="rounded px-1.5 py-0.5 text-[9px]" style={{ color, background: 'var(--bg-card)', border: '1px solid var(--bdr)' }}>{text}</span>;
}

function getPalace(candidate: RectificationCandidate, branch: number) {
  return candidate.chartSnapshot.palaces.find(palace => palace.branch === branch);
}

function majorStars(palace: ReturnType<typeof getPalace>): string {
  const stars = palace?.stars.filter(star => star.type === 'major').map(star => star.name) ?? [];
  return stars.length ? stars.join('、') : '空宫';
}

function branchName(branch: number): string {
  return '子丑寅卯辰巳午未申酉戌亥'[branch] ?? '?';
}

function buildDifferenceRows(first: RectificationCandidate, second: RectificationCandidate) {
  const rows: Array<{ label: string; first: string; second: string }> = [];
  const add = (label: string, firstValue: string, secondValue: string) => {
    if (firstValue !== secondValue) rows.push({ label, first: firstValue, second: secondValue });
  };
  add('命宫', `${branchName(first.chartSnapshot.mingGongBranch)}宫 · ${majorStars(getPalace(first, first.chartSnapshot.mingGongBranch))}`, `${branchName(second.chartSnapshot.mingGongBranch)}宫 · ${majorStars(getPalace(second, second.chartSnapshot.mingGongBranch))}`);
  add('身宫', `${branchName(first.chartSnapshot.shenGongBranch)}宫 · ${getPalace(first, first.chartSnapshot.shenGongBranch)?.name ?? '未知'}`, `${branchName(second.chartSnapshot.shenGongBranch)}宫 · ${getPalace(second, second.chartSnapshot.shenGongBranch)?.name ?? '未知'}`);
  add('五行局', first.chartSnapshot.wuxingJuName, second.chartSnapshot.wuxingJuName);
  for (let branch = 0; branch < 12; branch += 1) {
    const firstPalace = getPalace(first, branch);
    const secondPalace = getPalace(second, branch);
    const firstValue = `${firstPalace?.name ?? '未知'} · ${majorStars(firstPalace)}`;
    const secondValue = `${secondPalace?.name ?? '未知'} · ${majorStars(secondPalace)}`;
    add(`${branchName(branch)}宫`, firstValue, secondValue);
  }
  return rows;
}

function summarizeOutcome(hits: RectificationRuleHit[]): RectificationEvidenceOutcome {
  const effectiveHits = hits.filter(hit => hit.discriminating && Math.abs(hit.adjustedWeight) > 0.0001);
  const outcomes = new Set(effectiveHits.map(hit => hit.outcome));
  if (outcomes.has('conflict')) return 'conflict';
  if (outcomes.has('support')) return 'support';
  if (outcomes.has('weak_support')) return 'weak_support';
  if (outcomes.has('insufficient')) return 'insufficient';
  return 'neutral';
}

function outcomeStyle(outcome: RectificationEvidenceOutcome): React.CSSProperties {
  if (outcome === 'support') return { color: 'var(--lu)', borderColor: 'rgba(45,122,74,.28)', background: 'rgba(45,122,74,.07)' };
  if (outcome === 'weak_support') return { color: 'var(--ke)', borderColor: 'rgba(138,112,24,.28)', background: 'rgba(138,112,24,.07)' };
  if (outcome === 'conflict') return { color: 'var(--ji)', borderColor: 'rgba(168,50,40,.28)', background: 'rgba(168,50,40,.07)' };
  if (outcome === 'insufficient') return { color: 'var(--tx-3)', borderColor: 'var(--bdr)', background: 'var(--bg-1)' };
  return { color: 'var(--tx-2)', borderColor: 'var(--bdr)', background: 'var(--bg-1)' };
}

function describeEvidence(evidence: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (label: string, value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') parts.push(`${label}${value}`);
    if (Array.isArray(value) && value.length) parts.push(`${label}${value.join('、')}`);
  };
  push('事件年份：', evidence.eventYear);
  push('匹配宫位：', evidence.matches);
  push('大限匹配：', evidence.decadalMatches);
  push('流年匹配：', evidence.annualFlowMatches);
  push('重点宫位：', evidence.annualKeyPalaceMatches);
  push('范围衰减：', evidence.rangeDecay);
  return parts.length ? parts.join('；') : '规则已按当前候选命盘与事件快照计算。';
}

function formatSigned(value: number): string {
  if (Math.abs(value) < 0.0001) return '0.00';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

function candidateEvaluationLabel(evaluation?: RectificationCandidateEvaluation): string {
  return evaluation ? `指数 ${evaluation.relativeEvidenceIndex.toFixed(0)} · 第 ${evaluation.rank} 位` : '未评估';
}

function datePlaceholder(precision: EventFormState['datePrecision']): string {
  if (precision === 'day') return '例如 2018-10-01';
  if (precision === 'month') return '例如 2018-10';
  if (precision === 'unknown') return '日期不详可留空';
  return '例如 2018';
}

function formatBirthInfo(session: RectificationSessionDetail): string {
  const birth = session.baseBirthInfo;
  return `${birth.name ? `${birth.name} · ` : ''}${birth.year}-${String(birth.month).padStart(2, '0')}-${String(birth.day).padStart(2, '0')} · ${birth.gender === 'male' ? '男' : '女'}`;
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}
