'use client';

import { ArrowLeft, CalendarDots, Clock, Info, Sparkle, Warning } from '@phosphor-icons/react';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BaziCalculationResult, BaziElement, BaziPillar } from '@/lib/bazi/types';

interface FormState {
  birthDate: string;
  birthTime: string;
  gender: 'male' | 'female';
  timeStandard: 'civil_time' | 'apparent_solar_time';
  timeZoneId: string;
  longitude: string;
  lateZiPolicy: 'same_day' | 'next_day';
  unknownTime: boolean;
}

const INITIAL_FORM: FormState = {
  birthDate: '1990-01-01',
  birthTime: '12:00',
  gender: 'male',
  timeStandard: 'civil_time',
  timeZoneId: 'Asia/Shanghai',
  longitude: '116.4074',
  lateZiPolicy: 'same_day',
  unknownTime: false,
};

const ELEMENT_COLORS: Record<BaziElement, string> = {
  木: '#2f855a', 火: '#c05640', 土: '#a87832', 金: '#8a7a45', 水: '#3f6d99',
};

export default function BaziWorkspace() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [result, setResult] = useState<BaziCalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
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
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '排盘失败');
    } finally {
      setLoading(false);
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
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>M9-0 · 四柱、藏干、十神与五行结构</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 md:px-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="h-fit rounded-xl border p-5 xl:sticky xl:top-6" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-lg p-2" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}><CalendarDots size={20} /></div>
            <div>
              <h2 className="font-semibold">出生信息</h2>
              <p className="mt-1 text-xs leading-5" style={{ color: 'var(--tx-3)' }}>规则选项会随结果一起返回，不做隐藏换算。</p>
            </div>
          </div>

          <form className="bazi-form space-y-4" onSubmit={submit}>
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

        <section className="min-w-0">
          {!result ? <EmptyState /> : <BaziResult result={result} />}
        </section>
      </div>
    </main>
  );
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
      <p className="text-xs leading-5" style={{ color: 'var(--tx-3)' }}>当前为 M9-0 基础盘：结果来自确定性历法引擎。旺衰、格局、用神、大运和流年尚未开放，后续会在规则来源与校验样例完成后分阶段加入。</p>
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
