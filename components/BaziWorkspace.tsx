'use client';

import {
  ArrowLeft,
  CalendarDots,
  ChatCircleDots,
  Clock,
  Database,
  FloppyDisk,
  FolderOpen,
  GitBranch,
  Info,
  Plus,
  ShieldCheck,
  Sparkle,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BaziBirthProfileDetail,
  BaziBirthProfileListItem,
  BaziCalculationResult,
  BaziChartVersion,
  BaziElement,
  BaziPillar,
} from '@/lib/bazi/types';
import { analyzeBaziInterpretation } from '@/lib/bazi/interpretation-engine';
import type { BaziInterpretationResult } from '@/lib/bazi/interpretation-types';
import { calculateBaziLuckCycles } from '@/lib/bazi/luck-cycle-engine';
import type { BaziLuckCycleResult } from '@/lib/bazi/luck-cycle-types';
import { calculateBaziAnnualTimeline } from '@/lib/bazi/annual-timeline-engine';
import type { BaziAnnualTimelineResult } from '@/lib/bazi/annual-timeline-types';
import { calculateBaziMonthDayTimeline } from '@/lib/bazi/month-day-timeline-engine';
import type { BaziMonthDayTimelineResult } from '@/lib/bazi/month-day-timeline-types';
import { auditBaziMonthDayRelations } from '@/lib/bazi/month-day-relation-engine';
import type { BaziMonthDayRelationResult } from '@/lib/bazi/month-day-relation-types';
import { auditBaziMonthDayVisibilityConditions } from '@/lib/bazi/month-day-visibility-engine';
import type { BaziMonthDayVisibilityResult } from '@/lib/bazi/month-day-visibility-types';
import { auditBaziRelations } from '@/lib/bazi/relation-audit-engine';
import type { BaziRelationAuditResult, BaziRelationEvidence } from '@/lib/bazi/relation-audit-types';
import { adjudicateBaziRelations } from '@/lib/bazi/relation-adjudication-engine';
import type {
  BaziRelationAdjudicationResult,
  BaziRelationConditionCheck,
  BaziRelationConditionDecision,
} from '@/lib/bazi/relation-adjudication-types';
import { auditBaziDynamicTenGods } from '@/lib/bazi/dynamic-ten-god-engine';
import type {
  BaziDynamicDirectionLink,
  BaziDynamicTenGodLayerSnapshot,
  BaziDynamicTenGodResult,
} from '@/lib/bazi/dynamic-ten-god-types';
import { auditBaziTenGodRepeats } from '@/lib/bazi/ten-god-repeat-engine';
import type {
  BaziStemRepeatCluster,
  BaziTenGodOccurrence,
  BaziTenGodRepeatResult,
  BaziTenGodRoleRepeatCluster,
} from '@/lib/bazi/ten-god-repeat-types';
import { auditBaziTransparencyRoots } from '@/lib/bazi/transparency-root-engine';
import type {
  BaziRootCandidate,
  BaziTransparencyCandidate,
  BaziTransparencyRootConditionCheck,
  BaziTransparencyRootResult,
} from '@/lib/bazi/transparency-root-types';
import { auditBaziHiddenStemActivationConditions } from '@/lib/bazi/hidden-stem-activation-engine';
import type {
  BaziHiddenStemActivationResult,
  BaziHiddenStemTouchCandidate,
} from '@/lib/bazi/hidden-stem-activation-types';
import { auditBaziStrengthComposite } from '@/lib/bazi/strength-composite-engine';
import type {
  BaziStrengthCompositeEvidence,
  BaziStrengthCompositeResult,
} from '@/lib/bazi/strength-composite-types';
import { auditBaziPatternConditions } from '@/lib/bazi/pattern-condition-engine';
import type {
  BaziPatternCandidateConditionAudit,
  BaziPatternConditionCheck,
  BaziPatternConditionResult,
} from '@/lib/bazi/pattern-condition-types';

interface FormState {
  displayName: string;
  birthDate: string;
  birthTime: string;
  gender: 'male' | 'female';
  timeStandard: 'civil_time' | 'apparent_solar_time';
  timeZoneId: string;
  longitude: string;
  lateZiPolicy: 'same_day' | 'next_day';
  unknownTime: boolean;
  locationLabel: string;
  notes: string;
}

const INITIAL_FORM: FormState = {
  displayName: '',
  birthDate: '1990-01-01',
  birthTime: '12:00',
  gender: 'male',
  timeStandard: 'civil_time',
  timeZoneId: 'Asia/Shanghai',
  longitude: '116.4074',
  lateZiPolicy: 'same_day',
  unknownTime: false,
  locationLabel: '',
  notes: '',
};

const PROFILE_FIELDS = new Set<keyof FormState>([
  'displayName', 'birthDate', 'birthTime', 'gender', 'timeZoneId',
  'longitude', 'unknownTime', 'locationLabel', 'notes',
]);

const ELEMENT_COLORS: Record<BaziElement, string> = {
  木: '#2f855a', 火: '#c05640', 土: '#a87832', 金: '#8a7a45', 水: '#3f6d99',
};

