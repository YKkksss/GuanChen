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
  useEffect(() => {
    if (!annualTimeline) return;
    setSelectedAnnualYear(value => Math.min(Math.max(value, annualTimeline.range.startYear), annualTimeline.range.endYear));
  }, [annualTimeline]);

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
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>M9-8 · 动态十神与作用方向证据审计</p>
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
            {relationAudit && <BaziRelationAuditPanel result={relationAudit} selectedYear={selectedAnnualYear} />}
            {relationAdjudication && <BaziRelationAdjudicationPanel result={relationAdjudication} selectedYear={selectedAnnualYear} />}
            {dynamicTenGod && <BaziDynamicTenGodPanel result={dynamicTenGod} selectedYear={selectedAnnualYear} />}
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
      <p className="text-xs leading-5" style={{ color: 'var(--tx-3)' }}>当前已开放至 M9-8：除跨层关系和条件冲突外，还可查看大运、流年的表层／藏干十神，以及有上游证据的原局柱位指向。藏干引动、合化、关系优先级、强弱作用、吉凶和具体事件仍未开放。</p>
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
    annual_to_luck: '流年—大运', multi_layer: '三层共同',
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
