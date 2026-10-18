'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDots, CheckCircle, Sparkle } from '@phosphor-icons/react';
import AiMarkdown from '@/components/AiMarkdown';
import { beijingToday, clampCalendarDate, parseCalendarMonth, shiftCalendarDay, shiftCalendarMonth, validateCalendarDate } from '@/lib/fortune-calendar/dates';
import { CALENDAR_TOPICS, READING_SECTIONS, isCalendarTopic, type CalendarDay, type CalendarDayDetail, type CalendarMonth, type CalendarReading, type CalendarTopic } from '@/lib/fortune-calendar/types';
import styles from './FortuneCalendarWorkspace.module.css';

async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options });
  let data: T & { error?: string };
  try { data = await response.json(); } catch { throw new Error('服务暂时没有返回有效数据，请稍后重试'); }
  if (!response.ok) throw new Error(data.error || '服务暂时不可用，请稍后重试');
  return data;
}

export default function FortuneCalendarWorkspace({ conversationId, initialDate, initialTopic }: {
  conversationId: string; initialDate?: string; initialTopic: CalendarTopic;
}) {
  const [monthChoice, setMonthChoice] = useState(initialDate?.slice(0, 7) ?? '');
  const [date, setDate] = useState(initialDate ?? '');
  const [topic, setTopic] = useState<CalendarTopic>(initialTopic);
  const [calendar, setCalendar] = useState<CalendarMonth | null>(null);
  const [detail, setDetail] = useState<CalendarDayDetail | null>(null);
  const [monthLoading, setMonthLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(false);
  const [monthError, setMonthError] = useState('');
  const [dayError, setDayError] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [generatingKey, setGeneratingKey] = useState('');
  const generationRef = useRef<AbortController | null>(null);
  const focusDateRef = useRef('');
  const selectionRef = useRef('');
  const key = `${date}:${topic}`;
  selectionRef.current = key;
  const month = monthChoice || calendar?.month || beijingToday().slice(0, 7);
  const endpoint = `/api/conversations/${encodeURIComponent(conversationId)}/calendar`;

  useEffect(() => {
    const controller = new AbortController();
    setMonthLoading(true); setMonthError('');
    const query = new URLSearchParams({ topic });
    if (monthChoice) query.set('month', monthChoice);
    void readJson<{ calendar: CalendarMonth }>(`${endpoint}?${query}`, { signal: controller.signal })
      .then(({ calendar: next }) => {
        if (controller.signal.aborted) return;
        setCalendar(next);
        setDate(current => current ? clampCalendarDate(current, next.minDate, next.maxDate) : clampCalendarDate(next.today, next.minDate, next.maxDate));
      }).catch(error => { if (!controller.signal.aborted) { setCalendar(null); setMonthError(error.message); } })
      .finally(() => { if (!controller.signal.aborted) setMonthLoading(false); });
    return () => controller.abort();
  }, [endpoint, monthChoice, topic, refresh]);

  useEffect(() => {
    generationRef.current?.abort();
    setGeneratingKey(''); setGenerationError(''); setDetail(null); setDayError('');
    if (!date) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setDayLoading(true);
    const load = async () => {
      try {
        const data = await readJson<{ detail: CalendarDayDetail }>(`${endpoint}?${new URLSearchParams({ date, topic })}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setDetail(data.detail); setDayError('');
        if (data.detail.reading?.status === 'generating') timer = setTimeout(() => void load(), 2500);
      } catch (error) { if (!controller.signal.aborted) setDayError(error instanceof Error ? error.message : '当天运限读取失败'); }
      finally { if (!controller.signal.aborted) setDayLoading(false); }
    };
    void load();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [endpoint, date, topic, refresh]);

  useEffect(() => {
    if (!focusDateRef.current || monthLoading) return;
    const button = document.querySelector<HTMLButtonElement>(`button[data-calendar-date="${focusDateRef.current}"]`);
    if (button) { button.focus(); focusDateRef.current = ''; }
  }, [date, calendar, monthLoading]);

  useEffect(() => {
    const restore = () => {
      const query = new URLSearchParams(window.location.search);
      try {
        const nextDate = validateCalendarDate(query.get('date') ?? beijingToday());
        setDate(nextDate); setMonthChoice(nextDate.slice(0, 7));
      } catch { setDate(''); setMonthChoice(''); }
      const nextTopic = query.get('topic'); setTopic(isCalendarTopic(nextTopic) ? nextTopic : 'overview');
    };
    window.addEventListener('popstate', restore);
    return () => { window.removeEventListener('popstate', restore); generationRef.current?.abort(); };
  }, []);

  const rememberSelection = (nextDate: string, nextTopic: CalendarTopic) => {
    const url = new URL(window.location.href);
    url.searchParams.set('date', nextDate); url.searchParams.set('topic', nextTopic);
    window.history.replaceState(window.history.state, '', url);
  };
  const selectDate = (next: string, keyboard = false) => {
    if (!calendar) return;
    const nextDate = clampCalendarDate(next, calendar.minDate, calendar.maxDate);
    setDate(nextDate);
    if (nextDate.slice(0, 7) !== month) setMonthChoice(nextDate.slice(0, 7));
    if (keyboard) focusDateRef.current = nextDate;
    rememberSelection(nextDate, topic);
  };
  const selectMonth = (next: string, keyboard = false) => {
    if (!calendar || next < calendar.minDate.slice(0, 7) || next > calendar.maxDate.slice(0, 7)) return;
    try {
      const parsed = parseCalendarMonth(next);
      const nextDate = clampCalendarDate(`${next}-${String(Math.min(Number(date.slice(8)) || 1, parsed.days)).padStart(2, '0')}`, calendar.minDate, calendar.maxDate);
      if (keyboard) focusDateRef.current = nextDate;
      setMonthChoice(next); setDate(nextDate); rememberSelection(nextDate, topic);
    } catch { /* 月份输入未完成时保留当前选择。 */ }
  };
  const selectTopic = (next: CalendarTopic) => { setTopic(next); if (date) rememberSelection(date, next); };
  const generate = async () => {
    if (!detail || !date) return;
    const requestKey = key, controller = new AbortController();
    generationRef.current?.abort(); generationRef.current = controller;
    setGeneratingKey(requestKey); setGenerationError('');
    try {
      const data = await readJson<{ reading: CalendarReading }>(`${endpoint}/readings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, topic }), signal: controller.signal });
      if (controller.signal.aborted || selectionRef.current !== requestKey) return;
      setDetail(current => current ? { ...current, reading: data.reading } : null);
      setRefresh(current => current + 1);
    } catch (error) {
      if (!controller.signal.aborted && selectionRef.current === requestKey) setGenerationError(error instanceof Error ? error.message : '解读生成失败，请重试');
    } finally { if (generationRef.current === controller && selectionRef.current === requestKey) setGeneratingKey(''); }
  };
  const onDayKey = (event: React.KeyboardEvent<HTMLButtonElement>, day: CalendarDay) => {
    let next: string | undefined;
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (Object.hasOwn(offsets, event.key)) next = shiftCalendarDay(day.date, offsets[event.key]);
    if (event.key === 'Home') next = shiftCalendarDay(day.date, -((day.weekday + 6) % 7));
    if (event.key === 'End') next = shiftCalendarDay(day.date, 6 - ((day.weekday + 6) % 7));
    if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); selectMonth(shiftCalendarMonth(month, event.key === 'PageUp' ? -1 : 1), true); return; }
    if (next) { event.preventDefault(); selectDate(next, true); }
  };

  const days = calendar?.month === month ? calendar.days : [];
  const offset = days.length ? (days[0].weekday + 6) % 7 : 0;
  const slots = Array.from({ length: Math.ceil((offset + days.length) / 7) * 7 }, (_, index) => days[index - offset] ?? null);
  const weeks = Array.from({ length: slots.length / 7 }, (_, index) => slots.slice(index * 7, index * 7 + 7));
  const reading = detail?.reading;
  const pending = generatingKey === key || reading?.status === 'generating';
  const snapshot = detail?.facts.snapshot;
  const savedCount = days.filter(day => day.reading?.status === 'completed').length;
  const interpretationFacts = reading?.facts ?? detail?.facts;

  return <main className={styles.page}>
    <header className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>紫微 · 大限 / 流年 / 流月 / 流日</p><h1><CalendarDots size={28} aria-hidden="true" />运势日历</h1><p>{calendar?.conversationTitle || '选择日期，观察你的运势节律'}</p></div>
      <div className={styles.pageLinks}><Link href={`/chart/${conversationId}`}>返回命盘</Link><Link href="/chart/select?target=calendar">切换命盘</Link></div>
    </header>
    <fieldset className={styles.topics}><legend>解读主题</legend>{(Object.keys(CALENDAR_TOPICS) as CalendarTopic[]).map(item => <button type="button" key={item} aria-pressed={topic === item} onClick={() => selectTopic(item)}>{CALENDAR_TOPICS[item].label}</button>)}</fieldset>
    {calendar?.unknownTime && <p className={styles.notice}>出生时辰不详：当前按子时试排，时辰相关解读需要结合实际经历核对。</p>}
    <div className={styles.workspace}>
      <section className={styles.calendarPanel} aria-labelledby="calendar-month-heading">
        <div className={styles.monthToolbar}>
          <div><h2 id="calendar-month-heading">{month.slice(0, 4)} 年 {Number(month.slice(5))} 月</h2><p>北京时间 · 本月已保存 {savedCount} 份{CALENDAR_TOPICS[topic].label}解读</p></div>
          <div className={styles.monthButtons}>
            <button type="button" aria-label="上个月" disabled={!calendar || month <= calendar.minDate.slice(0, 7)} onClick={() => selectMonth(shiftCalendarMonth(month, -1))}><ArrowLeft size={17} /></button>
            <button type="button" aria-label="下个月" disabled={!calendar || month >= calendar.maxDate.slice(0, 7)} onClick={() => selectMonth(shiftCalendarMonth(month, 1))}><ArrowRight size={17} /></button>
            <button type="button" disabled={!calendar || calendar.today < calendar.minDate || calendar.today > calendar.maxDate} onClick={() => calendar && selectDate(calendar.today)}>今天</button>
          </div>
        </div>
        <label className={styles.monthJump}>跳转月份<input type="month" aria-label="跳转月份" value={month} min={calendar?.minDate.slice(0, 7)} max={calendar?.maxDate.slice(0, 7)} disabled={!calendar} onChange={event => event.target.value && selectMonth(event.target.value)} /></label>
        {monthError ? <div className={styles.state} role="alert"><p>{monthError}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>重新加载日历</button><Link href="/chart/select?target=calendar">选择其他命盘</Link></div> : monthLoading ? <div className={styles.calendarSkeleton} role="status" aria-label="正在加载月历">{Array.from({ length: 35 }, (_, i) => <span key={i} />)}</div> : <div role="grid" aria-labelledby="calendar-month-heading" className={styles.calendarGrid}>
          <div role="row" className={styles.week}><span role="columnheader">一</span><span role="columnheader">二</span><span role="columnheader">三</span><span role="columnheader">四</span><span role="columnheader">五</span><span role="columnheader">六</span><span role="columnheader">日</span></div>
          {weeks.map((week, weekIndex) => <div role="row" className={styles.week} key={weekIndex}>{week.map((day, index) => <div role="gridcell" key={day?.date ?? `empty-${index}`} aria-selected={day ? day.date === date : undefined} className={styles.cell}>{day && <button type="button" data-calendar-date={day.date} disabled={!day.available} tabIndex={day.date === date ? 0 : -1} className={`${styles.day} ${day.date === date ? styles.selectedDay : ''} ${day.date === calendar?.today ? styles.today : ''}`} onClick={() => selectDate(day.date)} onKeyDown={event => onDayKey(event, day)} aria-current={day.date === calendar?.today ? 'date' : undefined} aria-label={`${day.date}，农历${day.lunarMonthLabel}${day.lunarLabel}，${day.ganZhi}${day.reading?.status === 'completed' ? '，已保存解读' : ''}`}>
            <strong>{day.day}</strong><span>{day.lunarLabel}</span><small>{day.ganZhi}</small>{day.reading?.status === 'completed' ? <i className={styles.savedMark} aria-hidden="true" /> : day.reading?.status === 'generating' ? <i className={styles.pendingMark} aria-hidden="true" /> : null}
          </button>}</div>)}</div>)}
        </div>}
        <div className={styles.calendarLegend}><span><i className={styles.savedMark} />已保存当前主题解读</span><span><i className={styles.pendingMark} />生成中</span><span>方向键选日 · Page Up / Down 切月</span></div>
      </section>
      <section className={styles.detailPanel} aria-labelledby="calendar-detail-heading" aria-busy={dayLoading || pending}>
        <div className={styles.detailHeading}><div><p className={styles.eyebrow}>{CALENDAR_TOPICS[topic].label}观察</p><h2 id="calendar-detail-heading">{date || '选择一天'}</h2>{snapshot && <p>农历{snapshot.lunarDay.year}年{snapshot.lunarDay.monthLabel}{snapshot.lunarDay.dayLabel} · {snapshot.flowDay.ganZhi}日 · {snapshot.nominalAge}虚岁</p>}</div><span className={styles.readingLabel}>{reading?.status === 'completed' ? <><CheckCircle size={15} aria-hidden="true" />已保存</> : '紫微运势'}</span></div>
        {dayError ? <div role="alert" className={styles.state}><p>{dayError}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>重新加载当天运限</button></div> : dayLoading || !snapshot ? <div className={styles.detailSkeleton} role="status">正在读取当天运限…</div> : <>
          <dl className={styles.stages}>
            <div><dt>大限</dt><dd>{snapshot.decadal.periodKind === 'childhood' ? '童限 · 尚未进入首个大限' : snapshot.decadal.periodKind === 'unavailable' ? '超出已排大限' : `${snapshot.decadal.startAge ?? '—'}–${snapshot.decadal.endAge ?? '—'} 岁 · ${snapshot.decadal.nativePalaceName}`}</dd></div>
            <div><dt>流年</dt><dd>{snapshot.year.ganZhi} · {snapshot.flowYear.nativePalaceName}</dd></div>
            <div><dt>流月</dt><dd>{snapshot.flowMonth.ganZhi} · {snapshot.flowMonth.nativePalaceName}</dd></div>
            <div><dt>流日</dt><dd>{snapshot.flowDay.ganZhi} · {snapshot.flowDay.nativePalaceName}</dd></div>
          </dl>
          {reading?.status === 'completed' && reading.content ? <article className={styles.reading}>
            <p className={styles.summary}>{reading.content.summary}</p>
            {reading.content.sections.map(section => <section key={section.key}><h3>{READING_SECTIONS[section.key]}</h3><AiMarkdown text={section.content} /><details className={styles.evidence}><summary>查看本节依据（{section.evidenceIds.length}）</summary><ul>{section.evidenceIds.map(id => { const item = interpretationFacts?.evidence.find(entry => entry.id === id); return <li key={id}><strong>{item?.label ?? '未记录依据'}</strong><p>{item?.details ?? '该记录缺少依据详情'}</p></li>; })}</ul></details></section>)}
            <p className={styles.savedMeta}>保存于 {new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(reading.updatedAt))}（北京时间） · {reading.model}</p>
          </article> : <div className={styles.emptyReading}>
            <Sparkle size={30} weight="thin" aria-hidden="true" /><h3>{pending ? '正在整理当天解读' : reading?.status === 'failed' ? '这次解读尚未完成' : `看看这一天的${CALENDAR_TOPICS[topic].label}主题`}</h3>
            <p>{pending ? '生成完成后自动保存，可以在日历中回看。' : '结合本命、大限与当天运限，生成主题、关注点和行动建议。'}</p>
            <button type="button" className={styles.generateButton} disabled={pending} onClick={() => void generate()}>{pending ? '正在生成…' : reading?.status === 'failed' ? '重试生成解读' : `生成${CALENDAR_TOPICS[topic].label}解读`}</button>
          </div>}
          {generationError && <p className={styles.error} role="alert">{generationError}</p>}
          <details className={styles.evidence}><summary>当天宫位、四化与排盘依据</summary><p className={styles.boundary}>按所选公历日期的早子时观察；流月范围：{snapshot.lunarMonth.startDate}至{snapshot.lunarMonth.endDate}。</p><ul>{detail.facts.evidence.map(item => <li key={item.id}><strong>{item.label}</strong><p>{item.details}</p></li>)}</ul></details>
          <Link className={styles.continueLink} href={`/chart/${conversationId}/timeline?level=day&date=${date}`}>进入这一天的运限工作台 <ArrowRight size={15} aria-hidden="true" /></Link>
          <p className={styles.boundary}>传统命理解释供自我观察参考。宫位与四化是排盘依据，解读和行动建议由 AI 组织。</p>
        </>}
      </section>
    </div>
  </main>;
}
