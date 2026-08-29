'use client';

import {
  ArrowLeft,
  CalendarDots,
  Clock,
  Database,
  FloppyDisk,
  FolderOpen,
  GitBranch,
  Info,
  Plus,
  Sparkle,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BaziBirthProfileDetail,
  BaziBirthProfileListItem,
  BaziCalculationResult,
  BaziChartVersion,
  BaziElement,
  BaziPillar,
} from '@/lib/bazi/types';

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
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

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
    if (!window.confirm('确定删除这个排盘版本吗？出生档案和其他版本会保留。')) return;
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
    if (!window.confirm(`确定删除出生档案“${profile.displayName}”吗？其中的全部八字版本也会删除。`)) return;
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

  return (
    <main className="min-h-[100dvh]" style={{ background: 'var(--bg-0)', color: 'var(--tx-1)' }}>
      <header className="border-b" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 md:px-6">
          <button type="button" className="btn-ghost !px-4 !py-2" onClick={() => router.push('/')}>
            <ArrowLeft size={16} weight="bold" /> 返回首页
          </button>
          <div className="text-right">
            <h1 className="text-lg font-semibold tracking-wide">八字确定性排盘</h1>
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>M9-1 · 出生档案与多版本排盘</p>
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
            onSave={saveCurrent}
          />}
          {selectedProfile && selectedProfile.charts.length > 0 && <ChartVersionPanel
            profile={selectedProfile}
            currentChartId={currentChartId}
            busyId={busyId}
            onOpen={openChart}
            onDelete={deleteChart}
          />}
          {!result ? <EmptyState /> : <BaziResult result={result} />}
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
  selectedProfile, currentChartId, saving, onSave,
}: {
  selectedProfile: BaziBirthProfileDetail | null;
  currentChartId: string | null;
  saving: boolean;
  onSave: () => Promise<void>;
}) {
  const saved = Boolean(currentChartId);
  return <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{ borderColor: saved ? 'rgba(45,122,74,.3)' : 'var(--t-border-acc)', background: 'var(--bg-card)' }}>
    <div className="flex items-start gap-3">
      <div className="rounded-lg p-2" style={{ color: saved ? 'var(--lu)' : 'var(--ac-dim)', background: 'var(--bg-1)' }}>{saved ? <FolderOpen size={18} /> : <FloppyDisk size={18} />}</div>
      <div><p className="text-sm font-medium">{saved ? '当前版本已保存在本地' : selectedProfile ? `保存为“${selectedProfile.displayName}”的新版本` : '把当前结果保存为出生档案'}</p><p className="mt-1 text-xs" style={{ color: 'var(--tx-3)' }}>{saved ? '可从左侧历史重新打开，并保留实际计算口径。' : '相同档案与相同规则会自动复用已有版本。'}</p></div>
    </div>
    <button type="button" disabled={saving || saved} onClick={() => void onSave()} className="btn-accent !px-5 !py-2.5 disabled:cursor-default disabled:opacity-55"><FloppyDisk size={15} /> {saving ? '正在保存…' : saved ? '已保存' : '保存当前排盘'}</button>
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
      <p className="text-xs leading-5" style={{ color: 'var(--tx-3)' }}>当前为 M9-1 可持久化基础盘：排盘事实和规则版本可保存在本地。旺衰、格局、用神、大运和流年尚未开放，后续会在规则来源与校验样例完成后分阶段加入。</p>
    </section>
  </div>;
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
