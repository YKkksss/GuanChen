'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AiMarkdown from './AiMarkdown';
import BaziFineReadingPanel, { climateBasisLabel } from './BaziFineReadingPanel';
import BaziNatalEffectPanel from './BaziNatalEffectPanel';
import BaziMethodReviewPanel from './BaziMethodReviewPanel';
import BaziMonthCommandPanel from './BaziMonthCommandPanel';
import BaziMonthIntakePanel from './BaziMonthIntakePanel';
import { BAZI_READING_SECTIONS, type BaziElementPosition, type BaziReadingDetail, type BaziReadingEvidence } from '@/lib/bazi/reading-types';
import type { baziReadingExample } from '@/lib/bazi/reading-examples';
import styles from './BaziReadingWorkspace.module.css';
type Example = ReturnType<typeof baziReadingExample>;
type Payload = { detail: BaziReadingDetail; examples: Array<{ id: string; title: string; question: string }>; example?: Example };
async function json<T>(url: string, init?: RequestInit): Promise<T> { const r = await fetch(url, { cache: 'no-store', ...init }); let v: T & { error?: string }; try { v = await r.json(); } catch { throw new Error('服务没有返回有效数据，请稍后重试'); } if (!r.ok) throw new Error(v.error || '加载失败，请稍后重试'); return v; }
function positionLabel(status: BaziElementPosition['status']) { return ({ surface_present: '表层已见', hidden_only: '仅藏未透', not_observed: '原局未见', unknown_time: '时柱未知，未能判缺' } as const)[status]; }
function Evidence({ items, label = '查看依据' }: { items: BaziReadingEvidence[]; label?: string }) { return <details className={styles.evidence}><summary>{label}（{items.length} 条）</summary><dl>{items.map(e => <div key={e.id}><dt>{e.label}</dt><dd>{e.details}{e.sourceUrl && <><br /><a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">查看原典来源</a></>}</dd></div>)}</dl></details>; }
export default function BaziReadingWorkspace({ chartId }: { chartId: string }) {
  const router = useRouter(), endpoint = `/api/bazi/charts/${encodeURIComponent(chartId)}/reading`;
  const [detail, setDetail] = useState<BaziReadingDetail | null>(null), [examples, setExamples] = useState<Payload['examples']>([]), [exampleId, setExampleId] = useState('winter'), [example, setExample] = useState<Example | null>(null);
  const [view, setView] = useState<'facts' | 'reading' | 'examples'>('facts'), [versionId, setVersionId] = useState('');
  const [loading, setLoading] = useState(true), [generating, setGenerating] = useState(false), [chatting, setChatting] = useState(false), [exampleLoading, setExampleLoading] = useState(false), [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(''), [generationError, setGenerationError] = useState(''), [exampleError, setExampleError] = useState('');
  const generationRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; setError('');
    const load = async () => {
      try { const p = await json<Payload>(endpoint, { signal: controller.signal }); if (controller.signal.aborted) return; setDetail(p.detail); setExamples(p.examples); if (p.detail.versions.some(v => v.status === 'generating')) timer = setTimeout(() => void load(), 2500); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '论命资料加载失败'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }; void load(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [endpoint, refresh]);
  useEffect(() => {
    if (view !== 'examples') return;
    const controller = new AbortController(); setExample(null); setExampleLoading(true); setExampleError('');
    void json<Payload>(`${endpoint}?${new URLSearchParams({ example: exampleId })}`, { signal: controller.signal }).then(p => { if (!controller.signal.aborted) setExample(p.example ?? null); }).catch(e => { if (!controller.signal.aborted) setExampleError(e.message); }).finally(() => { if (!controller.signal.aborted) setExampleLoading(false); });
    return () => controller.abort();
  }, [endpoint, view, exampleId, refresh]);
  useEffect(() => () => generationRef.current?.abort(), []);
  const pending = generating || detail?.versions.some(v => v.status === 'generating'), active = detail?.versions.find(v => v.id === (versionId || detail.activeVersionId));
  const generate = async () => {
    if (pending) return;
    const controller = new AbortController(); generationRef.current = controller; setGenerating(true); setGenerationError('');
    try { const p = await json<{ detail: BaziReadingDetail }>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regenerate: Boolean(detail?.activeVersionId) }), signal: controller.signal }); if (!controller.signal.aborted) { setDetail(p.detail); setVersionId(''); setRefresh(v => v + 1); } }
    catch (e) { if (!controller.signal.aborted) { setGenerationError(e instanceof Error ? e.message : '生成失败'); setRefresh(v => v + 1); } }
    finally { if (!controller.signal.aborted) setGenerating(false); }
  };
  const chat = async (draft = '请结合论命总览的旺衰证据、格局条件和新增调候参考，解释不同方法的取用方向与待核条件。') => {
    setChatting(true); setGenerationError('');
    try { const p = await json<{ conversation: { id: string } }>('/api/bazi/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chartVersionId: chartId }) }); router.push(`/bazi/chat/${p.conversation.id}?draft=${encodeURIComponent(draft)}`); }
    catch (e) { setGenerationError(e instanceof Error ? e.message : '会话创建失败'); setChatting(false); }
  };
  const f = detail?.facts;
  return <main className={styles.workspace}>
    <header className={styles.header}><div><p className={styles.eyebrow}>四柱八字 · 原局论命</p><h1>八字论命总览</h1><p>{detail?.title ?? '正在读取已保存的命盘'}</p></div><div className={styles.actions}><Link href="/synthesis">紫微八字合参</Link> · <Link href="/bazi">返回八字分析</Link></div></header>
    {error && <div role="alert" className={styles.error}>{error}<button onClick={() => setRefresh(v => v + 1)}>重新加载</button></div>}
    {loading ? <p role="status">正在汇总旺衰、格局与调候依据…</p> : f && <>
      <section className={styles.identity} aria-label="当前八字"><div className={styles.pillars}>{Object.values(f.chart.pillars).map((p, i) => <div key={i}><small>{p?.label ?? '时柱'}</small><strong>{p?.ganZhi ?? '未知'}</strong></div>)}</div><div><strong>{f.chart.dayMaster.stem}{f.chart.dayMaster.element}日主 · {f.chart.pillars.month.branch}月</strong><p className={styles.note}>以保存的节令月支分析，保留时区、时间标准与晚子时口径。</p></div></section>
      {f.chart.completeness === 'partial_unknown_time' && <p className={styles.caution}>出生时辰未知，未补写时柱；未见元素不等于全盘缺失，用神与喜忌方向均需降低确定性。</p>}
      <div role="group" aria-label="论命视图" className={styles.views}>{([['facts', '论命依据'], ['reading', 'AI 解读'], ['examples', '教学对照']] as const).map(([k, label]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>)}</div>
      {view === 'facts' && <div className={styles.grid}>
        <section className={styles.card}><p className={styles.step}>01 · 旺衰</p><h2>月令、根气与承载</h2><p className={styles.lead}>{f.interpretation.strength.label}</p><ul>{f.interpretation.strength.rationale.map((r, i) => <li key={i}>{r}</li>)}</ul><p className={styles.note}>根气来自实际藏干；月令是主要证据，也要结合透干和结构关系。</p><Evidence items={f.evidence.filter(e => e.family === 'strength')} label="查看旺衰依据" /></section>
        <section className={styles.card}><p className={styles.step}>02 · 格局</p><h2>支持、风险与救应</h2>{f.patterns.candidates.map(p => <details key={p.id} className={styles.pattern}><summary>{p.label}</summary>{([['支持条件', p.formationSupport], ['风险条件', p.breakingRisks], ['救应候选', p.rescueCandidates]] as const).map(([label, items]) => <div key={label}><h3>{label}</h3><ul>{items.map(i => <li key={i.id}><strong>{i.label}</strong> · {i.statusLabel}<p>{i.detail}</p></li>)}</ul></div>)}</details>)}<p className={styles.note}>候选不等于成格，条件出现不等于破格或救应完成。</p><Evidence items={f.evidence.filter(e => e.family === 'pattern')} label="查看格局依据" /></section>
        <section className={styles.card}><p className={styles.step}>03 · 调候</p><h2>寒暖燥湿的条件</h2><p className={styles.lead}>{f.climate.rule.label}</p><p>{f.climate.rule.rationale}</p><p className={styles.note}>适用层级：{f.climate.reference ? climateBasisLabel[f.climate.reference.basis] : f.climate.rule.scope === 'stem_month_reference' ? '日干月令参考' : '五行四时一般原则'} · {f.climate.rule.sourceSection}</p><ul>{f.climate.directions.map(d => <li key={d.element}><strong>{d.element} · {positionLabel(d.status)}</strong><p>表层：{d.surface.join('、') || '未见'}；藏干：{d.hidden.join('、') || '未见'}</p></li>)}</ul>{f.climate.stemReferences.length > 0 && <p className={styles.note}>具体参考：{f.climate.stemReferences.map(r => `${r.stem}（${positionLabel(r.status)}）`).join('、')}</p>}<Evidence items={f.evidence.filter(e => e.family === 'climate')} label="查看调候依据与来源" /></section>
        <section className={styles.card}><p className={styles.step}>04 · 取用</p><h2>用神方向与喜忌复核</h2><p className={styles.note}>把不同方法的候选、谨慎条件及不一致处放在一起，避免“缺什么补什么”。</p><div className={styles.elements}>{f.usefulElements.map(e => <details key={e.element} className={styles.element}><summary><strong>{e.element}</strong><span>{e.label}</span></summary><p>候选方法：{e.suggestedBy.join('、') || '暂无'}</p><p>谨慎条件：{e.attentionBy.join('、') || '暂无'}</p><p>{positionLabel(e.position.status)}</p><p>{e.rationale}</p></details>)}</div><Evidence items={f.evidence.filter(e => e.family === 'useful')} label="查看分方法取用依据" /></section>
        <BaziMonthCommandPanel key={`command:${chartId}`} review={f.monthCommandReview} onAsk={draft => void chat(draft)} asking={chatting}/>
        <BaziMonthIntakePanel key={`intake:${chartId}`} review={f.monthIntake} onAsk={draft => void chat(draft)} asking={chatting}/>
        {generationError && <p role="alert" className={`${styles.error} ${styles.full}`}>{generationError}</p>}
        {f.methodReview && <BaziMethodReviewPanel key={`method:${chartId}`} review={f.methodReview} />}
        {f.natalReview && <BaziNatalEffectPanel key={`natal:${chartId}`} review={f.natalReview} />}
        <>{f.fineReview && <BaziFineReadingPanel key={chartId} review={f.fineReview} stem={f.chart.dayMaster.stem} branch={f.chart.pillars.month.branch} period={f.natalReview?.period}/>}</><section className={`${styles.card} ${styles.full}`}><h2>继续核对的问题</h2><ul>{f.reviewQuestions.map(q => <li key={q}>{q}</li>)}</ul><Evidence items={f.evidence.filter(e => e.family === 'chart')} label="查看排盘口径" /></section>
      </div>}
      {view === 'reading' && <section className={styles.card} aria-label="八字论命解读"><div className={styles.reportHeading}><div><h2>你的原局论命解读</h2><p className={styles.note}>点击生成后自动保存，重新生成保留旧版，回看不重复调用 AI。</p></div><button className={styles.primary} disabled={Boolean(pending)} onClick={() => void generate()}>{pending ? '正在生成…' : detail.versions[0]?.status === 'failed' ? '重试生成论命' : active ? '重新生成并保留旧版' : '生成论命解读'}</button></div>
        {generationError && <p role="alert" className={styles.error}>{generationError}</p>}{detail.versions[0]?.status === 'failed' && !generationError && <p role="status" className={styles.caution}>最近一次生成未完成，可以重试。已保存的版本仍可查看。</p>}{pending && <p role="status">正在整理五个论命章节，请稍候…</p>}
        {detail.versions.some(v => v.status === 'completed') && <label className={styles.version}>已保存版本<select aria-label="论命报告版本" value={active?.id ?? ''} onChange={e => setVersionId(e.target.value)}>{detail.versions.filter(v => v.status === 'completed').map(v => <option key={v.id} value={v.id}>第 {v.version} 版 · {new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(v.updatedAt)}</option>)}</select></label>}
        {active?.content && active.facts.methodologyVersion !== f.methodologyVersion && <p className={styles.caution} role="status">当前查看的是旧规则保存的报告，依据按当时版本保留。可以重新生成新版，旧版仍可回看。</p>}{active?.content ? <><div className={styles.reading}><p className={styles.summary}>{active.content.summary}</p>{active.content.sections.map(s => <article key={s.key}><h3>{BAZI_READING_SECTIONS[s.key]}</h3><AiMarkdown text={s.content} /><Evidence items={active.facts.evidence.filter(e => s.evidenceIds.includes(e.id))} label="查看本节依据" /></article>)}<p className={styles.note}>报告按生成时的规则与依据保存 · {active.model}。五行候选不等于最终喜神、忌神。</p></div><p className={styles.note}>以下复核只读取当前所选报告保存的依据，切换报告不会借用新版结果。</p><BaziMonthCommandPanel key={`report-command:${active.id}`} review={active.facts.monthCommandReview}/><BaziMonthIntakePanel key={`report-intake:${active.id}`} review={active.facts.monthIntake}/></> : <p className={styles.empty}>还没有已完成的论命解读。可先阅读“论命依据”，再生成报告。</p>}
        <button className={styles.secondary} disabled={chatting} onClick={() => void chat()}>{chatting ? '正在进入对话…' : '继续问八字'}</button>
      </section>}
      {view === 'examples' && <section className={styles.card} aria-label="合成教学对照"><h2>把规则放进例子中理解</h2><p className={styles.note}>示例仅作教学，不属于当前账号档案。相同结构不能推断相同命运。</p><label className={styles.version}>选择示例<select aria-label="教学示例" value={exampleId} onChange={e => setExampleId(e.target.value)}>{examples.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
        {exampleLoading ? <p role="status">正在计算教学示例…</p> : exampleError ? <p role="alert" className={styles.error}>{exampleError}<button onClick={() => setRefresh(v => v + 1)}>重新加载示例</button></p> : example && <><p className={styles.summary}>{example.question}</p><div className={styles.comparison}><div><h3>当前命盘</h3><p>{f.chart.dayMaster.stem}{f.chart.dayMaster.element} · {f.chart.pillars.month.branch}月</p><p>{f.interpretation.strength.label}</p><p>{f.climate.rule.label}</p><p>调候入口：{f.climate.rule.elements.join('、')}</p><p>时柱：{f.chart.pillars.time?.ganZhi ?? '未知'}</p></div><div><h3>合成示例</h3><p>{example.chart.dayMaster.stem}{example.chart.dayMaster.element} · {example.chart.pillars.month.branch}月</p><p>{example.interpretation.strength.label}</p><p>{example.climate.rule.label}</p><p>调候入口：{example.climate.rule.elements.join('、')}</p><p>时柱：{example.chart.pillars.time?.ganZhi ?? '未知'}</p></div></div><p>{example.climate.rule.rationale}</p><p className={styles.note}>{example.note}</p></>}
      </section>}
      <p className={styles.disclaimer}>传统命理规则与 AI 解释用于文化学习和自我观察，不替代现实信息。当前保留条件、不确定性和方法差异，不输出精确分数或确定命运。</p>
    </>}
  </main>;
}