export default function BaziWorkspace() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [result, setResult] = useState<BaziCalculationResult | null>(null);
  const [profiles, setProfiles] = useState<BaziBirthProfileListItem[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<BaziBirthProfileDetail | null>(null);
  const [currentChartId, setCurrentChartId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [selectedAnnualYear, setSelectedAnnualYear] = useState(new Date().getFullYear());
  const [selectedFlowDate, setSelectedFlowDate] = useState('');

  const loadProfiles = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/bazi/profiles?limit=100', { cache: 'no-store' });
      const data = await response.json() as { profiles?: BaziBirthProfileListItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || '八字档案加载失败');
      setProfiles(data.profiles ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '八字档案加载失败');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { void loadProfiles(); }, [loadProfiles]);
  useEffect(() => {
    if (!currentChartId) return;
    void Promise.all([
      fetch(`/api/bazi/charts/${currentChartId}/analysis`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/luck-cycles`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/annual-timeline`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/relation-audit`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/relation-adjudication`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/dynamic-ten-gods`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/ten-god-repeats`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/transparency-roots`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/hidden-stem-activations`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/strength-composites`, { method: 'POST' }),
      fetch(`/api/bazi/charts/${currentChartId}/pattern-conditions`, { method: 'POST' }),
    ]).catch(() => undefined);
  }, [currentChartId]);

  const interpretation = useMemo(
    () => result ? analyzeBaziInterpretation(result) : null,
    [result],
  );
  const luckCycles = useMemo(
    () => result ? calculateBaziLuckCycles(result) : null,
    [result],
  );
  const annualTimeline = useMemo(
    () => result && luckCycles ? calculateBaziAnnualTimeline(result, luckCycles) : null,
    [result, luckCycles],
  );
  const monthDayTimeline = useMemo(() => {
    if (!result || !annualTimeline) return null;
    const targetYear = Math.min(
      Math.max(selectedAnnualYear, annualTimeline.range.startYear),
      annualTimeline.range.endYear,
    );
    return calculateBaziMonthDayTimeline(result, annualTimeline, targetYear);
  }, [result, annualTimeline, selectedAnnualYear]);
  const monthDayRelation = useMemo(() => {
    if (!result || !monthDayTimeline || !selectedFlowDate) return null;
    if (!monthDayTimeline.days.some(item => item.effectiveDate === selectedFlowDate)) return null;
    return auditBaziMonthDayRelations(result, monthDayTimeline, selectedFlowDate);
  }, [result, monthDayTimeline, selectedFlowDate]);
  const monthDayVisibility = useMemo(
    () => result && monthDayRelation
      ? auditBaziMonthDayVisibilityConditions(result, monthDayRelation)
      : null,
    [result, monthDayRelation],
  );
  const relationAudit = useMemo(
    () => result && luckCycles && annualTimeline
      ? auditBaziRelations(result, luckCycles, annualTimeline)
      : null,
    [result, luckCycles, annualTimeline],
  );
  const relationAdjudication = useMemo(
    () => result && relationAudit ? adjudicateBaziRelations(result, relationAudit) : null,
    [result, relationAudit],
  );
  const dynamicTenGod = useMemo(
    () => result && relationAudit && relationAdjudication
      ? auditBaziDynamicTenGods(result, relationAudit, relationAdjudication)
      : null,
    [result, relationAudit, relationAdjudication],
  );
  const tenGodRepeat = useMemo(
    () => result && relationAudit && dynamicTenGod
      ? auditBaziTenGodRepeats(result, dynamicTenGod, relationAudit)
      : null,
    [result, relationAudit, dynamicTenGod],
  );
  const transparencyRoot = useMemo(
    () => result && dynamicTenGod && tenGodRepeat
      ? auditBaziTransparencyRoots(result, dynamicTenGod, tenGodRepeat)
      : null,
    [result, dynamicTenGod, tenGodRepeat],
  );
  const hiddenStemActivation = useMemo(
    () => result && relationAudit && relationAdjudication && dynamicTenGod && tenGodRepeat && transparencyRoot
      ? auditBaziHiddenStemActivationConditions(
        result, relationAudit, relationAdjudication, dynamicTenGod, tenGodRepeat, transparencyRoot,
      )
      : null,
    [result, relationAudit, relationAdjudication, dynamicTenGod, tenGodRepeat, transparencyRoot],
  );
  const strengthComposite = useMemo(
    () => result && interpretation && dynamicTenGod && transparencyRoot && hiddenStemActivation
      ? auditBaziStrengthComposite(result, interpretation, dynamicTenGod, transparencyRoot, hiddenStemActivation)
      : null,
    [result, interpretation, dynamicTenGod, transparencyRoot, hiddenStemActivation],
  );
  const patternCondition = useMemo(
    () => result && interpretation && strengthComposite
      ? auditBaziPatternConditions(result, interpretation, strengthComposite)
      : null,
    [result, interpretation, strengthComposite],
  );
  useEffect(() => {
    if (!annualTimeline) return;
    setSelectedAnnualYear(value => Math.min(Math.max(value, annualTimeline.range.startYear), annualTimeline.range.endYear));
  }, [annualTimeline]);
  useEffect(() => {
    if (!currentChartId || !monthDayTimeline) return;
    void fetch(`/api/bazi/charts/${currentChartId}/month-day-timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetYear: monthDayTimeline.source.targetYear }),
    }).catch(() => undefined);
  }, [currentChartId, monthDayTimeline?.source.targetYear]);
  useEffect(() => {
    if (!monthDayTimeline) return;
    setSelectedFlowDate(resolveInitialFlowDate(monthDayTimeline));
  }, [monthDayTimeline?.source.targetYear, monthDayTimeline?.source.lateZiPolicy]);
  useEffect(() => {
    if (!currentChartId || !monthDayRelation) return;
    void fetch(`/api/bazi/charts/${currentChartId}/month-day-relations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetDate: monthDayRelation.target.effectiveDate,
        targetYear: monthDayRelation.source.targetYear,
      }),
    }).catch(() => undefined);
  }, [currentChartId, monthDayRelation?.target.effectiveDate, monthDayRelation?.source.targetYear]);
  useEffect(() => {
    if (!currentChartId || !monthDayVisibility) return;
    void fetch(`/api/bazi/charts/${currentChartId}/month-day-visibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetDate: monthDayVisibility.target.effectiveDate,
        targetYear: monthDayVisibility.source.targetYear,
      }),
    }).catch(() => undefined);
  }, [currentChartId, monthDayVisibility?.target.effectiveDate, monthDayVisibility?.source.targetYear]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    if (PROFILE_FIELDS.has(key)) setSelectedProfile(null);
    setCurrentChartId(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/bazi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          longitude: form.longitude.trim() ? Number(form.longitude) : undefined,
        }),
      });
      const data = await response.json() as { result?: BaziCalculationResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || '排盘失败');
      setResult(data.result);
      setCurrentChartId(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '排盘失败');
    } finally {
      setLoading(false);
    }
  };

  const openProfile = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      const profile = await fetchProfile(id);
      applyProfile(profile);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : '出生档案读取失败');
    } finally {
      setBusyId('');
    }
  };

  const applyProfile = (profile: BaziBirthProfileDetail, preferredChart?: BaziChartVersion | null) => {
    const chart = preferredChart ?? profile.charts[0] ?? null;
    setSelectedProfile(profile);
    setForm({
      displayName: profile.displayName,
      birthDate: profile.birthDate,
      birthTime: profile.birthTime?.slice(0, 5) ?? '12:00',
      gender: profile.gender,
      timeStandard: chart?.timeStandard ?? 'civil_time',
      timeZoneId: profile.timeZoneId,
      longitude: profile.longitude === null ? '' : String(profile.longitude),
      lateZiPolicy: chart?.lateZiPolicy ?? 'same_day',
      unknownTime: profile.unknownTime,
      locationLabel: profile.locationLabel ?? '',
      notes: profile.notes ?? '',
    });
    setResult(chart?.result ?? null);
    setCurrentChartId(chart?.id ?? null);
  };

  const startNewProfile = () => {
    setSelectedProfile(null);
    setCurrentChartId(null);
    setResult(null);
    setForm(INITIAL_FORM);
    setError('');
  };

  const saveCurrent = async () => {
    if (!result) return;
    if (!selectedProfile && !form.displayName.trim()) {
      setError('保存前请填写档案名称');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (selectedProfile) {
        const response = await fetch(`/api/bazi/profiles/${selectedProfile.id}/charts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeStandard: form.timeStandard, lateZiPolicy: form.lateZiPolicy }),
        });
        const data = await response.json() as { chart?: BaziChartVersion; error?: string };
        if (!response.ok || !data.chart) throw new Error(data.error || '八字版本保存失败');
        const profile = await fetchProfile(selectedProfile.id);
        applyProfile(profile, data.chart);
      } else {
        const response = await fetch('/api/bazi/profiles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: form.displayName,
            birthDate: form.birthDate,
            birthTime: form.unknownTime ? null : form.birthTime,
            gender: form.gender,
            unknownTime: form.unknownTime,
            timeZoneId: form.timeZoneId,
            longitude: form.longitude.trim() ? Number(form.longitude) : null,
            locationLabel: form.locationLabel,
            notes: form.notes,
            initialChart: { timeStandard: form.timeStandard, lateZiPolicy: form.lateZiPolicy },
          }),
        });
        const data = await response.json() as { profile?: BaziBirthProfileDetail; error?: string };
        if (!response.ok || !data.profile) throw new Error(data.error || '出生档案保存失败');
        applyProfile(data.profile);
      }
      await loadProfiles();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const openChart = (chart: BaziChartVersion) => {
    if (!selectedProfile) return;
    applyProfile(selectedProfile, chart);
  };

  const deleteChart = async (chart: BaziChartVersion) => {
    if (!window.confirm('确定删除这个排盘版本吗？关联的八字解读会话和消息也会删除；出生档案及其他版本会保留。')) return;
    setBusyId(chart.id);
    try {
      const response = await fetch(`/api/bazi/charts/${chart.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || '八字版本删除失败');
      }
      if (selectedProfile) applyProfile(await fetchProfile(selectedProfile.id));
      await loadProfiles();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '八字版本删除失败');
    } finally {
      setBusyId('');
    }
  };

  const deleteProfile = async (profile: BaziBirthProfileListItem) => {
    if (!window.confirm(`确定删除出生档案“${profile.displayName}”吗？其中的全部八字版本、解读会话和消息也会删除。`)) return;
    setBusyId(profile.id);
    try {
      const response = await fetch(`/api/bazi/profiles/${profile.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('出生档案删除失败');
      if (selectedProfile?.id === profile.id) startNewProfile();
      await loadProfiles();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '出生档案删除失败');
    } finally {
      setBusyId('');
    }
  };

  const startChat = async () => {
    if (!currentChartId || startingChat) return;
    setStartingChat(true);
    setError('');
    try {
      const response = await fetch('/api/bazi/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartVersionId: currentChartId }),
      });
      const data = await response.json() as { conversation?: { id: string }; error?: string };
      if (!response.ok || !data.conversation) throw new Error(data.error || '八字解读会话创建失败');
      router.push(`/bazi/chat/${data.conversation.id}`);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : '八字解读会话创建失败');
      setStartingChat(false);
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
            <h1 className="text-lg font-semibold tracking-wide">八字确定性排盘</h1>
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>M9-13 · 格局成败、破格与救应条件证据审计</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 md:px-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="h-fit space-y-4 xl:sticky xl:top-6">
          <SavedProfilesPanel
            profiles={profiles}
            selectedId={selectedProfile?.id ?? null}
            loading={historyLoading}
            busyId={busyId}
            onOpen={openProfile}
            onDelete={deleteProfile}
            onNew={startNewProfile}
          />

        <section className="rounded-xl border p-5" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><CalendarDots size={20} /></div>
            <div>
              <h2 className="font-semibold">出生信息</h2>
              <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>规则选项会随结果一起返回，不做隐藏换算。</p>
            </div>
          </div>

          <form className="bazi-form space-y-4" onSubmit={submit}>
            <Field label="档案名称" hint={selectedProfile ? '修改后将另存新档案' : '保存时必填'}>
              <input className="rectification-input" value={form.displayName} onChange={event => update('displayName', event.target.value)} placeholder="例如：我的八字档案" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="出生日期">
                <input className="rectification-input" type="date" min="1900-01-01" max="2100-12-31" required value={form.birthDate} onChange={event => update('birthDate', event.target.value)} />
              </Field>
              <Field label="性别">
                <select className="rectification-input" value={form.gender} onChange={event => update('gender', event.target.value as FormState['gender'])}>
                  <option value="male">男</option><option value="female">女</option>
                </select>
              </Field>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
              <input type="checkbox" checked={form.unknownTime} onChange={event => update('unknownTime', event.target.checked)} />
              <span className="text-sm">出生时辰未知</span>
            </label>

            {!form.unknownTime && <Field label="出生时间" hint="请尽量填写到分钟">
              <input className="rectification-input" type="time" required value={form.birthTime} onChange={event => update('birthTime', event.target.value)} />
            </Field>}

            <Field label="时间标准">
              <select className="rectification-input" value={form.timeStandard} onChange={event => update('timeStandard', event.target.value as FormState['timeStandard'])}>
                <option value="civil_time">民用时间（默认）</option>
                <option value="apparent_solar_time">地方视太阳时</option>
              </select>
            </Field>

            {form.timeStandard === 'apparent_solar_time' && <div className="grid grid-cols-2 gap-3">
              <Field label="IANA 时区">
                <input className="rectification-input" value={form.timeZoneId} onChange={event => update('timeZoneId', event.target.value)} placeholder="Asia/Shanghai" />
              </Field>
              <Field label="出生地经度" hint="东经为正">
                <input className="rectification-input" type="number" min="-180" max="180" step="0.0001" required value={form.longitude} onChange={event => update('longitude', event.target.value)} />
              </Field>
            </div>}

            <Field label="出生地点备注" hint="选填">
              <input className="rectification-input" value={form.locationLabel} onChange={event => update('locationLabel', event.target.value)} placeholder="例如：北京市朝阳区" />
            </Field>

            <Field label="晚子时日柱规则" hint="仅影响 23:00-23:59">
              <select className="rectification-input" value={form.lateZiPolicy} onChange={event => update('lateZiPolicy', event.target.value as FormState['lateZiPolicy'])}>
                <option value="same_day">23 点仍按当天（库默认）</option>
                <option value="next_day">23 点起按次日</option>
              </select>
            </Field>

            {error && <div role="alert" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(180,55,45,.35)', color: 'var(--ji)', background: 'rgba(180,55,45,.06)' }}>{error}</div>}

            <button type="submit" disabled={loading} className="btn-accent w-full justify-center disabled:cursor-wait disabled:opacity-60">
              <Sparkle size={17} weight="fill" /> {loading ? '正在计算…' : '生成八字基础盘'}
            </button>
          </form>
        </section>
        </aside>

        <section className="min-w-0">
          {result && <PersistenceBar
            selectedProfile={selectedProfile}
            currentChartId={currentChartId}
            saving={saving}
            startingChat={startingChat}
            onSave={saveCurrent}
            onChat={startChat}
          />}
          {selectedProfile && selectedProfile.charts.length > 0 && <ChartVersionPanel
            profile={selectedProfile}
            currentChartId={currentChartId}
            busyId={busyId}
            onOpen={openChart}
            onDelete={deleteChart}
          />}
          {!result ? <EmptyState /> : <>
            <BaziResult result={result} />
            {interpretation && <BaziInterpretationPanel result={interpretation} />}
            {luckCycles && <BaziLuckCyclePanel result={luckCycles} />}
            {annualTimeline && <BaziAnnualTimelinePanel result={annualTimeline} selectedYear={selectedAnnualYear} onSelectYear={setSelectedAnnualYear} />}
            {monthDayTimeline && <BaziMonthDayTimelinePanel result={monthDayTimeline} selectedDate={selectedFlowDate} onSelectDate={setSelectedFlowDate} />}
            {monthDayRelation && <BaziMonthDayRelationPanel result={monthDayRelation} />}
            {monthDayVisibility && <BaziMonthDayVisibilityPanel result={monthDayVisibility} />}
            {relationAudit && <BaziRelationAuditPanel result={relationAudit} selectedYear={selectedAnnualYear} />}
            {relationAdjudication && <BaziRelationAdjudicationPanel result={relationAdjudication} selectedYear={selectedAnnualYear} />}
            {dynamicTenGod && <BaziDynamicTenGodPanel result={dynamicTenGod} selectedYear={selectedAnnualYear} />}
            {tenGodRepeat && <BaziTenGodRepeatPanel result={tenGodRepeat} selectedYear={selectedAnnualYear} />}
            {transparencyRoot && <BaziTransparencyRootPanel result={transparencyRoot} selectedYear={selectedAnnualYear} />}
            {hiddenStemActivation && <BaziHiddenStemActivationPanel result={hiddenStemActivation} selectedYear={selectedAnnualYear} />}
            {strengthComposite && <BaziStrengthCompositePanel result={strengthComposite} selectedYear={selectedAnnualYear} />}
            {patternCondition && <BaziPatternConditionPanel result={patternCondition} />}
          </>}
        </section>
      </div>
    </main>
  );
}

function SavedProfilesPanel({
  profiles, selectedId, loading, busyId, onOpen, onDelete, onNew,
}: {
  profiles: BaziBirthProfileListItem[];
  selectedId: string | null;
  loading: boolean;
  busyId: string;
  onOpen: (id: string) => Promise<void>;
  onDelete: (profile: BaziBirthProfileListItem) => Promise<void>;
  onNew: () => void;
}) {
  return <section className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Database size={18} style={{ color: 'var(--ac-dim)' }} /><div><h2 className="text-sm font-semibold">已保存档案</h2><p className="text-[10px]" style={{ color: 'var(--tx-3)' }}>{profiles.length} 份本地记录</p></div></div>
      <button type="button" onClick={onNew} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: 'var(--bdr)', color: 'var(--ac-dim)' }}><Plus size={13} /> 新建</button>
    </div>
    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
      {loading && <p className="py-5 text-center text-xs" style={{ color: 'var(--tx-3)' }}>正在读取本地档案…</p>}
      {!loading && profiles.length === 0 && <p className="rounded-lg border border-dashed px-3 py-5 text-center text-xs leading-5" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>还没有保存记录。生成基础盘后即可建立第一份档案。</p>}
      {!loading && profiles.map(profile => <div key={profile.id} className="group flex items-stretch rounded-lg border" style={{ borderColor: selectedId === profile.id ? 'var(--ac-bdr)' : 'var(--bdr)', background: selectedId === profile.id ? 'var(--ac-bg)' : 'var(--bg-1)' }}>
        <button type="button" disabled={busyId === profile.id} onClick={() => void onOpen(profile.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left disabled:opacity-60">
          <span className="block truncate text-sm font-medium">{profile.displayName}</span>
          <span className="mt-1 block truncate font-mono text-[10px]" style={{ color: 'var(--tx-3)' }}>{profile.birthDate}{profile.birthTime ? ` ${profile.birthTime.slice(0, 5)}` : ' · 时辰未知'} · {profile.chartCount} 个版本</span>
          {profile.latestPillars && <span className="mt-1 block truncate text-[10px]" style={{ color: 'var(--ac-dim)' }}>{profile.latestPillars}</span>}
        </button>
        <button type="button" aria-label={`删除档案 ${profile.displayName}`} disabled={busyId === profile.id} onClick={() => void onDelete(profile)} className="px-3 opacity-60 transition-opacity hover:opacity-100 disabled:opacity-30" style={{ color: 'var(--ji)' }}><Trash size={14} /></button>
      </div>)}
    </div>
  </section>;
}

function PersistenceBar({
  selectedProfile, currentChartId, saving, startingChat, onSave, onChat,
}: {
  selectedProfile: BaziBirthProfileDetail | null;
  currentChartId: string | null;
  saving: boolean;
  startingChat: boolean;
  onSave: () => Promise<void>;
  onChat: () => Promise<void>;
}) {
  const saved = Boolean(currentChartId);
  return <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{ borderColor: saved ? 'rgba(45,122,74,.3)' : 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex items-start gap-3">
      <div className="rounded-lg p-2" style={{ color: saved ? 'var(--lu)' : 'var(--ac-dim)', background: 'var(--bg-1)' }}>{saved ? <FolderOpen size={18} /> : <FloppyDisk size={18} />}</div>
      <div><p className="text-sm font-medium">{saved ? '当前版本已保存在本地' : selectedProfile ? `保存为“${selectedProfile.displayName}”的新版本` : '把当前结果保存为出生档案'}</p><p className="mt-1 text-xs" style={{ color: 'var(--tx-3)' }}>{saved ? '可从左侧历史重新打开，并保留实际计算口径。' : '相同档案与相同规则会自动复用已有版本。'}</p></div>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={saving || saved} onClick={() => void onSave()} className="btn-accent !px-5 !py-2.5 disabled:cursor-default disabled:opacity-55"><FloppyDisk size={15} /> {saving ? '正在保存…' : saved ? '已保存' : '保存当前排盘'}</button>
      {saved && <button type="button" disabled={startingChat} onClick={() => void onChat()} className="btn-accent !px-5 !py-2.5 disabled:opacity-55"><ChatCircleDots size={16} weight="fill" /> {startingChat ? '正在进入…' : '开始基础解读'}</button>}
    </div>
  </section>;
}

function ChartVersionPanel({
  profile, currentChartId, busyId, onOpen, onDelete,
}: {
  profile: BaziBirthProfileDetail;
  currentChartId: string | null;
  busyId: string;
  onOpen: (chart: BaziChartVersion) => void;
  onDelete: (chart: BaziChartVersion) => Promise<void>;
}) {
  return <section className="mb-4 rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex items-center gap-2"><GitBranch size={17} style={{ color: 'var(--ac-dim)' }} /><h3 className="text-sm font-semibold">{profile.displayName} · 排盘版本</h3><span className="rounded-full px-2 py-0.5 text-[10px]" style={{ color: 'var(--tx-3)', background: 'var(--bg-1)' }}>{profile.charts.length}</span></div>
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {profile.charts.map(chart => <div key={chart.id} className="flex min-w-[210px] items-stretch rounded-lg border" style={{ borderColor: currentChartId === chart.id ? 'var(--ac-bdr)' : 'var(--bdr)', background: currentChartId === chart.id ? 'var(--ac-bg)' : 'var(--bg-1)' }}>
        <button type="button" onClick={() => onOpen(chart)} className="min-w-0 flex-1 px-3 py-2 text-left">
          <span className="block text-xs font-medium">{chart.timeStandard === 'civil_time' ? '民用时间' : '地方视太阳时'} · {chart.lateZiPolicy === 'same_day' ? '晚子按当天' : '晚子按次日'}</span>
          <span className="mt-1 block truncate font-mono text-[10px]" style={{ color: 'var(--tx-3)' }}>{formatChartPillars(chart.result)}</span>
          <span className="mt-1 block text-[9px]" style={{ color: 'var(--tx-3)' }}>{formatSavedTime(chart.createdAt)}</span>
        </button>
        <button type="button" aria-label="删除排盘版本" disabled={busyId === chart.id} onClick={() => void onDelete(chart)} className="px-2.5 opacity-55 hover:opacity-100 disabled:opacity-30" style={{ color: 'var(--ji)' }}><Trash size={13} /></button>
      </div>)}
    </div>
  </section>;
}

function BaziResult({ result }: { result: BaziCalculationResult }) {
  const pillarList = [result.pillars.year, result.pillars.month, result.pillars.day, result.pillars.time];
  return <div className="space-y-5 animate-fade-in">
    <section className="rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em]" style={{ color: 'var(--ac-dim)' }}>四柱基础盘</p>
          <h2 className="mt-2 text-2xl font-semibold">日主 {result.dayMaster.stem}{result.dayMaster.element}</h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--tx-3)' }}>{result.calendar.solar} · 农历{result.calendar.lunar}</p>
        </div>
        <span className="rounded-full px-3 py-1 text-xs" style={{ color: result.completeness === 'complete' ? 'var(--lu)' : 'var(--ac-dim)', background: 'var(--bg-1)' }}>
          {result.completeness === 'complete' ? '四柱完整' : '时柱待补'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {pillarList.map((pillar, index) => pillar ? <PillarCard key={pillar.key} pillar={pillar} isDay={pillar.key === 'day'} /> : <UnknownPillar key={index} />)}
      </div>
    </section>

    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border p-5" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
        <h3 className="font-semibold">五行结构计数</h3>
        <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>表层统计天干与地支，藏干另列；这不是旺衰或用神评分。</p>
        <div className="mt-5 space-y-3">
          {result.elementCounts.map(item => {
            const max = Math.max(1, ...result.elementCounts.map(value => value.surface + value.hiddenStems));
            return <div key={item.element} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 text-sm">
              <span className="font-semibold" style={{ color: ELEMENT_COLORS[item.element] }}>{item.element}</span>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--bg-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${(item.surface + item.hiddenStems) / max * 100}%`, background: ELEMENT_COLORS[item.element] }} />
              </div>
              <span className="font-mono text-xs" style={{ color: 'var(--tx-3)' }}>表 {item.surface} · 藏 {item.hiddenStems}</span>
            </div>;
          })}
        </div>
      </section>

      <section className="rounded-xl border p-5" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
        <h3 className="font-semibold">本次计算口径</h3>
        <div className="mt-4 space-y-2">
          {result.rulesApplied.map(rule => <div key={rule} className="flex gap-2 text-sm leading-5"><span style={{ color: 'var(--ac)' }}>◇</span><span>{rule}</span></div>)}
        </div>
        {result.effectiveTime.conversion && <div className="mt-4 rounded-lg border p-3 text-xs leading-5" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)', color: 'var(--tx-3)' }}>
          民用时间经度修正 {formatMinutes(result.effectiveTime.conversion.longitudeCorrectionMinutes)}，均时差 {formatMinutes(result.effectiveTime.conversion.equationOfTimeMinutes)}，换算为 {result.effectiveTime.date} {result.effectiveTime.time}。
        </div>}
      </section>
    </div>

    {result.warnings.length > 0 && <section className="rounded-xl border p-4" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <div className="flex gap-3"><Warning className="mt-0.5 shrink-0" size={18} style={{ color: 'var(--ac-dim)' }} /><div><h3 className="text-sm font-medium">边界提示</h3>{result.warnings.map(warning => <p key={warning} className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>{warning}</p>)}</div></div>
    </section>}

    <section className="flex gap-3 rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
      <Info className="mt-0.5 shrink-0" size={18} style={{ color: 'var(--ac-dim)' }} />
      <p className="text-xs leading-5" style={{ color: 'var(--tx-3)' }}>当前已开放至 M9-10：可查看同干／同十神重复簇，并继续审计藏干是否存在完全同干表层、表层是否具有严格同干根或仅同五行支持。条件匹配不等于透干有效、根气有力、藏干引动、旺衰变化、吉凶或具体事件。</p>
    </section>
  </div>;
}

