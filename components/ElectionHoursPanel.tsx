'use client';
import { useEffect, useState } from 'react';
import { ELECTION_MODES, ELECTION_STATUSES, type ElectionInput } from '@/lib/election/types';
import type { ElectionHours, ElectionHourSlot, ElectionTimeSelection } from '@/lib/election/hours-types';
import styles from './ElectionWorkspace.module.css';
import { PersonalAssessmentFacts } from './ElectionPersonalFacts';

export function HourFacts({ slot }: { slot: ElectionHourSlot }) {
  return <>
    <p>{slot.timeGanZhi}时 · 时冲{slot.chong} · 煞{slot.sha}</p>
    <p className={styles.note}>{slot.tianShen}（{slot.tianShenType}、{slot.tianShenLuck}），仅展示历法标签，不单独决定候选。</p>
    <p>时宜：{slot.yi.join('、') || '无记录'}</p><p>时忌：{slot.ji.join('、') || '无记录'}</p>
    <ul>{slot.reasons.map((r,i) => <li key={i}>{r}</li>)}</ul>
    {slot.baseStatus && <p className={styles.note}>个人条件之前的黄历状态：{ELECTION_STATUSES[slot.baseStatus]}。</p>}
    {slot.personal && <details className={styles.evidence}><summary>个人日时条件与原局关系</summary><PersonalAssessmentFacts assessment={slot.personalDay}/><PersonalAssessmentFacts assessment={slot.personal}/></details>}
    <details className={styles.evidence}><summary>日时取舍依据</summary>
      <p>公历日干支：{slot.civilDayGanZhi}；时宜忌所用日干支：{slot.timeRuleDayGanZhi}；精确节令月：{slot.monthGanZhi}。</p>
      {slot.lateZi && <p className={styles.caution}>晚子时从23点开始，时规则已换到次日日干支，日宜忌仍取本公历日；保留差异，不能当作无条件吉时。</p>}
      {slot.dayRules.map(r => <div key={r.mode}><h4>{ELECTION_MODES[r.mode]} · {r.selected ? '参与筛选' : '仅供对照'}</h4><p>月干支：{r.monthGanZhi}。{r.reason}</p><p>日宜：{r.yi.join('、')}</p><p>日忌：{r.ji.join('、')}</p></div>)}
    </details>
  </>;
}
export default function ElectionHoursPanel({ input, date, selected, disabled, onToggle, planId }: {
  input: ElectionInput; date: string; selected: ElectionTimeSelection[]; disabled: boolean; onToggle: (choice: ElectionTimeSelection) => void; planId?: string;
}) {
  const [open,setOpen] = useState(false), [hours,setHours] = useState<ElectionHours|null>(null), [error,setError] = useState(''), [loading,setLoading] = useState(false), [attempt,setAttempt] = useState(0), [onlyCandidates,setOnlyCandidates] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController(); setLoading(true); setError(''); setHours(null);
    void fetch('/api/election/hours',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(planId ? {planId,date} : {input,date}), signal:c.signal, cache:'no-store' })
      .then(async r => { const v = await r.json().catch(() => null); if (!r.ok || !v?.hours) throw new Error(v?.error || '时辰读取失败，请稍后重试'); return v.hours as ElectionHours; })
      .then(v => { if (!c.signal.aborted) setHours(v); })
      .catch(e => { if (!c.signal.aborted) setError(e instanceof Error ? e.message : '时辰读取失败'); })
      .finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  },[open,date,input,attempt,planId]);
  return <section className={`${styles.card} ${styles.hoursSection}`} aria-label="择日吉时">
    <div className={styles.reportHeading}><div><h2>{date} · 择日吉时</h2><p className={styles.note}>查看各时段宜忌与实际日时依据，再保存准备采用的时段。</p></div><button className={styles.secondary} type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? '收起当日时辰' : '查看当日时辰'}</button></div>
    {open && <>
      <p className={styles.note}>北京时间；区间包含开始、不含结束，24:00为次日零点。十二时辰在本公历日拆为早子、晚子共13段；节令月交接时进一步分段。</p>
      {loading && <p role="status">正在核对当日时辰…</p>}
      {error && <p role="alert" className={styles.error}>{error}<button type="button" onClick={() => setAttempt(v => v+1)}>重试时辰查询</button></p>}
      {hours && <>
        {hours.transitionAt && <p className={styles.caution}>本日 {hours.transitionAt} 切换节令月，交界两侧分别展示依据，不沿用正午代表值。</p>}
        <label className={`${styles.checkbox} ${styles.search}`}><input type="checkbox" checked={onlyCandidates} onChange={e => setOnlyCandidates(e.target.checked)}/>只看日时共同候选</label>
        <div className={styles.hourGrid}>{hours.slots.filter(s => !onlyCandidates || s.status === 'candidate').map(slot => {
          const chosen = selected.some(t => t.date === date && t.slotId === slot.id);
          return <article className={styles.hourCard} key={slot.id} aria-label={`${date} ${slot.start} ${slot.label}`}>
            <div className={styles.reportHeading}><h3>{slot.label} · {slot.timeGanZhi}</h3><span className={styles.badge}>{ELECTION_STATUSES[slot.status]}</span></div>
            <p className={styles.hourRange}>{slot.start}–{slot.end}</p>{slot.splitAtTerm && <p className={styles.note}>节令月交界分段</p>}
            <HourFacts slot={slot}/>
            <button type="button" className={chosen ? styles.primary : styles.secondary} disabled={disabled} aria-pressed={chosen} aria-label={`${chosen ? '取消' : '选择'}时段 ${date} ${slot.start}`} onClick={() => onToggle({date,slotId:slot.id,version:hours.version,source:hours.source,policy:hours.policy,slot})}>{chosen ? '已选 · 点击取消' : '选择这个时段'}</button>
          </article>;
        })}</div>
        {onlyCandidates && !hours.slots.some(s => s.status === 'candidate') && <p className={styles.empty}>当前日期没有日时共同候选。取消筛选可查看待核、未列明和排除依据。</p>}
        <p className={styles.note}>{hours.policy} 方案中的生肖条件仅排除日冲，时冲在各卡片展示，不暗中追加排除规则。</p>
        <a href={hours.source} target="_blank" rel="noopener noreferrer">查看时辰历法来源</a>
      </>}
    </>}
  </section>;
}
