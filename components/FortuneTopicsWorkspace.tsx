'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AiMarkdown from './AiMarkdown';
import { BRANCHES } from '@/lib/ziwei/constants';
import { FORTUNE_SECTIONS, FORTUNE_TOPICS, type FortuneDetail, type FortuneFacts, type FortuneOptions, type FortunePeriod, type FortuneStage, type FortuneTopic } from '@/lib/fortune-topics/types';
import styles from './FortuneTopicsWorkspace.module.css';
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  let data: T & { error?: string };
  try { data = await response.json(); } catch { throw new Error('服务没有返回有效数据，请稍后重试'); }
  if (!response.ok) throw new Error(data.error || '专题加载失败，请稍后重试');
  return data;
}
function StageFacts({ stage, name, topic }: { stage: FortuneStage; name: string; topic: FortuneTopic }) {
  const s = stage.snapshot, flow = s.level === 'year' ? s.flowYear : s.flowMonth;
  return <article className={styles.stage}>
    <div className={styles.stageHeading}><span>阶段 {name}</span><h3>{stage.period.label}</h3></div>
    <p className={styles.range}>{stage.period.startDate} 至 {stage.period.endDate}</p>
    <dl><div><dt>所在大限</dt><dd>{s.decadal.periodKind === 'childhood' ? '童限 · 尚未进入首个大限' : s.decadal.periodKind === 'unavailable' ? '超出已排大限' : `${s.decadal.startAge}–${s.decadal.endAge} 岁 · 本命${s.decadal.nativePalaceName}`}</dd></div>
      <div><dt>{s.level === 'year' ? '流年' : '流月'}命宫</dt><dd>本命{flow.nativePalaceName}（{BRANCHES[flow.palaceBranch]}）</dd></div>
      <div><dt>流年干支</dt><dd>{s.year.ganZhi} · {s.nominalAge} 虚岁</dd></div>
      {s.level === 'month' && <div><dt>流月干支</dt><dd>{s.flowMonth.ganZhi}</dd></div>}
      <div><dt>{s.level === 'year' ? '流年' : '流月'}四化</dt><dd>{s.transformations.map(t => `${t.starName}化${t.type} · 本命${t.natalPalaceName ?? '未定位宫位'}`).join('；')}</dd></div>
      {FORTUNE_TOPICS[topic].palaces.map(palace => { const m = s.palaceMappings.find(m => m.transitPalaceName.replace(/宫$/, '') === palace.replace(/宫$/, '')); return m ? <div key={palace}><dt>{palace}</dt><dd>落本命{m.nativePalaceName}（{BRANCHES[m.branch]}）</dd></div> : null; })}</dl>
    <p className={styles.note}>代表日 {s.representativeDate}。{s.level === 'month' ? '流月以农历初一定位，不代表每天情况相同。' : '代表日用于定位年度结构，不代表全年每天情况相同。'}</p>
    {(stage.period.startDate !== stage.period.fullStartDate || stage.period.endDate !== stage.period.fullEndDate) && <p className={styles.note}>已按出生日期与运限上界截取可分析范围。</p>}
  </article>;
}
export default function FortuneTopicsWorkspace({ conversationId, initialTopic, initialPeriod = '', initialCompare = '' }: { conversationId: string; initialTopic: FortuneTopic; initialPeriod?: string; initialCompare?: string }) {
  const [topic, setTopic] = useState(initialTopic), [level, setLevel] = useState<'year' | 'month'>(initialPeriod.startsWith('month:') ? 'month' : 'year');
  const [compare, setCompare] = useState(Boolean(initialCompare)), [yearA, setYearA] = useState(Number(initialPeriod.slice(initialPeriod.indexOf(':') + 1, initialPeriod.indexOf(':') + 5)) || 0), [yearB, setYearB] = useState(Number(initialCompare.slice(initialCompare.indexOf(':') + 1, initialCompare.indexOf(':') + 5)) || 0);
  const [monthA, setMonthA] = useState(initialPeriod.startsWith('month:') ? initialPeriod : ''), [monthB, setMonthB] = useState(initialCompare.startsWith('month:') ? initialCompare : '');
  const [options, setOptions] = useState<FortuneOptions | null>(null), [periodsA, setPeriodsA] = useState<FortunePeriod[]>([]), [periodsB, setPeriodsB] = useState<FortunePeriod[]>([]);
  const [facts, setFacts] = useState<FortuneFacts | null>(null), [detail, setDetail] = useState<FortuneDetail | null>(null), [versionId, setVersionId] = useState('');
  const [error, setError] = useState(''), [previewError, setPreviewError] = useState(''), [generationError, setGenerationError] = useState('');
  const [loading, setLoading] = useState(true), [periodsLoading, setPeriodsLoading] = useState(false), [previewLoading, setPreviewLoading] = useState(false), [generating, setGenerating] = useState(''), [refresh, setRefresh] = useState(0);
  const selectionRef = useRef(''), initialized = useRef(false), generationRef = useRef<AbortController | null>(null);
  const endpoint = `/api/conversations/${encodeURIComponent(conversationId)}/fortune-topics`;
  const monthKeysA = periodsA.filter(p => p.level === 'month'), monthKeysB = periodsB.filter(p => p.level === 'month');
  const a = level === 'year' ? `year:${yearA}` : monthKeysA.find(p => p.key === monthA)?.key ?? monthKeysA[0]?.key ?? '';
  const b = !compare ? '' : level === 'year' ? `year:${yearB}` : monthKeysB.find(p => p.key === monthB)?.key ?? monthKeysB.find(p => p.key !== a)?.key ?? monthKeysB[0]?.key ?? '';
  const key = `${topic}|${a}|${b}`;
  selectionRef.current = key;
  const valid = Boolean(yearA && a && (!compare || (b && b !== a)));
  useEffect(() => {
    const controller = new AbortController(); setError('');
    void json<{ options: FortuneOptions }>(endpoint, { signal: controller.signal }).then(({ options: next }) => {
      if (controller.signal.aborted) return;
      setOptions(next);
      if (!initialized.current) { initialized.current = true; setYearA(current => next.years.includes(current) ? current : next.year); setYearB(current => next.years.includes(current) ? current : next.years.includes(next.year + 1) ? next.year + 1 : next.years.find(year => year !== next.year) ?? next.year); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, refresh, key]);
  useEffect(() => {
    if (!yearA || !yearB) return;
    const controller = new AbortController(); setPeriodsLoading(true); setPeriodsA([]); setPeriodsB([]); setPreviewError('');
    void Promise.all([json<{ options: FortuneOptions }>(`${endpoint}?year=${yearA}`, { signal: controller.signal }), json<{ options: FortuneOptions }>(`${endpoint}?year=${yearB}`, { signal: controller.signal })]).then(([pa, pb]) => {
      if (!controller.signal.aborted) { setPeriodsA(pa.options.periods); setPeriodsB(pb.options.periods); }
    }).catch(e => { if (!controller.signal.aborted) setPreviewError(e.message); }).finally(() => { if (!controller.signal.aborted) setPeriodsLoading(false); });
    return () => controller.abort();
  }, [endpoint, yearA, yearB, refresh]);
  useEffect(() => {
    generationRef.current?.abort(); setGenerating(''); setGenerationError(''); setVersionId(''); setDetail(null); setFacts(null);
  }, [key]);
  useEffect(() => {
    if (!valid || periodsLoading || !periodsA.length || (compare && !periodsB.length)) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    setPreviewLoading(true); setPreviewError('');
    const load = async () => {
      try {
        const data = await json<{ facts: FortuneFacts; detail: FortuneDetail | null }>(`${endpoint}?${new URLSearchParams({ topic, period: a, compare: b })}`, { signal: controller.signal });
        if (controller.signal.aborted || selectionRef.current !== key) return;
        setFacts(data.facts); setDetail(data.detail);
        if (data.detail?.versions.some(v => v.status === 'generating')) timer = setTimeout(() => void load(), 2500);
      } catch (e) { if (!controller.signal.aborted) setPreviewError(e instanceof Error ? e.message : '阶段加载失败'); }
      finally { if (!controller.signal.aborted) setPreviewLoading(false); }
    };
    void load();
    const url = new URL(window.location.href); url.search = new URLSearchParams({ topic, period: a, ...(b ? { compare: b } : {}) }).toString(); window.history.replaceState(window.history.state, '', url);
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [endpoint, key, topic, a, b, valid, periodsLoading, periodsA, periodsB, compare, refresh]);
  useEffect(() => () => generationRef.current?.abort(), []);
  const active = detail?.versions.find(v => v.id === (versionId || detail.report.activeVersionId));
  const pending = generating === key || detail?.versions.some(v => v.status === 'generating');
  const latestFailed = detail?.versions[0]?.status === 'failed';
  const generate = async (regenerate: boolean) => {
    if (!valid || !facts || pending) return;
    const captured = key, controller = new AbortController(); generationRef.current = controller;
    setGenerating(captured); setGenerationError('');
    try {
      const data = await json<{ detail: FortuneDetail }>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, period: a, compare: b, regenerate }), signal: controller.signal });
      if (!controller.signal.aborted && selectionRef.current === captured) { setDetail(data.detail); setVersionId(''); setRefresh(v => v + 1); }
    } catch (e) { if (!controller.signal.aborted && selectionRef.current === captured) { setGenerationError(e instanceof Error ? e.message : '专题生成失败'); setRefresh(v => v + 1); } }
    finally { if (!controller.signal.aborted && selectionRef.current === captured) setGenerating(''); }
  };
  const openHistory = (report: FortuneOptions['history'][number]) => {
    setTopic(report.topic); setLevel(report.periodKey.startsWith('month:') ? 'month' : 'year'); setYearA(Number(report.periodKey.split(':')[1].slice(0, 4))); setMonthA(report.periodKey); setCompare(Boolean(report.comparisonKey));
    if (report.comparisonKey) { setYearB(Number(report.comparisonKey.split(':')[1].slice(0, 4))); setMonthB(report.comparisonKey); }
    setVersionId(''); setRefresh(v => v + 1);
  };
  const periodSelect = (name: 'A' | 'B') => {
    const y = name === 'A' ? yearA : yearB, months = name === 'A' ? monthKeysA : monthKeysB, selected = name === 'A' ? a : b;
    return <div className={styles.periodChoice}><strong>阶段 {name}</strong><label>农历年份<select aria-label={`阶段 ${name} 农历年份`} value={y} onChange={e => name === 'A' ? (setYearA(Number(e.target.value)), setMonthA('')) : (setYearB(Number(e.target.value)), setMonthB(''))}>{options?.years.map(year => <option key={year} value={year}>{year} 年</option>)}</select></label>
      {level === 'month' && <label>农历月份<select aria-label={`阶段 ${name} 农历月份`} value={selected} disabled={periodsLoading} onChange={e => name === 'A' ? setMonthA(e.target.value) : setMonthB(e.target.value)}>{months.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>}</div>;
  };
  return <main className={styles.workspace}>
    <header className={styles.header}><div><p className={styles.eyebrow}>紫微斗数 · 流年与流月</p><h1>紫微运势专题</h1><p>{options?.title ?? '选择阶段，观察变化'}</p></div><div className={styles.links}><Link href={`/chart/${conversationId}`}>返回命盘</Link><Link href={`/chart/${conversationId}/calendar`}>运势日历</Link></div></header>
    {loading ? <p role="status">正在加载专题工作台…</p> : error ? <div role="alert" className={styles.error}>{error}<button onClick={() => setRefresh(v => v + 1)}>重新加载</button></div> : <>
      <section className={styles.controls} aria-label="专题条件">
        <div className={styles.controlRow}><div role="group" aria-label="专题主题" className={styles.segment}>{Object.entries(FORTUNE_TOPICS).map(([k, t]) => <button key={k} aria-pressed={topic === k} onClick={() => setTopic(k as FortuneTopic)}>{t.label}</button>)}</div>
          <div role="group" aria-label="阶段粒度" className={styles.segment}><button aria-pressed={level === 'year'} onClick={() => setLevel('year')}>年度专题</button><button aria-pressed={level === 'month'} onClick={() => setLevel('month')}>月度专题</button></div>
          <label className={styles.checkbox}><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} />对比两个阶段</label></div>
        <div className={styles.periodRow}>{periodSelect('A')}{compare && periodSelect('B')}</div>
        <p className={styles.note}>年度按春节至下一个春节前定位；月份按农历初一切换，保留闰月。{compare ? '两个阶段保持 A / B 顺序，支持同粒度对比。' : '可开启对比，查看两个年份或两个月份的延续与变化。'}</p>
      </section>
      {!valid && <p role="alert" className={styles.error}>请选择两个不同的阶段进行对比。</p>}
      {previewError && <div role="alert" className={styles.error}>{previewError}<button onClick={() => setRefresh(v => v + 1)}>重新加载阶段</button></div>}
      {periodsLoading || previewLoading ? <p role="status">正在核对阶段与宫位依据…</p> : facts && valid && <>
        {facts.unknownTime && <p className={styles.caution}>出生时辰未知，当前按子时试排；以下解释需要降低确定性。</p>}
        <div className={styles.stages}><StageFacts stage={facts.a} name="A" topic={topic} />{facts.b && <StageFacts stage={facts.b} name="B" topic={topic} />}</div>
        {facts.b && <details className={styles.evidence}><summary>查看程序核对的阶段变化（{facts.changes.length} 项）</summary><ul>{facts.changes.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
        <section className={styles.report} aria-label="专题解读">
          <div className={styles.reportHeading}><div><h2>{FORTUNE_TOPICS[topic].label}{compare ? ' · 阶段对比' : ' · 阶段分析'}</h2><p className={styles.note}>手动生成后自动保存，回看不会再次调用 AI。</p></div><button className={styles.primary} disabled={Boolean(pending)} onClick={() => void generate(Boolean(detail?.report.activeVersionId))}>{pending ? '正在生成…' : latestFailed ? '重试生成' : active ? '重新生成并保留旧版' : '生成专题解读'}</button></div>
          {generationError && <p role="alert" className={styles.error}>{generationError}</p>}
          {latestFailed && !generationError && <p role="status" className={styles.caution}>最近一次生成未完成，可以重试。已保存版本仍可查看。</p>}
          {pending && <p role="status" className={styles.note}>正在分析所选阶段，请稍候；切换条件后仍可从历史报告检查生成状态。</p>}
          {detail?.versions.some(v => v.status === 'completed') && <label className={styles.version}>已保存版本<select aria-label="报告版本" value={active?.id ?? ''} onChange={e => setVersionId(e.target.value)}>{detail.versions.filter(v => v.status === 'completed').map(v => <option key={v.id} value={v.id}>第 {v.version} 版 · {new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(v.updatedAt)}</option>)}</select></label>}
          {active?.content ? <div className={styles.content}><p className={styles.summary}>{active.content.summary}</p>{active.content.sections.map(s => <article key={s.key}><h3>{FORTUNE_SECTIONS[s.key]}</h3><AiMarkdown text={s.content} /><details className={styles.evidence}><summary>查看本节依据（{s.evidenceIds.length} 条）</summary><dl>{s.evidenceIds.map(id => { const e = active.facts.evidence.find(item => item.id === id); return e ? <div key={id}><dt>{e.label}</dt><dd>{e.details}</dd></div> : null; })}</dl></details></article>)}</div> : <p className={styles.empty}>当前条件还没有已完成的解读。先查看阶段事实，再生成专题报告。</p>}
          <p className={styles.disclaimer}>命理内容仅作传统文化学习与自我观察参考。实际决定仍需结合现实信息，不作为医疗、法律或投资依据。</p>
        </section>
        <details className={styles.evidence}><summary>查看所选阶段的全部依据（{facts.evidence.length} 条）</summary><dl>{facts.evidence.map(e => <div key={e.id}><dt>{e.label}</dt><dd>{e.details}</dd></div>)}</dl></details>
      </>}
      <section className={styles.history} aria-label="历史专题报告"><h2>已保存的专题</h2><p className={styles.note}>最近 50 份，按生成更新时间排列。</p>{options?.history.length ? <ul>{options.history.map(r => <li key={r.id}><button onClick={() => openHistory(r)}><span><strong>{r.title}</strong><small>{r.summary ?? '尚无已完成版本'}</small></span><span>{r.status === 'generating' ? '生成中' : r.status === 'failed' ? '可重试' : '已保存'} · {r.versionCount} 版</span></button></li>)}</ul> : <p className={styles.empty}>生成第一份专题后，会在这里保存。</p>}</section>
    </>}
  </main>;
}