function BaziInterpretationPanel({ result }: { result: BaziInterpretationResult }) {
  const statusLabel = (status: string) => ({
    supported_candidate: '有透干支持', candidate: '基础候选', review_required: '需人工复核',
    candidate_direction: '候选方向', reference_pending: '待校勘', withheld: '暂缓',
  })[status] ?? status;
  return <section className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><GitBranch size={19} /></div><div><p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-3 · 规则证据审计</p><h2 className="mt-1 text-lg font-semibold">旺衰、格局与用神方法分层</h2><p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>不使用旺衰总分；每个标签都能回看证据、规则版本和暂缓原因。</p></div></div>
      <span className="rounded-full px-3 py-1 text-[10px]" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{result.methodologyVersion}</span>
    </div>

    <div className="mt-5 grid gap-4 xl:grid-cols-3">
      <article className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">旺衰证据</h3><span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}>置信度 {result.strength.confidence === 'medium' ? '中' : '低'}</span></div>
        <p className="mt-3 text-base font-semibold">{result.strength.label}</p>
        <p className="mt-1 text-[10px]" style={{ color: 'var(--tx-3)' }}>月支 {result.strength.monthBranch} · 本气 {result.strength.monthMainQiStem} · {relationText(result.strength.monthRelation)}</p>
        <div className="mt-3 space-y-2">{result.strength.rationale.map(item => <p key={item} className="text-[10px] leading-5" style={{ color: 'var(--tx-2)' }}>◇ {item}</p>)}</div>
        <p className="mt-3 border-t pt-3 text-[9px] leading-5" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>{result.strength.boundary}</p>
      </article>

      <article className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">月令格局候选</h3>{result.pattern.requiresManualReview && <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: 'var(--ji)', background: 'rgba(180,55,45,.07)' }}>需要复核</span>}</div>
        <div className="mt-3 space-y-2">{result.pattern.candidates.map(candidate => <div key={`${candidate.sourceStem}-${candidate.tenGod}`} className="rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}><div className="flex justify-between gap-2"><span className="text-xs font-medium">{candidate.label}</span><span className="text-[9px]" style={{ color: 'var(--ac-dim)' }}>{statusLabel(candidate.status)}</span></div><p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{candidate.reasons.join(' ')}</p></div>)}</div>
        {result.pattern.candidates.length === 0 && <p className="mt-4 text-xs" style={{ color: 'var(--tx-3)' }}>当前没有可自动记录的月令候选。</p>}
        <p className="mt-3 text-[9px] leading-5" style={{ color: 'var(--tx-3)' }}>{result.pattern.boundary}</p>
      </article>

      <article className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <h3 className="text-sm font-semibold">分方法取用</h3>
        <div className="mt-3 space-y-2">{result.usefulGod.methods.map(method => <div key={method.method} className="rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}><div className="flex justify-between gap-2"><span className="text-xs font-medium">{method.label}</span><span className="text-[9px]" style={{ color: method.status === 'candidate_direction' ? 'var(--lu)' : 'var(--tx-3)' }}>{statusLabel(method.status)}</span></div><p className="mt-1 text-[9px]" style={{ color: 'var(--ac-dim)' }}>元素：{method.candidateElements.join('、') || '暂不指定'}{method.candidateRoles.length ? ` · 角色：${method.candidateRoles.join('、')}` : ''}</p><p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{method.boundary}</p></div>)}</div>
      </article>
    </div>

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(180,125,35,.25)', background: 'rgba(180,125,35,.06)' }}><div className="flex items-start gap-2"><Warning size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--ac-dim)' }} /><div><p className="text-[10px] leading-5">{result.usefulGod.terminologyWarning}</p><p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{result.warnings.join(' ')}</p></div></div></div>
  </section>;
}

function BaziLuckCyclePanel({ result }: { result: BaziLuckCycleResult }) {
  const complete = result.status === 'complete';
  return <section className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><CalendarDots size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-4 · 确定性排期</p>
          <h2 className="mt-1 text-lg font-semibold">大运顺逆、起运与交运边界</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>逐项公开顺逆依据、所取节和折算过程；排期不等同于运势判断。</p>
        </div>
      </div>
      <span className="rounded-full px-3 py-1 text-[10px]" style={{ color: complete ? 'var(--lu)' : 'var(--ac-dim)', background: 'var(--bg-1)' }}>{complete ? '精确排期已建立' : '精确日期已降级'}</span>
    </div>

    <div className="mt-5 grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <p className="text-[10px] tracking-wider" style={{ color: 'var(--tx-3)' }}>顺逆依据</p>
        <p className="mt-2 text-xl font-semibold">{result.direction.label}</p>
        <p className="mt-2 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>{result.direction.basis}</p>
      </div>
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <p className="text-[10px] tracking-wider" style={{ color: 'var(--tx-3)' }}>{result.direction.value === 'forward' ? '顺取下一个节' : '逆取上一个节'}</p>
        <p className="mt-2 text-base font-semibold">{result.referenceJie ? `${result.referenceJie.name} · ${result.referenceJie.elapsedMinutes} 分钟` : '条件不足，暂不生成'}</p>
        <p className="mt-2 font-mono text-[10px]" style={{ color: 'var(--tx-3)' }}>{result.referenceJie?.at ?? '需要准确时辰与已校准时区'}</p>
      </div>
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <p className="text-[10px] tracking-wider" style={{ color: 'var(--tx-3)' }}>起运间隔与交运时刻</p>
        <p className="mt-2 text-base font-semibold">{result.startOffset?.label ?? '未生成精确间隔'}</p>
        <p className="mt-2 font-mono text-[10px]" style={{ color: 'var(--tx-3)' }}>{result.startAt ?? '未生成精确交运时刻'}</p>
      </div>
    </div>

    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {result.cycles.map(item => <article key={item.index} className="rounded-xl border p-3" style={{ borderColor: item.scheduleStatus === 'established' ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex items-center justify-between gap-2"><span className="text-[10px]" style={{ color: 'var(--tx-3)' }}>第 {item.index} 步</span><span className="font-serif text-xl font-semibold" style={{ color: 'var(--ac-dim)' }}>{item.ganZhi}</span></div>
        {item.startAt ? <>
          <p className="mt-3 font-mono text-[10px]">{item.startAt.slice(0, 10)} 起</p>
          <p className="mt-1 text-[10px]" style={{ color: 'var(--tx-3)' }}>{item.nominalStartYear}-{item.nominalEndYear} · 名义 {item.nominalStartAge}-{item.nominalEndAge} 岁</p>
        </> : <p className="mt-3 text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>暂定干支序列；不显示年龄和日期</p>}
      </article>)}
    </div>

    {result.warnings.length > 0 && <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      {result.warnings.map(warning => <p key={warning} className="text-xs leading-5" style={{ color: 'var(--tx-3)' }}>◇ {warning}</p>)}
    </div>}
    <p className="mt-4 text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>{result.boundary} · {result.methodologyVersion}</p>
  </section>;
}

function BaziAnnualTimelinePanel({
  result, selectedYear, onSelectYear,
}: {
  result: BaziAnnualTimelineResult;
  selectedYear: number;
  onSelectYear: (year: number) => void;
}) {
  const item = result.years.find(value => value.year === selectedYear) ?? result.years[0];
  if (!item) return null;
  const canPrevious = item.year > result.range.startYear;
  const canNext = item.year < result.range.endYear;
  return <section data-testid="bazi-annual-timeline" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><CalendarDots size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-5 · 立春切年与跨运分段</p>
          <h2 className="mt-1 text-lg font-semibold">流年确定性时间轴</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>查看某个流年的精确起止和实际大运归属；时间轴不等同于运势判断。</p>
        </div>
      </div>
      <span className="rounded-full px-3 py-1 text-[10px]" style={{ color: result.status === 'complete' ? 'var(--lu)' : 'var(--ac-dim)', background: 'var(--bg-1)' }}>
        {result.status === 'complete' ? '流年与大运已对齐' : result.status === 'annual_schedule_only' ? '仅建立流年边界' : '仅提供干支顺序'}
      </span>
    </div>

    <div className="mt-5 flex flex-wrap items-center gap-2">
      <button type="button" aria-label="上一个流年" disabled={!canPrevious} onClick={() => onSelectYear(item.year - 1)} className="btn-ghost !px-3 !py-2 disabled:opacity-30">上一年</button>
      <select data-testid="annual-year-select" aria-label="选择流年" className="rectification-input !w-auto min-w-40" value={item.year} onChange={event => onSelectYear(Number(event.target.value))}>
        {result.years.map(year => <option key={year.year} value={year.year}>{year.year} · {year.ganZhi}{year.crossesLuckCycleBoundary ? ' · 跨运' : ''}</option>)}
      </select>
      <button type="button" aria-label="下一个流年" disabled={!canNext} onClick={() => onSelectYear(item.year + 1)} className="btn-ghost !px-3 !py-2 disabled:opacity-30">下一年</button>
      <span className="text-[10px]" style={{ color: 'var(--tx-3)' }}>范围 {result.range.startYear}—{result.range.endYear} · 共 {result.range.yearCount} 个流年</span>
    </div>

    <div className="mt-4 grid gap-3 lg:grid-cols-[230px_minmax(0,1fr)]">
      <article className="rounded-xl border p-4" style={{ borderColor: item.crossesLuckCycleBoundary ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-1)' }}>
        <p className="text-[10px] tracking-wider" style={{ color: 'var(--tx-3)' }}>流年干支</p>
        <p className="mt-2 font-serif text-3xl font-semibold" style={{ color: 'var(--ac-dim)' }}>{item.ganZhi}</p>
        <p className="mt-3 font-mono text-[10px] leading-5">{item.liChunAt ?? '立春时刻未生成'}<br />至 {item.nextLiChunAt ? `${item.nextLiChunAt} 前` : '下一边界未生成'}</p>
        {item.startsBeforeBirth && <p className="mt-2 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>出生发生在本流年区间内，有效区间已从出生时刻开始裁剪。</p>}
      </article>
      <article className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">实际大运归属</h3>{item.crossesLuckCycleBoundary && <span data-testid="annual-cross-cycle" className="rounded-full px-2 py-1 text-[9px]" style={{ color: 'var(--ac)', background: 'var(--ac-bg)' }}>本流年跨越交运边界</span>}</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {item.segments.map((segment, index) => <div key={`${segment.startAt}-${index}`} className="rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
            <p className="text-xs font-medium">{segment.label}</p>
            <p className="mt-1 font-mono text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{segment.startAt}<br />至 {segment.endAtExclusive} 前</p>
          </div>)}
          {item.segments.length === 0 && <p className="text-xs leading-5" style={{ color: 'var(--tx-3)' }}>当前条件不足，暂不生成大运归属。</p>}
        </div>
      </article>
    </div>

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <p className="text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>{result.boundary} · {result.methodologyVersion}</p>
    </div>
  </section>;
}

function BaziMonthDayTimelinePanel({
  result, selectedDate, onSelectDate,
}: {
  result: BaziMonthDayTimelineResult;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const day = result.days.find(item => item.effectiveDate === selectedDate) ?? result.days[0];
  const firstDate = result.days[0]?.effectiveDate;
  const lastDate = result.days.at(-1)?.effectiveDate;
  return <section data-testid="bazi-month-day-timeline" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><Clock size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-14 · 精确节界与晚子时换日</p>
          <h2 className="mt-1 text-lg font-semibold">{result.source.targetYear} {result.source.targetYearGanZhi} · 流月流日确定性时间轴</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>流月按“节”的精确时刻交接；流日沿用排盘时保存的晚子时规则，只展示时间归属。</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{result.counts.months} 个流月</span>
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--ac-dim)', background: 'var(--bg-1)' }}>{result.counts.days} 个有效流日</span>
      </div>
    </div>

    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {result.months.map(month => <article key={month.index} data-testid="flow-month-item" className="rounded-xl border p-3" style={{ borderColor: month.crossesLuckCycleBoundary ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-[9px]" style={{ color: 'var(--tx-3)' }}>第 {month.index} 流月 · {month.jieName}交接</p><p className="mt-1 font-serif text-xl font-semibold" style={{ color: 'var(--ac-dim)' }}>{month.ganZhi}</p></div>{month.crossesLuckCycleBoundary && <span className="rounded-full px-2 py-1 text-[8px]" style={{ color: 'var(--lu)', background: 'var(--bg-card)' }}>月内跨运</span>}</div>
        <p className="mt-2 font-mono text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{month.startAt ?? '精确节界未生成'}<br />至 {month.endAtExclusive ? `${month.endAtExclusive} 前` : '下一节界未生成'}</p>
        {month.segments.length > 0 && <p className="mt-2 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{month.segments.map(segment => segment.label).filter((label, index, labels) => labels.indexOf(label) === index).join(' → ')}</p>}
      </article>)}
    </div>

    {result.days.length > 0 && day && <div className="mt-5 rounded-xl border p-4" style={{ borderColor: day.crossesMonthBoundary || day.crossesLuckCycleBoundary ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-1)' }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[10px] tracking-wider" style={{ color: 'var(--tx-3)' }}>流日核验器</p><h3 className="mt-1 text-sm font-semibold">选择日期，查看该流日的精确归属</h3></div>
        <input data-testid="flow-day-select" aria-label="选择流日" className="rectification-input !w-auto" type="date" min={firstDate} max={lastDate} value={day.effectiveDate} onChange={event => onSelectDate(event.target.value)} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[190px_minmax(0,1fr)]">
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <p className="text-[9px]" style={{ color: 'var(--tx-3)' }}>{day.effectiveDate} 流日干支</p>
          <p className="mt-1 font-serif text-2xl font-semibold" style={{ color: 'var(--ac-dim)' }}>{day.ganZhi}</p>
          <p className="mt-2 font-mono text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{day.startAt}<br />至 {day.endAtExclusive} 前</p>
        </div>
        <div className="space-y-2">
          {day.segments.map((segment, index) => <div key={`${segment.startAt}-${index}`} data-testid="flow-day-segment" className="rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">第 {segment.monthIndex} 流月 {segment.monthGanZhi}</p><span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.label}</span></div>
            <p className="mt-1 font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt} — {segment.endAtExclusive} 前</p>
          </div>)}
        </div>
      </div>
      {(day.crossesMonthBoundary || day.crossesLuckCycleBoundary) && <p className="mt-3 text-[9px] leading-4" style={{ color: 'var(--ac-dim)' }}>该流日内部跨越{day.crossesMonthBoundary ? '节界' : ''}{day.crossesMonthBoundary && day.crossesLuckCycleBoundary ? '与' : ''}{day.crossesLuckCycleBoundary ? '交运边界' : ''}，因此按真实时刻保留多个归属片段。</p>}
    </div>}

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <p className="text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>换日口径：{result.source.lateZiPolicy === 'next_day' ? '23 点起按次日' : '23 点仍按当天'}。{result.boundary}</p>
      <p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{result.methodologyVersion}</p>
    </div>
  </section>;
}

function resolveInitialFlowDate(result: BaziMonthDayTimelineResult): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(item => [item.type, item.value]));
  const base = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)
    + (result.source.lateZiPolicy === 'next_day' && Number(parts.hour) >= 23 ? 1 : 0)));
  const today = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
  return result.days.some(item => item.effectiveDate === today) ? today : result.days[0]?.effectiveDate ?? '';
}

function BaziMonthDayRelationPanel({ result }: { result: BaziMonthDayRelationResult }) {
  return <section data-testid="bazi-month-day-relation-audit" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><GitBranch size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-15 · 指定流日五层证据</p>
          <h2 className="mt-1 text-lg font-semibold">{result.target.effectiveDate} {result.target.dayGanZhi} · 动态关系与十神审计</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>组合原局、大运、流年、流月和流日；只展示至少包含流月或流日参与者的关系，不解释吉凶。</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--ac-dim)', background: 'var(--bg-1)' }}>{result.counts.evidence} 条关系</span>
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{result.counts.roles} 个十神角色</span>
      </div>
    </div>

    <div className="mt-5 space-y-4">
      {result.segments.map(segment => <article key={segment.segmentIndex} data-testid="month-day-relation-segment" className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold">片段 {segment.segmentIndex} · {segment.label}</h3><p className="mt-1 font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt} — {segment.endAtExclusive} 前</p></div>
          <span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>天干 {segment.counts.stemEvidence} · 地支 {segment.counts.branchEvidence} · 条件 {segment.counts.decisions}</span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {segment.layers.map(layer => {
            const surface = layer.roles.find(role => role.sourceKind === 'surface_stem');
            const hidden = layer.roles.filter(role => role.sourceKind === 'branch_hidden_stem');
            return <div key={layer.nodeId} data-testid="month-day-dynamic-layer" className="rounded-lg border p-3" style={{ borderColor: layer.layer === 'month' || layer.layer === 'day' ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-card)' }}>
              <div className="flex items-center justify-between gap-2"><p className="text-[9px]" style={{ color: 'var(--tx-3)' }}>{monthDayLayerLabel(layer.layer)}</p><span className="font-serif text-lg" style={{ color: 'var(--ac-dim)' }}>{layer.ganZhi}</span></div>
              <p className="mt-2 text-[10px]">表层 {layer.stem} · <span style={{ color: 'var(--ac-dim)' }}>{surface?.tenGod}</span></p>
              <div className="mt-2 flex flex-wrap gap-1">{hidden.map(role => <span key={role.id} className="rounded px-1.5 py-0.5 text-[8px]" style={{ color: 'var(--tx-3)', background: 'var(--bg-1)' }}>{role.hiddenQiLabel}{role.stem}·{role.tenGod}</span>)}</div>
            </div>;
          })}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">流月／流日参与的关系证据</h4><span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>证据条数不代表力量</span></div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {segment.evidence.map(evidence => <RelationEvidenceCard key={evidence.id} evidence={evidence} />)}
          </div>
        </div>

        <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--bdr)' }}>
          <h4 className="text-xs font-semibold">条件状态与关系并见</h4>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {segment.decisions.map(decision => <RelationConditionCard key={decision.id} decision={decision} />)}
            {segment.decisions.length === 0 && <p className="rounded-lg border border-dashed p-4 text-xs" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>当前只有生克同类证据，没有需要条件复核的组合关系。</p>}
          </div>
        </div>
      </article>)}
    </div>

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <p className="text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>{result.boundary}</p>
      <p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{result.methodologyVersion}</p>
    </div>
  </section>;
}

function BaziMonthDayVisibilityPanel({ result }: { result: BaziMonthDayVisibilityResult }) {
  return <section data-testid="bazi-month-day-visibility-audit" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><ShieldCheck size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-16 · 流月流日显隐、透根与藏干触达</p>
          <h2 className="mt-1 text-lg font-semibold">{result.target.effectiveDate} {result.target.dayGanZhi} · 动态条件证据审计</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>只保留有流月或流日参与的候选；同见、匹配与触达均不等于力量变化或实际发动。</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--ac-dim)', background: 'var(--bg-1)' }}>同干簇 {result.counts.stemClusters}</span>
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>透出匹配 {result.counts.transparencyMatched}</span>
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--tx-3)', background: 'var(--bg-1)' }}>藏干触达 {result.counts.touchedHiddenStems}</span>
      </div>
    </div>

    <div className="mt-5 space-y-4">
      {result.segments.map(segment => <article key={segment.segmentIndex} data-testid="month-day-visibility-segment" className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold">片段 {segment.segmentIndex} · {segment.label}</h3><p className="mt-1 font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt} — {segment.endAtExclusive} 前</p></div>
          <span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>同干 {segment.counts.stemClusters} · 同十神 {segment.counts.tenGodClusters} · 严格同干根 {segment.counts.exactSameStemRoots} · 多入口 {segment.counts.multipleTouchConditions}</span>
        </div>

        <details open className="mt-4 rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <summary className="cursor-pointer text-xs font-semibold">流月／流日参与的显隐重复簇</summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {segment.repeatAudit.stemClusters.map(cluster => <StemRepeatClusterCard key={cluster.id} cluster={cluster} />)}
            {segment.repeatAudit.stemClusters.length === 0 && <p className="text-xs" style={{ color: 'var(--tx-3)' }}>本片段没有流月或流日参与的同干重复。</p>}
          </div>
        </details>

        <details className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <summary className="cursor-pointer text-xs font-semibold">透出与根气条件</summary>
          <div className="mt-3 grid gap-4 xl:grid-cols-2">
            <div className="space-y-2"><p className="text-[9px]" style={{ color: 'var(--tx-3)' }}>藏干 → 表层：完全同干匹配</p>{segment.transparencyRootAudit.transparencyCandidates.map(candidate => <TransparencyCandidateCard key={candidate.id} candidate={candidate} />)}</div>
            <div className="space-y-2"><p className="text-[9px]" style={{ color: 'var(--tx-3)' }}>表层 → 藏干：严格同干与同五行支持</p>{segment.transparencyRootAudit.rootCandidates.map(candidate => <RootCandidateCard key={candidate.id} candidate={candidate} />)}</div>
          </div>
        </details>

        <details className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <summary className="cursor-pointer text-xs font-semibold">藏干触达条件</summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {segment.hiddenStemTouchAudit.candidates.map(candidate => <HiddenStemTouchCard key={candidate.id} candidate={candidate} />)}
            {segment.hiddenStemTouchAudit.candidates.length === 0 && <p className="text-xs" style={{ color: 'var(--tx-3)' }}>本片段没有流月或流日自身、或由其入口触达的藏干候选。</p>}
          </div>
        </details>
      </article>)}
    </div>

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <p className="text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>{result.boundary}</p>
      <p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{result.methodologyVersion}</p>
    </div>
  </section>;
}

