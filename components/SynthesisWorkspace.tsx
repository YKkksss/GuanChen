'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AiMarkdown from './AiMarkdown';
import { SYNTHESIS_TOPICS, SYNTHESIS_SECTIONS, type SynthesisDetail, type SynthesisEvidence, type SynthesisTopic } from '@/lib/synthesis/types';
import styles from './SynthesisWorkspace.module.css';
import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import SynthesisDynamicWorkspace from './SynthesisDynamicWorkspace';
async function json<T>(url: string, init?: RequestInit): Promise<T> { const r = await fetch(url, { cache: 'no-store', ...init }); let v: T & { error?: string }; try { v = await r.json(); } catch { throw new Error('服务没有返回有效数据，请稍后重试'); } if (!r.ok) throw new Error(v.error || '操作失败，请稍后重试'); return v; }
function Evidence({ items, label = '查看依据' }: { items: SynthesisEvidence[]; label?: string }) { return <details className={styles.evidence}><summary>{label}（{items.length} 条）</summary><dl>{items.map(e => <div key={e.id}><dt>{e.system === 'ziwei' ? '紫微' : e.system === 'bazi' ? '八字' : '共同口径'} · {e.label}</dt><dd>{e.details}{e.sourceUrl && <><br /><a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">查看原典来源</a></>}</dd></div>)}</dl></details>; }
export default function SynthesisWorkspace({ id, initialTopic = 'overview' }: { id: string; initialTopic?: SynthesisTopic }) {
  const [mode, setMode] = useState<'natal' | 'dynamic'>('natal');
  return <><div className={styles.workspace} style={{ paddingBottom: 0 }}><div role="group" aria-label="合参阶段模式" className={styles.views} style={{ margin: 0 }}><button aria-pressed={mode === 'natal'} onClick={() => setMode('natal')}>本命合参</button><button aria-pressed={mode === 'dynamic'} onClick={() => setMode('dynamic')}>动态阶段</button></div></div>{mode === 'natal' ? <NatalSynthesisWorkspace id={id} initialTopic={initialTopic} /> : <SynthesisDynamicWorkspace id={id} initialTopic={initialTopic} />}</>;
}
function NatalSynthesisWorkspace({ id, initialTopic = 'overview' }: { id: string; initialTopic?: SynthesisTopic }) {
  const [topic, setTopic] = useState(initialTopic), [view, setView] = useState<'facts' | 'report'>('facts'), [detail, setDetail] = useState<SynthesisDetail | null>(null), [versionId, setVersionId] = useState('');
  const [loading, setLoading] = useState(true), [generating, setGenerating] = useState(false), [error, setError] = useState(''), [generationError, setGenerationError] = useState(''), [refresh, setRefresh] = useState(0);
  const generation = useRef<AbortController | null>(null), selection = useRef(topic);
  const endpoint = `/api/synthesis/${encodeURIComponent(id)}`;
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => { try { const p = await json<{ detail: SynthesisDetail }>(`${endpoint}?topic=${topic}`, { signal: controller.signal }); if (controller.signal.aborted || selection.current !== topic) return; setDetail(p.detail); if (p.detail.versions.some(v => v.status === 'generating')) timer = setTimeout(() => void load(), 2500); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '合参加载失败'); } finally { if (!controller.signal.aborted) setLoading(false); } };
    void load(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [endpoint, topic, refresh]);
  useEffect(() => () => generation.current?.abort(), []);
  const selectTopic = (next: SynthesisTopic) => { if (next === topic) return; selection.current = next; generation.current?.abort(); setGenerating(false); setLoading(true); setDetail(null); setError(''); setGenerationError(''); setVersionId(''); setTopic(next); };
  const pending = generating || detail?.versions.some(v => v.status === 'generating'), active = detail?.versions.find(v => v.id === (versionId || detail.activeVersionId));
  const generate = async () => { if (pending) return; const controller = new AbortController(), selected = topic; generation.current = controller; setGenerating(true); setGenerationError('');
    try { const p = await json<{ detail: SynthesisDetail }>(`${endpoint}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: selected, regenerate: Boolean(detail?.activeVersionId) }), signal: controller.signal }); if (!controller.signal.aborted && selection.current === selected) { setDetail(p.detail); setVersionId(''); setRefresh(v => v + 1); } }
    catch (e) { if (!controller.signal.aborted && selection.current === selected) { setGenerationError(e instanceof Error ? e.message : '生成失败'); setRefresh(v => v + 1); } }
    finally { if (!controller.signal.aborted && selection.current === selected) setGenerating(false); }
  };
  const f = detail?.facts;
  return <main className={styles.workspace}>
    <header className={styles.header}><div><p className={styles.eyebrow}>紫微与八字 · 本命合参</p><h1>{detail?.session.title ?? '紫微与八字合参'}</h1><p className={styles.note}>同一主题分别观察，保留差异与待核条件。</p></div><Link href="/synthesis">返回合参中心</Link></header>
    <div role="group" aria-label="合参主题" className={styles.topics}>{(Object.keys(SYNTHESIS_TOPICS) as SynthesisTopic[]).map(k => <button key={k} aria-pressed={topic === k} onClick={() => selectTopic(k)}>{SYNTHESIS_TOPICS[k].label}</button>)}</div>
    {error && <div role="alert" className={styles.error}>{error}<button onClick={() => { setError(''); setRefresh(v => v + 1); }}>重新加载</button></div>}
    {loading ? <p role="status">正在整理双盘依据…</p> : f && detail && <>
      <details className={styles.evidence}><summary>核对出生资料与时间口径</summary><p>原始标准时：{detail.session.input.birthDate} {detail.session.input.unknownTime ? '时间未知' : detail.session.input.birthTime} · {f.policy.timezoneLabel}</p><p>校正后：{f.policy.effectiveDate} {f.policy.unknownTime ? '时间未知' : f.policy.effectiveTime} · {f.policy.timeStandard === 'civil_time' ? '北京时间标准时' : '真太阳时'}</p><p>紫微排盘日期：{f.policy.ziweiDate} · {f.policy.ziweiTimeLabel}；晚子时：{detail.session.input.lateZiPolicy === 'next_day' ? '23 点起按次日' : '23 点仍按当日'}{f.policy.lateZiRollover ? '（本盘已换日）' : ''}</p><ul>{f.policy.warnings.map((w,i) => <li key={i}>{w}</li>)}</ul></details>
      {f.policy.unknownTime && <p className={styles.caution}>出生时间未知：紫微仅为子时试排，八字不补时柱。两套结构都需要降低确定性，不能据此确定命宫或最终喜忌。</p>}
      <div role="group" aria-label="合参视图" className={styles.views}><button aria-pressed={view === 'facts'} onClick={() => setView('facts')}>双盘依据</button><button aria-pressed={view === 'report'} onClick={() => setView('report')}>AI 合参解读</button></div>
      {view === 'facts' && <div className={styles.grid}>
        <section className={styles.card}><p className={styles.eyebrow}>01 · 紫微视角</p><h2>{SYNTHESIS_TOPICS[topic].label}相关宫位与三方四正</h2><p>命宫 {BRANCHES[f.ziwei.mingGongBranch]} · 身宫 {BRANCHES[f.ziwei.shenGongBranch]} · {f.ziwei.wuxingJuName}</p><p className={styles.note}>紫微年标签：{STEMS[f.ziwei.lunarInfo.yearStem]}{BRANCHES[f.ziwei.lunarInfo.yearBranch]}（农历）。</p><ul>{f.evidence.filter(e => e.id.startsWith('ziwei:topic:')).map(e => <li key={e.id}><strong>{e.label}</strong><p>{e.details}</p></li>)}</ul><Evidence items={f.evidence.filter(e => e.system === 'ziwei')} label="查看紫微原始依据" /><div className={styles.actions}><Link href={`/chart/${detail.session.conversationId}`}>打开完整紫微命盘</Link></div></section>
        <section className={styles.card}><p className={styles.eyebrow}>02 · 八字视角</p><h2>十神、旺衰与调候条件</h2><div className={styles.pillars}>{Object.values(f.bazi.chart.pillars).map((p,i) => <div key={i}><small>{p?.label ?? '时柱'}</small><strong>{p?.ganZhi ?? '未知'}</strong></div>)}</div><p>{f.bazi.chart.dayMaster.stem}{f.bazi.chart.dayMaster.element}日主 · {f.bazi.interpretation.strength.label}</p><p>{f.bazi.climate.rule.label}</p><p className={styles.note}>八字年月按立春和节界；取用保留不同方法的候选条件。</p><Evidence items={f.evidence.filter(e => e.system === 'bazi')} label="查看八字原始依据" /><div className={styles.actions}><Link href={`/bazi/reading/${detail.session.baziChartId}`}>打开完整八字论命</Link></div></section>
        <section className={`${styles.card} ${styles.full}`}><h2>比较的边界</h2><p>两套命盘来自同一份资料。相近的描述可以提示值得观察的主题，但不构成两套事实的独立互证；看法不同也会在报告中保留，不强行合成一个结论。</p><Evidence items={f.evidence.filter(e => e.system === 'shared')} label="查看共同口径" /></section>
      </div>}
      {view === 'report' && <section className={styles.card} aria-label="合参报告"><div className={styles.reportHeading}><div><h2>{SYNTHESIS_TOPICS[topic].label}合参解读</h2><p className={styles.note}>每个主题独立保存，重新生成保留旧版，回看无需重复生成。</p></div><button className={styles.primary} disabled={Boolean(pending)} onClick={() => void generate()}>{pending ? '正在生成…' : detail.versions[0]?.status === 'failed' ? '重试生成合参' : active ? '重新生成并保留旧版' : '生成合参解读'}</button></div>
        {generationError && <p role="alert" className={styles.error}>{generationError}</p>}{detail.versions[0]?.status === 'failed' && !generationError && <p role="status" className={styles.caution}>最近一次生成未完成，可以重试。已保存的旧版本仍可查看。</p>}{pending && <p role="status">正在分别整理两套依据，并比较共同观察与不同观点…</p>}
        {detail.versions.some(v => v.status === 'completed') && <label className={styles.version}>已保存版本<select aria-label="合参报告版本" value={active?.id ?? ''} onChange={e => setVersionId(e.target.value)}>{detail.versions.filter(v => v.status === 'completed').map(v => <option key={v.id} value={v.id}>第 {v.version} 版 · {new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(v.updatedAt)}</option>)}</select></label>}
        {active?.content ? <div className={styles.reading}><p className={styles.summary}>{active.content.summary}</p>{active.content.sections.map(s => <article key={s.key}><h3>{SYNTHESIS_SECTIONS[s.key]}</h3><AiMarkdown text={s.content} /><Evidence items={active.facts.evidence.filter(e => s.evidenceIds.includes(e.id))} label="查看本节两侧依据" /></article>)}<p className={styles.note}>按生成时的口径与依据保存 · {active.model}。</p></div> : <p className={styles.empty}>还没有已完成的合参解读，可以先阅读双盘依据。</p>}
      </section>}
      <p className={styles.note} style={{ marginTop: 20 }}>传统命理与 AI 解读用于文化学习和自我观察，请结合现实信息验证。</p>
    </>}
  </main>;
}
