'use client';

import { useId, useState } from 'react';
import type { BaziMonthIntakeObstruction, BaziMonthIntakeReview } from '@/lib/bazi/month-intake-types';
import styles from './BaziMonthCommandPanel.module.css';

const VIEWS = [
  { id: 'routes', label: '本气与透干' },
  { id: 'meetings', label: '会支与缺字' },
  { id: 'conditions', label: '阻碍并列' },
  { id: 'sources', label: '规则来源' },
] as const;
type View = typeof VIEWS[number]['id'];
const QUESTIONS = [
  { label: '追问透干分流', draft: '请按《子平真诠》用神变化与杂气取用的窄条目，并列核对月支本气、他藏未透、单透和多透的入口：只按年、月、时天干同干位置记录，日主同干只作参照，不按透出次数排名，也不直接裁定取用或喜忌。' },
  { label: '追问会支来源', draft: '请按当前保存的月令取用入口复核，核对含月支的完整三合、三会只指向哪一五行；缺字组、六合、月支六冲与五行相克分别保留，不把缺字说成完整会支，不给会支指定阴阳天干，也不宣告已经合化或成局。' },
  { label: '追问阻碍与去留', draft: '请解释当前入口与阻碍为何只能并列：本气、透干、会支和相冲、六合、天干五合、五行相克同时出现时，哪些条件仍待核，为什么不能据此裁决去留、解冲、破局、格局成败或唯一喜忌。' },
] as const;

const OBSTRUCTION_LABELS: Record<BaziMonthIntakeObstruction['kind'], string> = {
  month_branch_clash: '月支六冲',
  surface_stem_combine: '天干五合',
  element_opposition: '五行相克',
};