function monthDayLayerLabel(layer: string): string {
  return ({ luck_cycle: '大运', annual: '流年', month: '流月', day: '流日' } as Record<string, string>)[layer] ?? layer;
}

function BaziRelationAuditPanel({ result, selectedYear }: { result: BaziRelationAuditResult; selectedYear: number }) {
  const year = result.years.find(item => item.year === selectedYear) ?? result.years[0];
  if (!year) return null;
  return <section data-testid="bazi-relation-audit" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><GitBranch size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-6 · 跨层结构证据</p>
          <h2 className="mt-1 text-lg font-semibold">{year.year} {year.annualGanZhi} · 原局—大运—流年关系审计</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>与上方流年选择同步；只列命中关系、参与柱位和规则边界，不计算吉凶分数。</p>
        </div>
      </div>
      <span className="rounded-full px-3 py-1 text-[10px]" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{year.evidenceCount} 条结构证据</span>
    </div>

    <div className="mt-5 space-y-4">
      {year.segments.map(segment => <article key={segment.segmentIndex} data-testid="relation-audit-segment" className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold">片段 {segment.segmentIndex} · {segment.label}</h3><p className="mt-1 font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt ?? '起点未生成'} — {segment.endAtExclusive ? `${segment.endAtExclusive} 前` : '终点未生成'}</p></div>
          <span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>天干 {segment.counts.stem} · 地支 {segment.counts.branch}</span>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {segment.evidence.map(evidence => <RelationEvidenceCard key={evidence.id} evidence={evidence} />)}
          {segment.evidence.length === 0 && <p className="rounded-lg border border-dashed p-4 text-xs" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>本片段没有命中当前版本已开放的跨层关系规则。</p>}
        </div>
      </article>)}
    </div>

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <p className="text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>{result.boundary}</p>
      <p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{result.methodologyVersion}</p>
    </div>
  </section>;
}

