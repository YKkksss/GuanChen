'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AiMarkdown from './AiMarkdown';
import SynthesisDynamicReviewPanel from './SynthesisDynamicReviewPanel';
import { SYNTHESIS_SECTIONS, SYNTHESIS_TOPICS, type SynthesisEvidence, type SynthesisTopic } from '@/lib/synthesis/types';
import type { SynthesisDynamicDetail, SynthesisDynamicHistory, SynthesisDynamicSelection } from '@/lib/synthesis/dynamic-types';
import type { AnnualTransitSnapshot, MonthlyTransitSnapshot, TransitTransform } from '@/lib/transits/types';
import { BRANCHES } from '@/lib/ziwei/constants';
import common from './SynthesisWorkspace.module.css';
import styles from './SynthesisDynamicWorkspace.module.css';

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  let result: T & { error?: string };
  try { result = await response.json(); } catch { throw new Error('服务没有返回有效数据，请稍后重试'); }
  if (!response.ok) throw new Error(result.error || '操作失败，请稍后重试');
  return result;
}

function beijingNow(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const value = (key: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === key)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}`;
}

function selectionValue(level: SynthesisDynamicSelection['level'], dateTime: string): SynthesisDynamicSelection | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(dateTime)) return null;
  return { level, dateTime: dateTime.length === 16 ? `${dateTime}:00` : dateTime };
}

// 后端的阶段边界是固定 UTC+08:00 文本，不能按设备时区重新解析。
function boundary(value: string | null | undefined): string { return value ? value.replace('T', ' ') : '暂不可用'; }
function savedTime(value: number): string { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(value); }

function Evidence({ items, label }: { items: SynthesisEvidence[]; label: string }) {
  return <details className={common.evidence}><summary>{label}（{items.length} 条）</summary><dl>{items.map(item => <div key={item.id}><dt>{item.system === 'ziwei' ? '紫微' : item.system === 'bazi' ? '八字' : '共同口径'} · {item.label}</dt><dd>{item.details}{item.sourceUrl && <><br /><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">查看规则来源</a></>}</dd></div>)}</dl></details>;
}

function Transformations({ items, label }: { items: TransitTransform[]; label: string }) {
  return <div className={styles.transforms}><h3>{label}</h3><ul>{items.map((item, index) => <li key={`${item.type}-${item.starName}-${index}`}><strong>{item.starName}化{item.type}</strong><span>{item.natalPalaceBranch === null ? '本命落宫待核' : `${BRANCHES[item.natalPalaceBranch]}位 · 本命${item.natalPalaceName ?? '宫位待核'}`}</span></li>)}</ul></div>;
}

function TopicPalaces({ snapshot, topic, label }: { snapshot: AnnualTransitSnapshot | MonthlyTransitSnapshot; topic: SynthesisTopic; label: string }) {
  const wanted = SYNTHESIS_TOPICS[topic].palaces.map(name => name.replace(/宫$/, ''));
  const palaces = snapshot.palaceMappings.filter(palace => wanted.includes(palace.transitPalaceName.replace(/宫$/, '') as typeof wanted[number]));
  return <div><h3>{label}主题宫位</h3><ul className={styles.palaces}>{palaces.map(palace => <li key={palace.branch}><strong>{palace.transitPalaceName} · {BRANCHES[palace.branch]}位</strong><span>对应本命{palace.nativePalaceName}；阶段星曜：{palace.transitStars.length ? palace.transitStars.join('、') : '此处未列阶段星曜'}</span></li>)}</ul></div>;
}

export default function SynthesisDynamicWorkspace({ id, initialTopic = 'overview' }: { id: string; initialTopic?: SynthesisTopic }) {
  const endpoint = `/api/synthesis/${encodeURIComponent(id)}/dynamic`;
  const [topic, setTopic] = useState<SynthesisTopic>(initialTopic);
  const [level, setLevel] = useState<SynthesisDynamicSelection['level']>('year');
  const [dateTime, setDateTime] = useState('');
  const [detail, setDetail] = useState<SynthesisDynamicDetail | null>(null);
  const [history, setHistory] = useState<SynthesisDynamicHistory[]>([]);
  const [range, setRange] = useState<{ minDateTime: string; maxDateTime: string } | null>(null);
  const [view, setView] = useState<'facts' | 'report'>('facts');
  const [versionId, setVersionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<'save' | 'generate' | null>(null);
  const [error, setError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const lastLoad = useRef<{ topic: SynthesisTopic; selection?: SynthesisDynamicSelection; stageKey?: string } | null>(null);

  const load = useCallback(async (selectedTopic: SynthesisTopic, selected?: SynthesisDynamicSelection, preserve = false, stageKey?: string) => {
    controller.current?.abort();
    const abort = new AbortController(), request = ++requestNumber.current;
    controller.current = abort;
    setLoading(true); setError('');
    lastLoad.current = { topic: selectedTopic, selection: selected, stageKey };
    if (!preserve) { setDetail(null); setVersionId(''); setOperationError(''); setNotice(''); }
    const query = new URLSearchParams({ topic: selectedTopic });
    if (selected) { query.set('level', selected.level); query.set('dateTime', selected.dateTime); }
    if (stageKey) query.set('stageKey', stageKey);
    try {
      const result = await readJson<{ detail: SynthesisDynamicDetail }>(`${endpoint}?${query}`, { signal: abort.signal });
      if (abort.signal.aborted || request !== requestNumber.current) return;
      setDetail(result.detail); setHistory(result.detail.history); setRange(result.detail.facts.dynamic.range);
      setLevel(result.detail.facts.dynamic.selection.level); setDateTime(result.detail.facts.dynamic.selection.dateTime);
      lastLoad.current = { topic: selectedTopic, selection: result.detail.facts.dynamic.selection, stageKey: result.detail.savedSnapshotId ? result.detail.facts.dynamic.key : undefined };
    } catch (failure) {
      if (!abort.signal.aborted && request === requestNumber.current) setError(failure instanceof Error ? failure.message : '动态阶段加载失败');
    } finally { if (!abort.signal.aborted && request === requestNumber.current) setLoading(false); }
  }, [endpoint]);

  useEffect(() => { void load(initialTopic); return () => { controller.current?.abort(); requestNumber.current++; }; }, [initialTopic, load]);

  const pending = Boolean(detail?.versions.some(version => version.status === 'generating'));
  const locked = operation !== null || pending;
  useEffect(() => {
    if (!detail || !pending || operation) return;
    const timer = setTimeout(() => void load(topic, detail.facts.dynamic.selection, true, detail.savedSnapshotId ? detail.facts.dynamic.key : undefined), 2500);
    return () => clearTimeout(timer);
  }, [detail, pending, operation, topic, load]);

  const clearPreview = () => {
    controller.current?.abort(); requestNumber.current++;
    lastLoad.current = null;
    setDetail(null); setLoading(false); setError(''); setOperationError(''); setVersionId(''); setNotice('');
  };
  const changeTopic = (next: SynthesisTopic) => {
    if (locked || next === topic) return;
    const savedKey = detail?.savedSnapshotId ? detail.facts.dynamic.key : undefined;
    const matchingHistory = savedKey ? history.find(item => item.topic === next && item.key === savedKey) : undefined;
    clearPreview(); setTopic(next);
    const selected = selectionValue(level, dateTime);
    if (selected) void load(next, selected, false, matchingHistory?.key);
  };
  const apply = () => {
    const selected = selectionValue(level, dateTime);
    if (!selected) { setError('请填写完整的北京时间日期与时刻'); return; }
    const previous = lastLoad.current;
    const sameSelection = previous?.topic === topic && previous.selection?.level === selected.level && previous.selection.dateTime === selected.dateTime;
    void load(topic, selected, false, sameSelection ? previous?.stageKey : undefined);
  };
  const retryLoad = () => {
    const previous = lastLoad.current;
    if (previous) void load(previous.topic, previous.selection, Boolean(detail), previous.stageKey);
    else apply();
  };

  const mutate = async (action: 'save' | 'generate') => {
    if (!detail || locked || loading) return;
    const selected = detail.facts.dynamic.selection, selectedTopic = topic;
    const stageKey = detail.savedSnapshotId ? detail.facts.dynamic.key : undefined;
    controller.current?.abort();
    const abort = new AbortController(), request = ++requestNumber.current;
    controller.current = abort; setOperation(action); setOperationError(''); setNotice('');
    let refreshAfterFailure = false;
    try {
      const result = await readJson<{ detail: SynthesisDynamicDetail }>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: selectedTopic, selection: selected, action, ...(stageKey ? { stageKey } : {}), ...(action === 'generate' ? { regenerate: detail.versions.some(version => Boolean(version.content) && version.status === 'completed') } : {}) }), signal: abort.signal });
      if (abort.signal.aborted || request !== requestNumber.current) return;
      setDetail(result.detail); setHistory(result.detail.history); setVersionId('');
      lastLoad.current = { topic: selectedTopic, selection: result.detail.facts.dynamic.selection, stageKey: result.detail.savedSnapshotId ? result.detail.facts.dynamic.key : undefined };
      setNotice(action === 'save' ? '阶段依据已保存，没有调用 AI。' : result.detail.versions.some(version => version.status === 'generating') ? '阶段解读正在生成，已保存的旧版本仍可查看。' : '阶段解读已保存。');
    } catch (failure) {
      if (!abort.signal.aborted && request === requestNumber.current) {
        setOperationError(failure instanceof Error ? failure.message : action === 'save' ? '保存失败，请重试' : '生成失败，请重试');
        refreshAfterFailure = true;
      }
    } finally { if (!abort.signal.aborted && request === requestNumber.current) setOperation(null); }
    // 失败后同步服务端状态，继续保留当前页面和已有解读。
    if (refreshAfterFailure && request === requestNumber.current) await load(selectedTopic, selected, true, stageKey);
  };

  const facts = detail?.facts, stage = facts?.dynamic;
  const reports = detail?.versions.filter(version => version.status === 'completed' && version.content !== null) ?? [];
  const active = reports.find(version => version.id === (versionId || detail?.activeVersionId)) ?? reports[0];
  const selectedHistory = stage ? history.find(item => item.key === stage.key && item.topic === topic) : null;
  const latestFailed = detail?.versions[0]?.status === 'failed';
  const annual = stage?.ziwei.annual, monthly = stage?.ziwei.monthly;

  return <main className={`${common.workspace} ${styles.workspace}`}>
    <header className={common.header}><div><p className={common.eyebrow}>紫微与八字 · 动态阶段</p><h1>{detail?.session.title ?? '动态紫微八字合参'}</h1><p className={common.note}>在同一个北京时间观察点，分别核对大限、流年流月与大运、流年流月。</p></div><Link href="/synthesis">返回合参中心</Link></header>
    <div role="group" aria-label="动态合参主题" className={common.topics}>{(Object.keys(SYNTHESIS_TOPICS) as SynthesisTopic[]).map(key => <button key={key} disabled={locked} aria-pressed={topic === key} onClick={() => changeTopic(key)}>{SYNTHESIS_TOPICS[key].label}</button>)}</div>
    <section className={`${common.card} ${styles.selection}`} aria-label="动态阶段条件">
      <form onSubmit={event => { event.preventDefault(); apply(); }}>
        <fieldset className={styles.fields} disabled={locked}><legend>选择观察阶段</legend><label>观察层级<select aria-label="动态合参观察层级" value={level} onChange={event => { clearPreview(); setLevel(event.target.value as SynthesisDynamicSelection['level']); }}><option value="year">流年观察</option><option value="month">流月观察</option></select></label><label className={styles.date}>观察时刻 · 北京时间 UTC+08:00<input aria-label="动态合参观察时刻" type="datetime-local" step="1" required min={range?.minDateTime} max={range?.maxDateTime} value={dateTime} onChange={event => { clearPreview(); setDateTime(event.target.value); }} /></label><div className={styles.formActions}><button className={common.primary} type="submit">{loading ? '重新应用阶段' : '应用阶段'}</button><button className={common.secondary} type="button" onClick={() => { clearPreview(); setDateTime(beijingNow()); }}>填入当前北京时间</button></div></fieldset>
      </form>
      <p className={common.note}>年、月表示观察层级，同年或同月的其他时点可能跨越边界。修改条件后点击“应用阶段”，只整理依据，不调用 AI。</p>
      {history.length > 0 && <label className={styles.history}>已保存阶段<select aria-label="已保存动态合参阶段" disabled={locked} value={selectedHistory ? `${selectedHistory.topic}|${selectedHistory.key}` : ''} onChange={event => { const item = history.find(entry => `${entry.topic}|${entry.key}` === event.target.value); if (!item) return; clearPreview(); setTopic(item.topic); setLevel(item.selection.level); setDateTime(item.selection.dateTime); void load(item.topic, item.selection, false, item.key); }}><option value="">选择历史阶段与主题</option>{history.map(item => <option key={`${item.topic}|${item.key}`} value={`${item.topic}|${item.key}`}>{item.label} · {SYNTHESIS_TOPICS[item.topic].label} · {item.hasReport ? '含 AI 解读' : '仅阶段依据'}</option>)}</select></label>}
    </section>
    {error && <p role="alert" className={common.error}>{error}<button onClick={retryLoad}>重新加载</button></p>}
    {loading && <p role="status" className={styles.status}>正在整理当前阶段的双盘依据…</p>}
    {!detail && !loading && !error && <p className={common.empty} role="status">条件已更改，请应用阶段后查看对应依据。</p>}
    {detail && facts && stage && annual && <>
      <section className={styles.stageHeading} aria-label="当前动态阶段"><div><h2>{stage.label} · {SYNTHESIS_TOPICS[topic].label}</h2><p>观察时刻：{boundary(stage.selection.dateTime)} · {stage.timezoneLabel}</p><p className={common.note}>{detail.savedSnapshotId ? '当前阶段依据已有固定快照，回看不重新计算。' : '当前为未保存的阶段预览。保存依据不会生成 AI 报告。'}</p></div><button className={common.secondary} disabled={locked || loading} onClick={() => void mutate('save')}>{operation === 'save' ? '正在保存…' : detail.savedSnapshotId ? '保存当前阶段依据' : '保存阶段依据'}</button></section>
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {operationError && <p role="alert" className={common.error}>{operationError}</p>}
      {facts.policy.unknownTime && <p className={common.caution}>出生时间未知：紫微仅为子时试排；八字不补时柱，精确起运可能撤回。阶段标签不能消除本命资料的不确定性。</p>}
      <div role="group" aria-label="动态合参视图" className={common.views}><button aria-pressed={view === 'facts'} onClick={() => setView('facts')}>阶段双盘依据</button><button aria-pressed={view === 'report'} onClick={() => setView('report')}>AI 阶段解读</button></div>
      {view === 'facts' && <div className={common.grid}>
        <section className={common.card} aria-label="紫微动态依据"><p className={common.eyebrow}>01 · 紫微阶段</p><h2>大限、流年{monthly ? '与流月' : ''}</h2><dl className={styles.facts}><div><dt>观察日期</dt><dd>{annual.representativeDate} · {annual.lunarDate} · 虚岁 {annual.nominalAge}</dd></div><div><dt>当前大限</dt><dd>{annual.decadal.periodKind === 'unavailable' ? '当前大限不可用，不补造大限宫位' : annual.decadal.periodKind === 'childhood' ? `童限 · ${BRANCHES[annual.decadal.palaceBranch]}位 · 本命${annual.decadal.nativePalaceName}` : annual.decadal.startAge === null || annual.decadal.endAge === null ? '当前大限范围待核' : `${annual.decadal.startAge}–${annual.decadal.endAge} 岁 · ${BRANCHES[annual.decadal.palaceBranch]}位 · 本命${annual.decadal.nativePalaceName}`}</dd></div><div><dt>流年命宫</dt><dd>{annual.year.ganZhi} · {BRANCHES[annual.flowYear.palaceBranch]}位 · 本命{annual.flowYear.nativePalaceName}</dd></div>{monthly && <><div><dt>流月命宫</dt><dd>{monthly.flowMonth.ganZhi} · {BRANCHES[monthly.flowMonth.palaceBranch]}位 · 本命{monthly.flowMonth.nativePalaceName}</dd></div><div><dt>农历月范围</dt><dd>{monthly.lunarMonth.label} · {monthly.lunarMonth.startDate} 至 {monthly.lunarMonth.endDate}{monthly.lunarMonth.isLeap ? '（闰月）' : ''}</dd></div></>}</dl>
          <Transformations items={annual.transformations} label="流年四化与本命落宫" />{monthly && <Transformations items={monthly.transformations} label="流月四化与本命落宫" />}
          <TopicPalaces snapshot={monthly ?? annual} topic={topic} label={monthly ? '流月' : '流年'} />
          <Evidence items={facts.evidence.filter(item => item.system === 'ziwei')} label="查看紫微阶段与本命依据" /><div className={common.actions}><Link href={`/chart/${detail.session.conversationId}`}>打开完整紫微命盘</Link></div>
        </section>
        <section className={common.card} aria-label="八字动态依据"><p className={common.eyebrow}>02 · 八字阶段</p><h2>大运、节令流年{stage.bazi.month ? '与流月' : ''}</h2><p>{facts.bazi.chart.dayMaster.stem}{facts.bazi.chart.dayMaster.element}日主；阶段十神始终以本命日主为参照。</p><dl className={styles.facts}><div><dt>大运状态</dt><dd>{stage.bazi.luck.status === 'active' && stage.bazi.luck.cycle ? `${stage.bazi.luck.cycle.ganZhi}大运 · ${stage.bazi.luck.direction}` : stage.bazi.luck.status === 'pre_luck' ? '尚未起运' : '当前大运不可用或精确起运已撤回'}<p>{stage.bazi.luck.reason}</p></dd></div><div><dt>交运起点</dt><dd>{boundary(stage.bazi.luck.startAt)}</dd></div>{stage.bazi.luck.status === 'active' && stage.bazi.luck.cycle && <div><dt>当前大运边界</dt><dd>{boundary(stage.bazi.luck.cycle.startAt)} ≤ 观察点 &lt; {boundary(stage.bazi.luck.cycle.endAtExclusive)}</dd></div>}<div><dt>节令流年</dt><dd><strong>{stage.bazi.year.ganZhi}</strong><p>{boundary(stage.bazi.year.startAt)} ≤ 观察点 &lt; {boundary(stage.bazi.year.endAtExclusive)}</p></dd></div>{stage.bazi.month && <div><dt>节令流月</dt><dd><strong>{stage.bazi.month.ganZhi}</strong><p>{boundary(stage.bazi.month.startAt)} ≤ 观察点 &lt; {boundary(stage.bazi.month.endAtExclusive)}</p></dd></div>}</dl>
          <h3>阶段天干与藏干十神</h3><ul className={styles.roles}>{stage.bazi.roles.map(role => <li key={role.key}><div><strong>{role.label} · {role.ganZhi}</strong><span>天干：{role.stemTenGod}</span></div><p>地支藏干：{role.hiddenStems.map(item => `${item.stem}（${item.tenGod}）`).join('、') || '未列'}</p></li>)}</ul><p className={common.note}>十神只表示关系；不单凭同字、四化或十神名称判定整年整月吉凶。</p>
          <Evidence items={facts.evidence.filter(item => item.system === 'bazi')} label="查看八字阶段与本命依据" /><div className={common.actions}><Link href={`/bazi/reading/${detail.session.baziChartId}`}>打开完整八字论命</Link></div>
        </section>
        <SynthesisDynamicReviewPanel review={stage.review}/>
        <section className={`${common.card} ${common.full}`} aria-label="动态合参共同口径"><h2>对齐观察点，保留两种月界</h2><p>紫微流月按农历月，八字流月按节令交节。两者在同一时刻各取自己的阶段，不能按同一个“月份”强行对齐，也不能把相似说法视为独立互证。</p><ul>{stage.boundaries.map((item, index) => <li key={index}>{item}</li>)}</ul><Evidence items={facts.evidence.filter(item => item.system === 'shared')} label="查看共同时间口径与待核条件" /><details className={common.evidence}><summary>查看本阶段版本、出生口径与计算范围</summary><p>阶段版本：{stage.version}</p><p>观察范围：{boundary(stage.range.minDateTime)} 至 {boundary(stage.range.maxDateTime)}（UTC+08:00）</p><p>本命标准时：{detail.session.input.birthDate} {detail.session.input.unknownTime ? '时间未知' : detail.session.input.birthTime}；本命校正后：{facts.policy.effectiveDate} {facts.policy.unknownTime ? '时间未知' : facts.policy.effectiveTime}。</p><p>本命采用{facts.policy.timeStandard === 'civil_time' ? '北京时间标准时' : '真太阳时'}，阶段观察点固定为北京时间，不再次叠加出生地校正。</p><p>紫微引擎：{annual.engineVersion}{monthly ? ` / ${monthly.engineVersion}` : ''}；八字起运方法：{stage.bazi.luck.methodologyVersion}。</p>{facts.policy.warnings.length > 0 && <ul>{facts.policy.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul>}</details></section>
      </div>}
      {view === 'report' && <section className={common.card} aria-label="动态合参报告"><div className={common.reportHeading}><div><h2>{SYNTHESIS_TOPICS[topic].label} · 阶段解读</h2><p className={common.note}>本阶段独立回看五章解读。重新生成保留旧版，切换阶段不会混用报告。</p></div><button className={common.primary} disabled={locked || loading} onClick={() => void mutate('generate')}>{operation === 'generate' || pending ? '正在生成…' : latestFailed ? '重试生成阶段解读' : reports.length ? '重新生成并保留旧版' : '生成阶段解读'}</button></div>{latestFailed && <p className={common.caution} role="status">最近一次生成未完成，可以重试。已保存的阶段依据和旧报告仍可查看。</p>}{pending && <p role="status">正在分别整理两套阶段依据，生成期间已保存的旧版仍可查看。</p>}
        {reports.length > 0 && <label className={common.version}>本阶段已保存的 AI 版本<select aria-label="动态合参报告版本" value={active?.id ?? ''} onChange={event => setVersionId(event.target.value)}>{reports.map(version => <option key={version.id} value={version.id}>第 {version.version} 版 · {savedTime(version.updatedAt)}</option>)}</select></label>}
        {reports.length > 0 && <p className={common.note}>版本编号按本主题累计，本列表只显示当前阶段，因此编号可能不连续。</p>}
        {active?.content ? <div className={common.reading}><div className={styles.reportSnapshot}><strong>{active.facts.dynamic?.label ?? '本版保存的阶段依据'}</strong><p>观察时刻：{boundary(active.facts.dynamic?.selection.dateTime)} · 北京时间 UTC+08:00</p><p>以下正文与引用均来自此版本固定快照。</p></div><p className={common.summary}>{active.content.summary}</p>{active.content.sections.map(section => <article key={section.key}><h3>{SYNTHESIS_SECTIONS[section.key]}</h3><AiMarkdown text={section.content} /><Evidence items={active.facts.evidence.filter(item => section.evidenceIds.includes(item.id))} label="查看本节保存的两侧依据" /></article>)}<p className={common.note}>按生成时的阶段与口径保存 · {active.model} · {active.facts.dynamic?.version ?? '旧版阶段快照'}。</p></div> : <p className={common.empty}>{detail.savedSnapshotId ? '阶段依据已保存，目前还没有已完成的 AI 阶段解读。保存快照不等于生成报告。' : '当前阶段尚未生成 AI 解读，可以先查看或保存双盘依据。'}</p>}
      </section>}
      <p className={`${common.note} ${styles.footer}`}>传统命理与 AI 解读用于文化学习和自我观察。阶段结构不等于确定事件，请结合现实信息复核。</p>
    </>}
  </main>;
}
