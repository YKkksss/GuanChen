'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { BAZI_ELEMENTS, type BaziElement } from '@/lib/bazi/types';
import type {
  PersonalElectionChartOption,
  PersonalElectionInput,
  PersonalElectionParticipantInput,
} from '@/lib/election/personal-types';
import styles from './ElectionPersonal.module.css';

const emptyParticipant = (): PersonalElectionParticipantInput => ({
  chartId: '', preferredElements: [], cautiousElements: [], basisNote: '',
});

const emptySettings = (): PersonalElectionInput => ({
  participants: [emptyParticipant()],
  avoidDayYearClash: false,
  avoidDayBranchClash: false,
  avoidHourYearClash: false,
  avoidHourBranchClash: false,
  filterStems: false,
  includeLuckContext: false,
});

const clashOptions = [
  ['avoidDayYearClash', '避开用事日冲年支'],
  ['avoidDayBranchClash', '避开用事日冲日支'],
  ['avoidHourYearClash', '避开用事时冲年支'],
  ['avoidHourBranchClash', '避开用事时冲日支'],
] as const;

function chartLabel(chart: PersonalElectionChartOption): string {
  return `${chart.displayName} · ${chart.pillars}${chart.unknownTime ? '（时辰未知）' : ''} · ${chart.policyLabel} · 版本 ${chart.chartId.slice(0, 8)}`;
}