function RelationEvidenceCard({ evidence }: { evidence: BaziRelationEvidence }) {
  const scope = ({
    luck_to_natal: '大运—原局', annual_to_natal: '流年—原局',
    annual_to_luck: '流年—大运', month_to_natal: '流月—原局',
    month_to_luck: '流月—大运', month_to_annual: '流月—流年',
    day_to_natal: '流日—原局', day_to_luck: '流日—大运',
    day_to_annual: '流日—流年', day_to_month: '流日—流月', multi_layer: '多层共同',
  } as Record<string, string>)[evidence.scope] ?? evidence.scope;
  return <div data-relation-type={evidence.type} className="rounded-lg border p-3" style={{ borderColor: evidence.conclusion === 'detected_not_transformed' ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: evidence.domain === 'stem' ? 'var(--ac-dim)' : 'var(--lu)', background: 'var(--bg-1)' }}>{evidence.domain === 'stem' ? '天干' : '地支'}</span><span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>{scope}</span></div>
    <p className="mt-2 text-xs font-medium leading-5">{evidence.label}</p>
    <p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{evidence.participants.map(item => `${item.label}${item.symbol}`).join(' · ')}</p>
    <p className="mt-2 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{evidence.detail}</p>
  </div>;
}

function BaziRelationAdjudicationPanel({ result, selectedYear }: { result: BaziRelationAdjudicationResult; selectedYear: number }) {
  const year = result.years.find(item => item.year === selectedYear) ?? result.years[0];
  if (!year) return null;
  return <section data-testid="bazi-relation-adjudication" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><ShieldCheck size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-7 · 条件门槛与关系并见</p>
          <h2 className="mt-1 text-lg font-semibold">{year.year} {year.annualGanZhi} · 关系条件与冲突裁决审计</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>继续与流年选择同步；“条件齐备”只表示可核验入口通过，不代表合化或关系优先级结论。</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{year.decisionCount} 条条件记录</span>
        <span className="rounded-full px-2.5 py-1" style={{ color: year.conflictCount ? 'var(--ji)' : 'var(--tx-3)', background: 'var(--bg-1)' }}>{year.conflictCount} 个并见节点</span>
      </div>
    </div>

    <div className="mt-5 space-y-4">
      {year.segments.map(segment => <article key={segment.segmentIndex} data-testid="relation-adjudication-segment" className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold">片段 {segment.segmentIndex} · {segment.label}</h3><p className="mt-1 font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt ?? '起点未生成'} — {segment.endAtExclusive ? `${segment.endAtExclusive} 前` : '终点未生成'}</p></div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>
            <span>齐备 {segment.counts.conditionsMet}</span><span>缺失 {segment.counts.conditionsMissing}</span><span>并见 {segment.counts.relationsCoexist}</span><span>暂缓 {segment.counts.deferredAdjudication}</span>
          </div>
        </div>

        {segment.conflicts.length > 0 && <div data-testid="relation-conflict-summary" className="mt-3 rounded-lg border p-3" style={{ borderColor: 'rgba(180,55,45,.28)', background: 'rgba(180,55,45,.05)' }}>
          <p className="text-[10px] font-medium" style={{ color: 'var(--ji)' }}>关系并见节点</p>
          {segment.conflicts.map(conflict => <p key={conflict.id} className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}><span style={{ color: 'var(--tx-1)' }}>{conflict.label}</span>：{conflict.detail}</p>)}
        </div>}

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {segment.decisions.map(decision => <RelationConditionCard key={decision.id} decision={decision} />)}
          {segment.decisions.length === 0 && <p className="rounded-lg border border-dashed p-4 text-xs" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>本片段没有需要条件复核的合、冲、刑、害关系，也没有三字缺一候选。</p>}
        </div>
      </article>)}
    </div>

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <p className="text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>{result.boundary}</p>
      <p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{result.methodologyVersion}</p>
    </div>
  </section>;
}

function RelationConditionCard({ decision }: { decision: BaziRelationConditionDecision }) {
  const stateColor = ({
    conditions_met: 'var(--lu)',
    conditions_missing: 'var(--ac-dim)',
    relations_coexist: 'var(--ji)',
    deferred_adjudication: 'var(--tx-3)',
  } as Record<string, string>)[decision.state];
  return <div data-testid="relation-condition-decision" data-condition-state={decision.state} className="rounded-lg border p-3" style={{ borderColor: decision.state === 'relations_coexist' ? 'rgba(180,55,45,.32)' : decision.state === 'conditions_met' ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: stateColor, background: 'var(--bg-1)' }}>{decision.stateLabel}</span>
      <span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>{decision.sourceEvidenceId ? '完整关系复核' : '三字缺一候选'}</span>
    </div>
    <p className="mt-2 text-xs font-medium leading-5">{decision.label}</p>
    <p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{decision.participants.map(item => `${item.label}${item.symbol}`).join(' · ')}</p>
    <div className="mt-2 space-y-1">
      {decision.checks.filter(check => check.result !== 'not_applicable').map(check => <ConditionCheckRow key={`${check.code}-${check.ruleId}`} check={check} />)}
    </div>
    <p className="mt-2 border-t pt-2 text-[9px] leading-4" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>{decision.boundary}</p>
  </div>;
}

function ConditionCheckRow({ check }: { check: BaziRelationConditionCheck }) {
  const label = ({ met: '通过', missing: '缺失', conflict: '冲突', deferred: '暂缓', not_applicable: '不适用' } as Record<string, string>)[check.result] ?? check.result;
  const color = check.result === 'met' ? 'var(--lu)' : check.result === 'conflict' ? 'var(--ji)' : check.result === 'missing' ? 'var(--ac-dim)' : 'var(--tx-3)';
  return <p className="text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}><span style={{ color }}>{check.label} · {label}</span>：{check.detail}</p>;
}