function Locations({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? <ul className={styles.plainList}>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className={styles.note}>{empty}</p>;
}

export default function BaziMonthIntakePanel({ review, onAsk, asking = false }: { review?: BaziMonthIntakeReview; onAsk?: (draft: string) => void; asking?: boolean }) {
  const id = useId();
  const [view, setView] = useState<View>('routes');
  if (!review) return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h2 id={`${id}-title`}>月令取用入口复核</h2></header>
    <p className={`${styles.note} ${styles.legacy}`}>这份记录尚未保存月令取用入口复核。原本气、透干、会支、格局候选与报告依据继续保留，回看不借用当前规则补算；新生成的报告会单独保存新增入口层。</p>
  </section>;

  const complete = review.meetings, incomplete = review.incompleteMeetings;
  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h2 id={`${id}-title`}>月令取用入口复核</h2><p className={styles.policy}>{review.policyLabel}</p></header>
    <div className={styles.summary}><strong>{review.label}</strong><p>{review.detail}</p></div>
    {review.unknownTime && <p className={`${styles.caution} ${styles.scope}`}>时辰未知：时柱可能补充透干位置或会支组合。已知柱未见不等于缺失，十神不列全日唯一值，入口候选整体降级。</p>}
    <div className={styles.tabs} role="tablist" aria-label="月令取用入口视图">{VIEWS.map((item, index) => <button type="button" role="tab" key={item.id} id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}`} aria-selected={view === item.id} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
      setView(VIEWS[next].id);
      document.getElementById(`${id}-${VIEWS[next].id}-tab`)?.focus();
    }}>{item.label}</button>)}</div>

    <div className={styles.body} role="tabpanel" id={`${id}-routes`} aria-labelledby={`${id}-routes-tab`} hidden={view !== 'routes'} tabIndex={0}>
      <p className={styles.note}>本气入口始终保留；他藏未透只作候选，单透与多透只记录同干位置。通根、透出次数、入口条数都不等于取用结论，日干同干只作参照。</p>
      <div className={styles.cards}>{review.routes.map(route => <article className={styles.segment} key={route.id} data-active={route.entry !== 'hidden_candidate'}>
        <div className={styles.rowHeading}><h3>{route.stem}{route.element} · {route.entryLabel}</h3><span className={styles.tag}>{route.sourceQiLabel} · {route.transparencyLabel}</span></div>
        <p>十神：{review.unknownTime ? '时辰未知，不列全日唯一值' : route.tenGod ?? '未定'}。</p>
        <p className={styles.clock}>年、月、时同干位置：{route.positions.join('、') || '未见'}。</p>
        {route.dayMasterSameStem && <p className={styles.note}>日干同干参照已见，不计为新增透出位置。</p>}
        <p className={styles.note}>{route.note}</p>
        <details className={styles.details}><summary>透藏条件与同源格局候选</summary><div className={styles.detailBody}>
          <Locations items={route.pending} empty="本清单未见额外条件。" />
          {route.patternCandidates.length ? <><h4>原有格局候选（同源干）</h4><ul className={styles.plainList}>{route.patternCandidates.map(item => <li key={item.id}>{item.label}</li>)}</ul><p className={styles.note}>只链接现有候选，不据此判成格或另取一格。</p></> : <p className={styles.note}>当前未保存同源格局候选，不据此证明没有其他取格可能。</p>}
          <p className={styles.ruleId}>入口依据：{route.evidenceId}</p>
        </div></details>
      </article>)}</div>
      <p className={styles.notice}>本层并列 {review.counts.hiddenRoutes} 条藏干路径：单透 {review.counts.singleTransparent}、多透 {review.counts.multipleTransparent}、未透 {review.counts.notTransparent}。不按数量排序、计分或选唯一入口。</p>
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-meetings`} aria-labelledby={`${id}-meetings-tab`} hidden={view !== 'meetings'} tabIndex={0}>
      <p className={styles.note}>只有含月支且三支齐见的三合、三会才列为会支入口。目标只记录五行，不指定阴阳天干；六合、缺字与冲克单列，不冒充完整会支。</p>
      <h3>完整会支入口（{complete.length}）</h3>
      {complete.length ? <div className={styles.cards}>{complete.map(meeting => <article className={styles.segment} key={meeting.id} data-active="true">
        <div className={styles.rowHeading}><h3>{meeting.label}</h3><span className={styles.tag}>完整{meeting.typeLabel}</span></div>
        <p>三支：{meeting.branches.join('、')}；目标只到 {meeting.targetElement}，不指定具体天干。</p>
        <p className={styles.note}>{meeting.note}</p><p className={styles.ruleId}>入口依据：{meeting.evidenceId}</p>
      </article>)}</div> : <p className={styles.note}>本清单未见含月支且三支齐见的三合或三会，不补组局。</p>}
      <h3 style={{ marginTop: 14 }}>缺字与六合（单列）</h3>
      {incomplete.length || review.sixCombines.length ? <div className={styles.cards}>
        {incomplete.map(meeting => <article className={styles.segment} key={meeting.id}>
          <div className={styles.rowHeading}><h3>{meeting.label}</h3><span className={styles.tag}>缺字条件</span></div>
          <p>已见：{meeting.observedBranches.join('、')}；缺：{meeting.missingBranches.join('、')}。</p>
          <p className={styles.note}>{meeting.note}</p><p className={styles.ruleId}>条件依据：{meeting.evidenceId}</p>
        </article>)}
        {review.sixCombines.map(item => <article className={styles.segment} key={item.id}>
          <div className={styles.rowHeading}><h3>{item.label}</h3><span className={styles.tag}>六合单列</span></div>
          <p>月支与{item.partner}六合并见。</p><p className={styles.note}>{item.note}</p><p className={styles.ruleId}>条件依据：{item.evidenceId}</p>
        </article>)}
      </div> : <p className={styles.note}>本清单未见缺字组合或六合条件。</p>}
      <p className={styles.notice}>会支指向的五行不是已化之干；缺字、六合和相冲不能被拼成完整会局，也不能替代月令本气。</p>
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-conditions`} aria-labelledby={`${id}-conditions-tab`} hidden={view !== 'conditions'} tabIndex={0}>
      <p className={styles.note}>入口与阻碍同时出现时只作并列条件：不自动抵消、不裁优先级，也不宣告合化、合去、解冲、破局或格局成败。</p>
      {review.obstructions.length ? <div className={styles.cards}>{review.obstructions.map(item => <article className={styles.segment} key={item.id}>
        <div className={styles.rowHeading}><h3>{item.label}</h3><span className={styles.tag}>{OBSTRUCTION_LABELS[item.kind]} · 待核</span></div>
        <p>{item.detail}</p>
        <p className={styles.note}>关联入口：{item.relatedRouteIds.length ? item.relatedRouteIds.join('、') : '未指定'}；关联会支：{item.relatedMeetingIds.length ? item.relatedMeetingIds.join('、') : '未指定'}。</p>
        <p className={styles.ruleId}>条件依据：{item.evidenceId}</p>
      </article>)}</div> : <p className={styles.note}>本清单未见月支六冲、天干五合或入口与会支的五行相克条件。</p>}
      <p className={styles.notice}>阻碍条件只说明结构并见；是否去留、能否解冲或是否改变取用，仍需后续窄规则校勘，本层不裁。</p>
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-sources`} aria-labelledby={`${id}-sources-tab`} hidden={view !== 'sources'} tabIndex={0}>
      {review.sources.map(source => <details className={styles.source} key={source.id}><summary>{source.title}</summary><div className={styles.detailBody}><p>{source.note}</p><a href={source.url} target="_blank" rel="noopener noreferrer">查看《子平真诠》原典来源</a><p className={styles.ruleId}>来源编号：{source.id}</p></div></details>)}
      <details className={styles.details}><summary>复核边界与保存版本</summary><div className={styles.detailBody}><ul className={styles.plainList}>{review.boundaries.map((boundary, index) => <li key={index}>{boundary}</li>)}</ul><p className={styles.ruleId}>复核版本：{review.version}</p><p className={styles.ruleId}>采用口径：{review.policy}</p><p className={styles.ruleId}>已保存月支藏干：{review.monthHiddenStems.map(item => `${item.stem}${item.element}`).join('、')}</p></div></details>
      <p className={styles.notice}>本层只校勘两个窄条目；完整用神变化、五合去留、合化效力和最终喜忌仍需后续分别校勘，不能据本页作完整裁决。</p>
    </div>
    {onAsk && <footer className={styles.footer}><div className={styles.actions}>{QUESTIONS.map(question => <button type="button" key={question.label} disabled={asking} onClick={() => onAsk(question.draft)}>{asking ? '正在进入对话…' : question.label}</button>)}</div><p className={styles.note}>进入对话后先核对草稿，再自行发送；已有输入不会被覆盖。</p></footer>}
  </section>;
}