export default function ElectionPersonalSettings({ value, onChange, disabled = false }: {
  value?: PersonalElectionInput;
  onChange: (value: PersonalElectionInput | undefined) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [charts, setCharts] = useState<PersonalElectionChartOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const filterRef = useRef<HTMLInputElement>(null);
  const enabled = value !== undefined;
  const participants = value?.participants ?? [];
  const hasElements = participants.some(p => p.preferredElements.length || p.cautiousElements.length);
  const emptyFilter = Boolean(value?.filterStems && !hasElements);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetch('/api/election/participants', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(body?.charts)) throw new Error(body?.error || '八字版本读取失败，请稍后重试');
        return body.charts as PersonalElectionChartOption[];
      })
      .then(items => { if (!controller.signal.aborted) { setCharts(items); setLoaded(true); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '八字版本读取失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [enabled, attempt]);

  useEffect(() => {
    filterRef.current?.setCustomValidity(emptyFilter ? '请先选择至少一项人工五行条件，或关闭日干、时干五行过滤' : '');
  }, [emptyFilter]);

  const updateParticipant = (index: number, patch: Partial<PersonalElectionParticipantInput>) => {
    if (!value) return;
    onChange({ ...value, participants: value.participants.map((p, i) => i === index ? { ...p, ...patch } : p) });
  };
  const chooseElement = (index: number, field: 'preferredElements' | 'cautiousElements', element: BaziElement) => {
    const participant = participants[index];
    const other = field === 'preferredElements' ? 'cautiousElements' : 'preferredElements';
    const elements = participant[field].includes(element) ? participant[field].filter(e => e !== element) : BAZI_ELEMENTS.filter(e => participant[field].includes(e) || e === element);
    updateParticipant(index, { [field]: elements, [other]: participant[other].filter(e => e !== element) });
  };

  return <section className={styles.settings} aria-labelledby={`${id}-heading`}>
    <div className={styles.heading}>
      <h3 id={`${id}-heading`}>个人化择日</h3>
      <label className={styles.checkbox}>
        <input type="checkbox" checked={enabled} disabled={disabled} aria-controls={enabled ? `${id}-body` : undefined} onChange={event => onChange(event.target.checked ? emptySettings() : undefined)} />
        加入个人八字条件
      </label>
    </div>
    <p className={styles.note}>逐人核对用事日、时与已保存四柱的关系；只有勾选的条件才参与排除，不按合冲数量打分。</p>
    {value && <fieldset id={`${id}-body`} className={styles.controls} disabled={disabled}>
      <legend className={styles.srOnly}>个人八字与筛选条件</legend>
      {loading && <p role="status" className={styles.note}>正在读取当前账号的八字版本…</p>}
      {error && <div role="alert" className={styles.error}><p>{error}</p><button type="button" onClick={() => setAttempt(n => n + 1)}>重试读取八字</button></div>}
      {loaded && !loading && !error && !charts.length && <p className={styles.notice}>还没有可用的八字版本。请先到 <Link href="/bazi">八字排盘</Link> 保存命盘，再回到这里刷新版本列表。</p>}
      <div className={styles.toolbar}>
        <span className={styles.note}>最近 200 个已保存版本，可选本人或两位不同档案的参与者。</span>
        <button type="button" className={styles.textButton} disabled={loading} onClick={() => setAttempt(n => n + 1)}>刷新版本列表</button>
      </div>
      <div className={styles.participants}>
        {participants.map((participant, index) => {
          const current = charts.find(c => c.chartId === participant.chartId);
          const otherProfiles = new Set(participants.filter((_, i) => i !== index).map(p => charts.find(c => c.chartId === p.chartId)?.profileId).filter(Boolean));
          const duplicateProfile = Boolean(current && otherProfiles.has(current.profileId));
          const unavailable = Boolean(loaded && !loading && !error && participant.chartId && !current);
          const hasManual = Boolean(participant.preferredElements.length || participant.cautiousElements.length);
          return <fieldset className={styles.participant} key={index}>
            <legend>参与者 {index + 1}</legend>
            <label className={styles.field}>
              参与者 {index + 1} 的八字版本
              <select required aria-describedby={`${id}-source-${index}`} value={participant.chartId} onChange={event => {
                const next = charts.find(c => c.chartId === event.target.value);
                const samePerson = Boolean(current && next && current.profileId === next.profileId);
                updateParticipant(index, samePerson ? { chartId: event.target.value } : { ...emptyParticipant(), chartId: event.target.value });
              }} ref={node => { node?.setCustomValidity(unavailable ? '此八字来源已不在可选列表中，请重新选择' : duplicateProfile ? '两位参与者必须来自不同的八字档案' : ''); }}>
                <option value="">请选择八字版本</option>
                {participant.chartId && !current && <option value={participant.chartId}>原八字版本（请核对来源）</option>}
                {charts.map(chart => <option key={chart.chartId} value={chart.chartId} disabled={otherProfiles.has(chart.profileId)}>{chartLabel(chart)}</option>)}
              </select>
            </label>
            <p id={`${id}-source-${index}`} className={unavailable || duplicateProfile ? styles.errorText : styles.note}>
              {unavailable ? '原八字版本已删除或不在最近 200 个可选版本内，请重新选择。原设置仍保留，不会自动退回普通择日。' : duplicateProfile ? '同一档案的不同排盘版本不能当作两位参与者，请重新选择。' : current ? `${current.pillars} · ${current.policyLabel}${current.unknownTime ? '。时辰未知，不补造时柱。' : '。按所选版本四柱核对。'}` : '仅列出当前账号最近 200 个已保存版本。请按姓名、四柱与时间口径确认。'}
            </p>
            <details className={styles.manual} open={hasManual || Boolean(participant.basisNote) ? true : undefined}>
              <summary>人工确认的五行条件（可选）</summary>
              <p className={styles.note}>仅填写已有明确依据的条件。调候候选仅供参考，不会自动作为确定喜用；此处比较的只是用事日干、时干五行。</p>
              <div className={styles.elementGroups}>
                <fieldset className={styles.elements}><legend>偏好五行 · 选中任一</legend>{BAZI_ELEMENTS.map(element => <label key={element} className={styles.checkbox}><input type="checkbox" checked={participant.preferredElements.includes(element)} onChange={() => chooseElement(index, 'preferredElements', element)} />{element}</label>)}</fieldset>
                <fieldset className={styles.elements}><legend>谨慎五行 · 避开所选</legend>{BAZI_ELEMENTS.map(element => <label key={element} className={styles.checkbox}><input type="checkbox" checked={participant.cautiousElements.includes(element)} onChange={() => chooseElement(index, 'cautiousElements', element)} />{element}</label>)}</fieldset>
              </div>
              <label className={styles.field}>条件依据{hasManual ? '（必填）' : '（选填）'}<textarea required={hasManual} maxLength={200} rows={2} value={participant.basisNote} ref={node => { node?.setCustomValidity(hasManual && !participant.basisNote.trim() ? '填写人工五行条件后，请说明依据，不能只输入空格' : ''); }} onChange={event => updateParticipant(index, { basisNote: event.target.value })} placeholder="写明人工复核依据或来源，最多 200 字" /></label>
              <p className={styles.note}>同一五行不能同时属于偏好与谨慎；选择时会从另一组取消。</p>
            </details>
            {participants.length > 1 && <button type="button" className={styles.textButton} aria-label={`移除参与者 ${index + 1}`} onClick={() => onChange({ ...value, participants: participants.filter((_, i) => i !== index) })}>移除这位参与者</button>}
          </fieldset>;
        })}
      </div>
      {participants.length < 2 && <button type="button" className={styles.secondary} onClick={() => onChange({ ...value, participants: [...participants, emptyParticipant()] })}>添加第二位参与者</button>}
      <fieldset className={styles.clashes}><legend>明确需要避开的相冲</legend>{clashOptions.map(([key, label]) => <label key={key} className={styles.checkbox}><input type="checkbox" checked={value[key]} onChange={event => onChange({ ...value, [key]: event.target.checked })} />{label}</label>)}</fieldset>
      <p className={styles.note}>以上条件对每位参与者分别核对；未勾选的关系仍展示依据，但不会自动排除。</p>
      <label className={styles.checkbox}><input ref={filterRef} type="checkbox" checked={value.filterStems} aria-describedby={`${id}-element-filter`} onChange={event => onChange({ ...value, filterStems: event.target.checked })} />按人工条件过滤用事日干、时干五行</label>
      <p id={`${id}-element-filter`} className={emptyFilter ? styles.errorText : styles.note}>{emptyFilter ? '请至少填写一项偏好或谨慎五行，或关闭此过滤。' : value.filterStems ? '有人工条件的参与者须分别满足；有偏好时须命中其中一项，有谨慎时须避开所选。它不代表整日、整时的五行判断。' : '默认只展示人工条件的核对结果，不据此排除日期或时段。'}</p>
      <div className={styles.luckSetting}>
        <label className={styles.checkbox}><input type="checkbox" checked={value.includeLuckContext === true} aria-describedby={`${id}-luck-context`} onChange={event => onChange({ ...value, includeLuckContext: event.target.checked })} />加入岁运背景复核</label>
        <p id={`${id}-luck-context`} className={styles.note}>按用事时点分段查看大运、流年、流月与原局及用事干支的关系，仅补充背景，不参与日期或时段排除，也不自动推断喜忌、吉凶。时辰未知或排盘口径不适用时，会说明精确大运归属受限的原因。</p>
      </div>
    </fieldset>}
  </section>;
}