function BaziDynamicTenGodPanel({ result, selectedYear }: { result: BaziDynamicTenGodResult; selectedYear: number }) {
  const year = result.years.find(item => item.year === selectedYear) ?? result.years[0];
  if (!year) return null;
  return <section data-testid="bazi-dynamic-ten-god-audit" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><Sparkle size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-8 · 动态角色与证据指向</p>
          <h2 className="mt-1 text-lg font-semibold">{year.year} {year.annualGanZhi} · 动态十神与作用方向审计</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>十神统一以日主{result.dayMaster.stem}为参照；原局指向只来自已有关系证据，不代表力量或结果。</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--ac-dim)', background: 'var(--bg-1)' }}>{year.roleCount} 个角色</span>
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{year.natalDirectionLinkCount} 条原局指向</span>
      </div>
    </div>

    <div className="mt-5 space-y-4">
      {year.segments.map(segment => <article key={segment.segmentIndex} data-testid="dynamic-ten-god-segment" className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold">片段 {segment.segmentIndex} · {segment.label}</h3><p className="mt-1 font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt ?? '起点未生成'} — {segment.endAtExclusive ? `${segment.endAtExclusive} 前` : '终点未生成'}</p></div>
          <span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>角色 {segment.counts.roles} · 藏干 {segment.counts.hiddenStemRoles} · 指向 {segment.counts.natalDirectionLinks}</span>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <DynamicTenGodLayerCard layer={segment.annual} />
          {segment.luckCycle
            ? <DynamicTenGodLayerCard layer={segment.luckCycle} />
            : <div className="rounded-lg border border-dashed p-4 text-xs leading-5" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>该片段尚未进入大运，只有流年动态角色。</div>}
        </div>
      </article>)}
    </div>

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <p className="text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>藏干只列本气、中气、余气与十神角色，不宣告透出或引动；指向只表示证据关联，不等于作用结果。</p>
      <p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{result.boundary} · {result.methodologyVersion}</p>
    </div>
  </section>;
}

function DynamicTenGodLayerCard({ layer }: { layer: BaziDynamicTenGodLayerSnapshot }) {
  const surface = layer.roles.find(role => role.sourceKind === 'surface_stem');
  const hidden = layer.roles.filter(role => role.sourceKind === 'branch_hidden_stem');
  return <div data-testid="dynamic-ten-god-role" data-dynamic-layer={layer.layer} className="rounded-lg border p-4" style={{ borderColor: layer.layer === 'annual' ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[9px] tracking-wider" style={{ color: 'var(--tx-3)' }}>{layer.layer === 'annual' ? '流年' : '大运'}动态节点</p><p className="mt-1 text-sm font-semibold">{layer.label} · <span className="font-serif text-lg" style={{ color: 'var(--ac-dim)' }}>{layer.ganZhi}</span></p></div>
      <span className="rounded-full px-2 py-1 text-[9px]" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{layer.directions.length} 条指向</span>
    </div>
    <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
      <p className="text-[9px]" style={{ color: 'var(--tx-3)' }}>表层天干</p>
      <p className="mt-1 text-xs"><span className="font-serif text-base">{layer.stem}</span> · {surface?.element} · <span style={{ color: 'var(--ac-dim)' }}>{surface?.tenGod}</span></p>
      <p className="mt-2 text-[9px]" style={{ color: 'var(--tx-3)' }}>地支 {layer.branch} 藏干</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {hidden.map(role => <span key={role.id} className="rounded px-2 py-1 text-[9px]" style={{ color: 'var(--tx-2)', background: 'var(--bg-card)' }}>{role.hiddenQiLabel} {role.stem} · {role.tenGod}</span>)}
      </div>
    </div>
    <div className="mt-3 space-y-2">
      <p className="text-[9px] font-medium" style={{ color: 'var(--tx-3)' }}>指向原局的关系证据</p>
      {layer.directions.map(direction => <DynamicDirectionRow key={direction.id} direction={direction} />)}
      {layer.directions.length === 0 && <p className="rounded-lg border border-dashed p-3 text-[9px] leading-4" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>当前片段没有 M9-6 证据把该动态节点指向原局柱位。</p>}
    </div>
  </div>;
}

function DynamicDirectionRow({ direction }: { direction: BaziDynamicDirectionLink }) {
  return <div data-testid="dynamic-ten-god-direction" className="rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
    <div className="flex flex-wrap items-center gap-2 text-[9px]"><span className="rounded-full px-2 py-0.5" style={{ color: direction.sourceDomain === 'stem' ? 'var(--ac-dim)' : 'var(--lu)', background: 'var(--bg-card)' }}>{direction.sourceDomain === 'stem' ? '天干' : '地支'}</span>{direction.conditionStateLabel && <span style={{ color: direction.conditionState === 'relations_coexist' ? 'var(--ji)' : 'var(--tx-3)' }}>{direction.conditionStateLabel}</span>}</div>
    <p className="mt-1.5 text-[10px] leading-5"><span style={{ color: 'var(--ac-dim)' }}>{direction.sourceSymbol}</span> → {direction.targetPillarLabel}{direction.targetSymbol}</p>
    <p className="text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{direction.relationLabel}</p>
  </div>;
}

function BaziTenGodRepeatPanel({ result, selectedYear }: { result: BaziTenGodRepeatResult; selectedYear: number }) {
  const year = result.years.find(item => item.year === selectedYear) ?? result.years[0];
  if (!year) return null;
  return <section data-testid="bazi-ten-god-repeat-audit" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><GitBranch size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-9 · 位置组合与显隐重复</p>
          <h2 className="mt-1 text-lg font-semibold">{year.year} {year.annualGanZhi} · 岁运十神组合与显隐重复审计</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>同干簇可包含日主参照；同十神簇只统计实际角色。重复次数只代表位置数量。</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--ac-dim)', background: 'var(--bg-1)' }}>{year.stemClusterCount} 个同干簇</span>
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{year.connectedClusterCount} 个有证据连接</span>
      </div>
    </div>

    <div className="mt-5 space-y-4">
      {year.segments.map(segment => <article key={segment.segmentIndex} data-testid="ten-god-repeat-segment" className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold">片段 {segment.segmentIndex} · {segment.label}</h3><p className="mt-1 font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt ?? '起点未生成'} — {segment.endAtExclusive ? `${segment.endAtExclusive} 前` : '终点未生成'}</p></div>
          <span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>同干 {segment.counts.stemClusters} · 同十神 {segment.counts.tenGodClusters} · 显隐同见 {segment.counts.surfaceHiddenClusters}</span>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold">同干位置簇</h4><span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>逐位置核对表层、藏干和日主参照</span></div>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {segment.stemClusters.map(cluster => <StemRepeatClusterCard key={cluster.id} cluster={cluster} />)}
            {segment.stemClusters.length === 0 && <p className="rounded-lg border border-dashed p-4 text-xs" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>本片段没有包含大运或流年的同干重复位置。</p>}
          </div>
        </div>

        <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--bdr)' }}>
          <div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold">同十神角色索引</h4><span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>日主参照不计入比肩</span></div>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {segment.tenGodClusters.map(cluster => <TenGodRoleRepeatCard key={cluster.id} cluster={cluster} />)}
            {segment.tenGodClusters.length === 0 && <p className="rounded-lg border border-dashed p-4 text-xs" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>本片段没有包含动态位置的同十神重复角色。</p>}
          </div>
        </div>
      </article>)}
    </div>

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <p className="text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>表层与藏干同见只表示位置共存，不等于透干、通根或引动；有关系证据连接也不等于力量增强或作用完成。</p>
      <p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{result.boundary} · {result.methodologyVersion}</p>
    </div>
  </section>;
}

function StemRepeatClusterCard({ cluster }: { cluster: BaziStemRepeatCluster }) {
  return <div data-testid="ten-god-stem-cluster" className="rounded-lg border p-4" style={{ borderColor: cluster.connections.length ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-serif text-xl" style={{ color: 'var(--ac-dim)' }}>{cluster.stem}</p><p className="mt-0.5 text-[9px]" style={{ color: 'var(--tx-3)' }}>动态角色：{cluster.dynamicTenGod} · {cluster.counts.total} 个位置</p></div>
      <span className="rounded-full px-2 py-1 text-[9px]" style={{ color: cluster.connections.length ? 'var(--lu)' : 'var(--tx-3)', background: 'var(--bg-1)' }}>{cluster.connections.length ? `${cluster.connections.length} 条连接` : '无表层连接'}</span>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">{cluster.patterns.map(pattern => <span key={pattern} className="rounded px-2 py-1 text-[9px]" style={{ color: pattern === 'surface_hidden_coexistence' ? 'var(--ac-dim)' : 'var(--tx-3)', background: 'var(--bg-1)' }}>{tenGodRepeatPatternLabel(pattern)}</span>)}</div>
    <div className="mt-3 space-y-1.5">{cluster.occurrences.map(item => <TenGodOccurrenceRow key={item.id} occurrence={item} />)}</div>
    {cluster.connections.length > 0 && <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--bdr)' }}><p className="text-[9px] font-medium" style={{ color: 'var(--lu)' }}>M9-6 表层证据连接</p>{cluster.connections.map(connection => <p key={connection.id} className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{connection.relationLabel}</p>)}</div>}
  </div>;
}

function TenGodRoleRepeatCard({ cluster }: { cluster: BaziTenGodRoleRepeatCluster }) {
  return <div data-testid="ten-god-role-cluster" className="rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold" style={{ color: 'var(--ac-dim)' }}>{cluster.tenGod}</p><span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>{cluster.counts.total} 处 · {cluster.stems.join('、')}</span></div>
    <p className="mt-2 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{cluster.occurrences.map(item => item.label).join('；')}</p>
    <div className="mt-2 flex flex-wrap gap-1">{cluster.patterns.map(pattern => <span key={pattern} className="rounded px-1.5 py-0.5 text-[8px]" style={{ color: 'var(--tx-3)', background: 'var(--bg-1)' }}>{tenGodRepeatPatternLabel(pattern)}</span>)}</div>
  </div>;
}

function TenGodOccurrenceRow({ occurrence }: { occurrence: BaziTenGodOccurrence }) {
  const layer = ({ natal: '原局', luck_cycle: '大运', annual: '流年', month: '流月', day: '流日' } as Record<string, string>)[occurrence.layer];
  const visibility = ({ surface: '表层', hidden: occurrence.hiddenQiLabel ?? '藏干', reference: '日主参照' } as Record<string, string>)[occurrence.visibility];
  return <div className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[9px]" style={{ background: 'var(--bg-1)' }}><span className="shrink-0 rounded px-1.5 py-0.5" style={{ color: occurrence.visibility === 'hidden' ? 'var(--tx-3)' : 'var(--ac-dim)', background: 'var(--bg-card)' }}>{layer} · {visibility}</span><span className="leading-4" style={{ color: 'var(--tx-2)' }}>{occurrence.label}{occurrence.tenGod ? ` · ${occurrence.tenGod}` : ''}</span></div>;
}

function tenGodRepeatPatternLabel(pattern: string): string {
  return ({
    surface_cross_layer_repeat: '跨层表层同干',
    surface_hidden_coexistence: '表层与藏干同见',
    hidden_cross_layer_repeat: '跨层藏干同见',
    annual_luck_repeat: '流年与大运同见',
  } as Record<string, string>)[pattern] ?? pattern;
}

function BaziTransparencyRootPanel({ result, selectedYear }: { result: BaziTransparencyRootResult; selectedYear: number }) {
  const year = result.years.find(item => item.year === selectedYear) ?? result.years[0];
  if (!year) return null;
  return <section data-testid="bazi-transparency-root-audit" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><ShieldCheck size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-10 · 透干与通根条件证据</p>
          <h2 className="mt-1 text-lg font-semibold">{year.year} {year.annualGanZhi} · 岁运透干与通根条件审计</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>完全同干、仅同五行、月令藏干和坐支位置分别记录；条件匹配不折算力量。</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--ac-dim)', background: 'var(--bg-1)' }}>透出匹配 {year.counts.transparencyMatched}</span>
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>严格同干根 {year.counts.exactSameStemRoots}</span>
        <span className="rounded-full px-2.5 py-1" style={{ color: 'var(--tx-3)', background: 'var(--bg-1)' }}>仅同五行 {year.counts.sameElementSupportOnly}</span>
      </div>
    </div>

    <div className="mt-5 space-y-4">
      {year.segments.map(segment => <article key={segment.segmentIndex} data-testid="transparency-root-segment" className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold">片段 {segment.segmentIndex} · {segment.label}</h3><p className="mt-1 font-mono text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt ?? '起点未生成'} — {segment.endAtExclusive ? `${segment.endAtExclusive} 前` : '终点未生成'}</p></div>
          <span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>月令匹配 {segment.counts.monthCommandMatched} · 坐支同干 {segment.counts.selfSeatExactRoots}</span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">藏干 → 表层：透出条件</h4><span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>匹配 {segment.counts.transparencyMatched} · 缺失 {segment.counts.transparencyMissing}</span></div>
            <div className="mt-2 space-y-2">
              {segment.transparencyCandidates.map(candidate => <TransparencyCandidateCard key={candidate.id} candidate={candidate} />)}
              {segment.transparencyCandidates.length === 0 && <p className="rounded-lg border border-dashed p-4 text-xs" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>本片段没有动态相关藏干透出候选。</p>}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">表层 → 藏干：根气条件</h4><span className="text-[9px]" style={{ color: 'var(--tx-3)' }}>同干 {segment.counts.exactSameStemRoots} · 同五行 {segment.counts.sameElementSupportOnly} · 缺失 {segment.counts.hiddenSupportMissing}</span></div>
            <div className="mt-2 space-y-2">
              {segment.rootCandidates.map(candidate => <RootCandidateCard key={candidate.id} candidate={candidate} />)}
              {segment.rootCandidates.length === 0 && <p className="rounded-lg border border-dashed p-4 text-xs" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)' }}>本片段没有动态相关表层根气候选。</p>}
            </div>
          </div>
        </div>
      </article>)}
    </div>

    <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'rgba(168,120,35,.3)', background: 'rgba(168,120,35,.06)' }}>
      <p className="text-[10px] leading-5" style={{ color: 'var(--tx-3)' }}>“透出条件匹配”不等于透干有效；“严格同干根”“同五行支持”“坐支同干”也不等于强根、真根或旺衰增强。</p>
      <p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{result.boundary} · {result.methodologyVersion}</p>
    </div>
  </section>;
}

function TransparencyCandidateCard({ candidate }: { candidate: BaziTransparencyCandidate }) {
  const matched = candidate.status === 'exact_surface_matched';
  return <div data-testid="transparency-candidate" className="rounded-lg border p-3" style={{ borderColor: matched ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-xs font-semibold"><span className="font-serif text-base" style={{ color: 'var(--ac-dim)' }}>{candidate.stem}</span> · {candidate.tenGod}</p><p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{candidate.hiddenOccurrence.label}</p></div>
      <span className="rounded-full px-2 py-1 text-[9px]" style={{ color: matched ? 'var(--lu)' : 'var(--tx-3)', background: 'var(--bg-1)' }}>{matched ? '完全同干已匹配' : '缺少完全同干表层'}</span>
    </div>
    <p className="mt-2 text-[9px] leading-4" style={{ color: 'var(--tx-2)' }}>{candidate.scope === 'month_command_hidden_stem' ? '月令藏干' : '一般藏干'} · 表层：{candidate.surfaceMatches.map(item => item.label).join('；') || '无'}</p>
    <ConditionChecks checks={candidate.conditionChecks} />
  </div>;
}

function RootCandidateCard({ candidate }: { candidate: BaziRootCandidate }) {
  const label = candidate.status === 'exact_same_stem_root' ? '严格同干根候选' : candidate.status === 'same_element_support_only' ? '仅同五行支持' : '缺少藏干支持';
  return <div data-testid="root-candidate" className="rounded-lg border p-3" style={{ borderColor: candidate.status === 'exact_same_stem_root' ? 'var(--ac-bdr)' : 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-xs font-semibold"><span className="font-serif text-base" style={{ color: 'var(--ac-dim)' }}>{candidate.stem}</span> · {candidate.tenGod ?? '日主参照'}</p><p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{candidate.surfaceOccurrence.label}</p></div>
      <div className="flex flex-wrap gap-1"><span className="rounded-full px-2 py-1 text-[9px]" style={{ color: candidate.status === 'exact_same_stem_root' ? 'var(--lu)' : 'var(--tx-3)', background: 'var(--bg-1)' }}>{label}</span>{candidate.selfSeatExactRoot && <span className="rounded-full px-2 py-1 text-[9px]" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}>坐支同干</span>}</div>
    </div>
    <p className="mt-2 text-[9px] leading-4" style={{ color: 'var(--tx-2)' }}>完全同干：{candidate.exactRootMatches.map(item => item.label).join('；') || '无'}</p>
    <p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>同五行不同干：{candidate.sameElementSupportMatches.map(item => item.label).join('；') || '无'}</p>
    <ConditionChecks checks={candidate.conditionChecks} />
  </div>;
}

function ConditionChecks({ checks }: { checks: BaziTransparencyRootConditionCheck[] }) {
  return <div className="mt-2 flex flex-wrap gap-1">{checks.map(check => <span key={check.code} title={check.detail} className="rounded px-1.5 py-0.5 text-[8px]" style={{ color: check.state === 'met' ? 'var(--lu)' : 'var(--tx-3)', background: 'var(--bg-1)' }}>{check.state === 'met' ? '✓' : check.state === 'missing' ? '—' : '·'} {check.label}</span>)}</div>;
}

function BaziHiddenStemActivationPanel({ result, selectedYear }: { result: BaziHiddenStemActivationResult; selectedYear: number }) {
  const year = result.years.find(item => item.year === selectedYear) ?? result.years[0];
  if (!year) return null;
  return <section data-testid="bazi-hidden-stem-activation-audit" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><ShieldCheck size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-11 · 藏干引动条件证据</p>
          <h2 className="mt-1 text-lg font-semibold">{year.year} {year.annualGanZhi} · 岁运藏干触达审计</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>完全同干岁运表层、同支重复、明确冲合刑害分别回指；命中不等于已经发动。</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="rounded-full px-2 py-1" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{year.counts.touchedCandidates} 个位置有触达条件</span>
        <span className="rounded-full px-2 py-1" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}>{year.counts.multipleTouchConditions} 个多入口并见</span>
      </div>
    </div>
    <div className="mt-5 space-y-4">{year.segments.map(segment => <div key={segment.segmentIndex} className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-semibold">片段 {segment.segmentIndex} · {segment.label}</p><p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt ?? '起点未知'} — {segment.endAtExclusive ?? '终点未知'}</p></div>
        <p className="text-[9px]" style={{ color: 'var(--tx-3)' }}>同干 {segment.counts.exactSurfaceMatches} · 同支 {segment.counts.sameBranchRepeats} · 关系 {segment.counts.explicitBranchRelations}</p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{segment.candidates.map(candidate => <HiddenStemTouchCard key={candidate.id} candidate={candidate} />)}</div>
    </div>)}</div>
    <div className="mt-4 rounded-lg border px-3 py-2 text-[10px] leading-5" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)', background: 'var(--bg-1)' }}><Info className="mr-1 inline" size={13} />{result.boundary}</div>
  </section>;
}

function HiddenStemTouchCard({ candidate }: { candidate: BaziHiddenStemTouchCandidate }) {
  const statusLabel = candidate.status === 'multiple_touch_conditions'
    ? '多类触达并见'
    : candidate.status === 'single_touch_condition'
      ? '单类触达'
      : '未命中开放条件';
  return <div data-testid="hidden-stem-touch-candidate" className="rounded-lg border p-3" style={{ borderColor: candidate.status === 'no_touch_condition' ? 'var(--bdr)' : 'var(--ac-bdr)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-xs font-semibold"><span className="font-serif text-base" style={{ color: 'var(--ac-dim)' }}>{candidate.hiddenOccurrence.stem}</span> · {candidate.tenGod}</p><p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{candidate.hiddenOccurrence.label}</p></div>
      <div className="flex flex-wrap gap-1"><span className="rounded-full px-2 py-1 text-[9px]" style={{ color: candidate.status === 'no_touch_condition' ? 'var(--tx-3)' : 'var(--lu)', background: 'var(--bg-1)' }}>{statusLabel}</span>{candidate.scope === 'month_command_hidden_stem' && <span className="rounded-full px-2 py-1 text-[9px]" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}>月令藏干</span>}</div>
    </div>
    <div className="mt-3 space-y-1.5">{candidate.entries.map(entry => <div key={entry.type} className="rounded-lg px-2.5 py-2" style={{ background: 'var(--bg-1)' }}>
      <div className="flex items-center gap-1.5 text-[9px] font-medium" style={{ color: entry.state === 'matched' ? 'var(--lu)' : 'var(--tx-3)' }}><span>{entry.state === 'matched' ? '✓' : '—'}</span><span>{entry.label}</span></div>
      <p className="mt-1 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{entry.detail}</p>
      {entry.relationEvidence.map(evidence => <p key={evidence.sourceEvidenceId} className="mt-1 text-[8px]" style={{ color: 'var(--ac-dim)' }}>M9-7：{evidence.conditionStateLabel}</p>)}
    </div>)}</div>
    <p className="mt-2 text-[8px] leading-4" style={{ color: 'var(--tx-3)' }}>{candidate.boundary}</p>
  </div>;
}

function BaziStrengthCompositePanel({ result, selectedYear }: { result: BaziStrengthCompositeResult; selectedYear: number }) {
  const year = result.years.find(item => item.year === selectedYear) ?? result.years[0];
  if (!year) return null;
  return <section data-testid="bazi-strength-composite-audit" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><GitBranch size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-12 · 月令与旺衰综合条件</p>
          <h2 className="mt-1 text-lg font-semibold">{year.year} {year.annualGanZhi} · 静态与岁运证据矩阵</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>静态基线：{result.staticBaseline.label}。方向比较不等于身强身弱，也不折算数值分数。</p>
        </div>
      </div>
      <span className="rounded-full px-2.5 py-1 text-[9px]" style={{ color: 'var(--lu)', background: 'var(--bg-1)' }}>{year.comparisonLabels.join('／')}</span>
    </div>
    <div className="mt-5 space-y-4">{year.segments.map(segment => {
      const support = segment.evidence.filter(item => item.side === 'support');
      const drain = segment.evidence.filter(item => item.side === 'drain_or_control');
      const context = segment.evidence.filter(item => item.side === 'context');
      return <div key={segment.segmentIndex} className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold">片段 {segment.segmentIndex} · {segment.label}</p><p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.startAt ?? '起点未知'} — {segment.endAtExclusive ?? '终点未知'}</p></div>
          <div className="text-right"><p className="text-[10px] font-medium" style={{ color: 'var(--ac-dim)' }}>{segment.comparisonLabel}</p><p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>{segment.dynamicSurfaceDirectionLabel}</p></div>
        </div>
        <div className="mt-3 rounded-lg border px-3 py-2 text-[9px] leading-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <span style={{ color: 'var(--tx-3)' }}>月令 {segment.monthCommand.branch}（本气 {segment.monthCommand.mainQiStem}）：</span>
          <span style={{ color: segment.monthCommand.touchStatus === 'no_open_touch_condition' ? 'var(--tx-2)' : 'var(--ac-dim)' }}>{monthTouchStatusLabel(segment.monthCommand.touchStatus)}</span>
          {segment.monthCommand.relationConditionStates.length > 0 && <span style={{ color: 'var(--tx-3)' }}> · 关系状态 {segment.monthCommand.relationConditionStates.join('、')}</span>}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <StrengthEvidenceColumn title="生扶方向证据" items={support} tone="support" />
          <StrengthEvidenceColumn title="泄耗制方向证据" items={drain} tone="drain" />
          <StrengthEvidenceColumn title="条件与位置上下文" items={context} tone="context" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1">{segment.reviewFlags.map(flag => <span key={flag} className="rounded px-1.5 py-0.5 text-[8px]" style={{ color: 'var(--tx-3)', background: 'var(--bg-card)' }}>{strengthReviewFlagLabel(flag)}</span>)}</div>
      </div>;
    })}</div>
    <div className="mt-4 rounded-lg border px-3 py-2 text-[10px] leading-5" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)', background: 'var(--bg-1)' }}><Info className="mr-1 inline" size={13} />{result.boundary}</div>
  </section>;
}

function StrengthEvidenceColumn({ title, items, tone }: { title: string; items: BaziStrengthCompositeEvidence[]; tone: 'support' | 'drain' | 'context' }) {
  const color = tone === 'support' ? 'var(--lu)' : tone === 'drain' ? 'var(--ji)' : 'var(--ac-dim)';
  return <div className="rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold" style={{ color }}>{title}</p><span className="text-[8px]" style={{ color: 'var(--tx-3)' }}>{items.length} 条</span></div>
    <div className="mt-2 space-y-1.5">{items.length ? items.map(item => <div key={item.id} title={item.detail} className="rounded-lg px-2.5 py-2" style={{ background: 'var(--bg-1)' }}><p className="text-[9px] font-medium" style={{ color: 'var(--tx-2)' }}>{item.label}</p><p className="mt-1 text-[8px]" style={{ color: 'var(--tx-3)' }}>{item.familyLabel} · {item.sourceStage} · {strengthEvidenceStatusLabel(item.status)}</p></div>) : <p className="py-4 text-center text-[9px]" style={{ color: 'var(--tx-3)' }}>当前没有此类证据</p>}</div>
  </div>;
}

function monthTouchStatusLabel(status: string): string {
  return ({ multiple_touch_types: '多类触达条件并见', single_touch_type: '单类触达条件', no_open_touch_condition: '未命中已开放触达条件' } as Record<string, string>)[status] ?? status;
}

function strengthEvidenceStatusLabel(status: string): string {
  return ({ upstream_label: '上游原样标签', established: '已观察证据', position_only: '仅位置', condition_only: '仅条件' } as Record<string, string>)[status] ?? status;
}

function strengthReviewFlagLabel(flag: string): string {
  return ({
    unknown_time: '时柱未知', static_dynamic_direction_difference: '静态动态异向',
    static_baseline_mixed: '静态基线并见', dynamic_surface_mixed: '岁运表层并见',
    month_command_touch_present: '月令触达待复核', month_command_relation_state_unresolved: '月令关系状态未决',
    day_master_root_condition_present: '日主根气条件', dynamic_hidden_position_only: '岁运藏干仅位置／条件',
  } as Record<string, string>)[flag] ?? flag;
}

function BaziPatternConditionPanel({ result }: { result: BaziPatternConditionResult }) {
  return <section data-testid="bazi-pattern-condition-audit" className="mt-5 rounded-xl border p-5 md:p-6" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><ShieldCheck size={19} /></div>
        <div>
          <p className="text-[10px] tracking-[.18em]" style={{ color: 'var(--ac-dim)' }}>M9-13 · 格局条件证据审计</p>
          <h2 className="mt-1 text-lg font-semibold">成格支持 · 破格风险 · 救应候选</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>月令 {result.monthCommand.branch} · {result.monthCommand.candidateCount} 个候选 · M9-12 静态上下文：{result.strengthContext.label}</p>
        </div>
      </div>
      <span className="rounded-full px-2.5 py-1 text-[9px]" style={{ color: result.status === 'complete' ? 'var(--lu)' : 'var(--ji)', background: 'var(--bg-1)' }}>{result.status === 'complete' ? '四柱条件完整' : '时柱未知，缺项降级'}</span>
    </div>

    {result.candidates.length ? <div className="mt-5 space-y-4">{result.candidates.map(candidate => <PatternCandidateCard key={candidate.id} candidate={candidate} />)}</div> : <div className="mt-5 rounded-xl border border-dashed px-4 py-8 text-center text-xs" style={{ borderColor: 'var(--bdr-heavy)', color: 'var(--tx-3)' }}>M9-3 当前没有生成可审计的月令格局候选。</div>}

    <div className="mt-4 rounded-lg border px-3 py-2 text-[10px] leading-5" style={{ borderColor: 'var(--bdr)', color: 'var(--tx-3)', background: 'var(--bg-1)' }}><Info className="mr-1 inline" size={13} />{result.boundary}</div>
  </section>;
}

function PatternCandidateCard({ candidate }: { candidate: BaziPatternCandidateConditionAudit }) {
  return <article className="rounded-xl border p-4" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-1)' }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{candidate.label}</h3><span className="rounded px-1.5 py-0.5 text-[8px]" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}>{candidate.archetypeLabel}</span></div>
        <p className="mt-1 text-[9px]" style={{ color: 'var(--tx-3)' }}>来源 {candidate.sourceStem} · {patternQiLabel(candidate.sourceQi)} · {candidate.transparentAt.length ? `透于${candidate.transparentAt.join('、')}` : '未见表层同干'} · 上游 {patternUpstreamStatusLabel(candidate.upstreamStatus)}</p>
      </div>
      <div className="flex gap-1.5 text-[8px]"><span className="rounded px-1.5 py-1" style={{ color: 'var(--lu)', background: 'var(--bg-card)' }}>支持 {candidate.counts.formationEvidencePresent}</span><span className="rounded px-1.5 py-1" style={{ color: 'var(--ji)', background: 'var(--bg-card)' }}>风险 {candidate.counts.breakingRiskEvidencePresent}</span><span className="rounded px-1.5 py-1" style={{ color: 'var(--ac-dim)', background: 'var(--bg-card)' }}>救应 {candidate.counts.rescueEvidencePresent}</span></div>
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-3">
      <PatternConditionColumn title="成格支持条件" checks={candidate.formationSupport} tone="support" />
      <PatternConditionColumn title="破格风险条件" checks={candidate.breakingRisks} tone="risk" />
      <PatternConditionColumn title="救应候选" checks={candidate.rescueCandidates} tone="rescue" />
    </div>
    <div className="mt-3 flex flex-wrap gap-1">{candidate.reviewFlags.map(flag => <span key={flag} className="rounded px-1.5 py-0.5 text-[8px]" style={{ color: 'var(--tx-3)', background: 'var(--bg-card)' }}>{patternReviewFlagLabel(flag)}</span>)}</div>
    <p className="mt-2 text-[9px] leading-4" style={{ color: 'var(--tx-3)' }}>{candidate.boundary}</p>
  </article>;
}

function PatternConditionColumn({ title, checks, tone }: { title: string; checks: BaziPatternConditionCheck[]; tone: 'support' | 'risk' | 'rescue' }) {
  const color = tone === 'support' ? 'var(--lu)' : tone === 'risk' ? 'var(--ji)' : 'var(--ac-dim)';
  return <div className="rounded-lg border p-3" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
    <p className="text-[10px] font-semibold" style={{ color }}>{title}</p>
    <div className="mt-2 space-y-1.5">{checks.map(check => <div key={check.id} title={`${check.detail} ${check.boundary}`} className="rounded-lg px-2.5 py-2" style={{ background: 'var(--bg-1)' }}>
      <div className="flex items-start justify-between gap-2"><p className="text-[9px] font-medium" style={{ color: 'var(--tx-2)' }}>{check.label}</p><span className="shrink-0 text-[8px]" style={{ color: patternConditionStatusColor(check.status) }}>{check.statusLabel}</span></div>
      <p className="mt-1 text-[8px] leading-4" style={{ color: 'var(--tx-3)' }}>{check.evidence.map(item => item.label).join('；') || check.detail}</p>
    </div>)}</div>
  </div>;
}

function patternConditionStatusColor(status: string): string {
  if (status === 'evidence_present') return 'var(--lu)';
  if (status === 'requires_manual_review' || status === 'unknown_due_to_missing_time') return 'var(--ac-dim)';
  return 'var(--tx-3)';
}

function patternQiLabel(qi: string): string {
  return ({ main_qi: '月令本气', secondary_qi: '月令中气', residual_qi: '月令余气' } as Record<string, string>)[qi] ?? qi;
}

function patternUpstreamStatusLabel(status: string): string {
  return ({ supported_candidate: '有透出支持', candidate: '候选', review_required: '需要复核' } as Record<string, string>)[status] ?? status;
}

function patternReviewFlagLabel(flag: string): string {
  return ({
    unknown_time: '时柱未知', storage_month: '杂气月', multiple_month_candidates: '月令多候选',
    upstream_candidate_review_required: '上游候选待复核', month_branch_interaction: '月支参与结构关系',
    strength_context_not_final: '身用承载未定', hidden_role_not_surface: '仅藏未透',
    combination_effect_unresolved: '五合效果未决', yang_blade_variant: '阳刃路径',
    metal_water_hurting_officer_exception_pending: '金水伤官例外待校',
  } as Record<string, string>)[flag] ?? flag;
}

function relationText(relation: string): string {
  return ({ peer: '同类比劫', resource: '印星生助', output: '食伤泄气', wealth: '财星耗身', officer: '官杀制身' })[relation] ?? relation;
}

function PillarCard({ pillar, isDay }: { pillar: BaziPillar; isDay: boolean }) {
  return <article className="rounded-xl border p-4 text-center" style={{ borderColor: isDay ? 'var(--ac-bdr)' : 'var(--bdr)', background: isDay ? 'var(--ac-bg)' : 'var(--bg-1)' }}>
    <p className="text-xs" style={{ color: 'var(--tx-3)' }}>{pillar.label}{isDay ? ' · 日主' : ''}</p>
    <div className="my-4 flex justify-center gap-2 text-3xl font-semibold tracking-wider">
      <span style={{ color: ELEMENT_COLORS[pillar.stemElement] }}>{pillar.stem}</span>
      <span style={{ color: ELEMENT_COLORS[pillar.branchElement] }}>{pillar.branch}</span>
    </div>
    <p className="text-xs">{pillar.stemTenGod} · {pillar.growthStage}</p>
    <div className="my-3 border-t" style={{ borderColor: 'var(--bdr)' }} />
    <p className="text-[11px]" style={{ color: 'var(--tx-3)' }}>藏干</p>
    <div className="mt-1 flex flex-wrap justify-center gap-1.5">
      {pillar.hiddenStems.map(hidden => <span key={hidden.stem} className="rounded px-1.5 py-1 text-[11px]" style={{ color: ELEMENT_COLORS[hidden.element], background: 'var(--bg-card)' }}>{hidden.stem} · {hidden.tenGod}</span>)}
    </div>
    <p className="mt-3 text-[10px]" style={{ color: 'var(--tx-3)' }}>纳音 {pillar.naYin} · 空亡 {pillar.xunKong}</p>
  </article>;
}

function UnknownPillar() {
  return <article className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center" style={{ borderColor: 'var(--bdr-heavy)', background: 'var(--bg-1)' }}><Clock size={24} style={{ color: 'var(--tx-3)' }} /><p className="mt-3 text-sm">时柱未知</p><p className="mt-1 text-xs" style={{ color: 'var(--tx-3)' }}>补充出生时刻后计算</p></article>;
}

function EmptyState() {
  return <div className="flex min-h-[560px] items-center justify-center rounded-xl border border-dashed p-8 text-center" style={{ borderColor: 'var(--bdr-heavy)', background: 'var(--bg-card)' }}><div><Sparkle className="mx-auto" size={36} style={{ color: 'var(--ac)' }} /><h2 className="mt-4 text-lg font-semibold">先填写出生信息</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: 'var(--tx-3)' }}>生成结果会清楚展示四柱、藏干、十神、五行结构，以及本次实际使用的历法和时间规则。</p></div></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span>{label}</span>{hint && <span style={{ color: 'var(--tx-3)' }}>{hint}</span>}</span>{children}</label>;
}

function formatMinutes(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} 分钟`;
}

async function fetchProfile(id: string): Promise<BaziBirthProfileDetail> {
  const response = await fetch(`/api/bazi/profiles/${id}`, { cache: 'no-store' });
  const data = await response.json() as { profile?: BaziBirthProfileDetail; error?: string };
  if (!response.ok || !data.profile) throw new Error(data.error || '出生档案读取失败');
  return data.profile;
}

function formatChartPillars(result: BaziCalculationResult): string {
  return [result.pillars.year, result.pillars.month, result.pillars.day, result.pillars.time]
    .filter((pillar): pillar is BaziPillar => pillar !== null)
    .map(pillar => pillar.ganZhi)
    .join(' ');
}

function formatSavedTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));
}
