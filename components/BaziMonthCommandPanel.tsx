'use client';

import { useId, useState } from 'react';
import type { BaziMonthCommandReview, BaziMonthCommandSegment } from '@/lib/bazi/month-command-types';
import styles from './BaziMonthCommandPanel.module.css';

const VIEWS = [
  { id: 'position', label: '分日定位' },
  { id: 'visibility', label: '司令与透藏' },
  { id: 'comparison', label: '月令对照' },
  { id: 'sources', label: '规则来源' },
] as const;
type View = typeof VIEWS[number]['id'];
const QUESTIONS = [
  { label: '追问分日定位', draft: '请按当前固定口径“三命通会主段·三十日定长观察”，核对人元司令分日的交节起止、观察时间、已过日时和命中分段；整日跨节或跨分段时保留全部候选，三十日后尾段不自动顺延，不推断吉凶。' },
  { label: '追问司令透藏', draft: '请按当前固定口径“三命通会主段·三十日定长观察”，分开解释司令原文、明确天干、表层同干位置、严格同干根与同五行支持；艮土、坤土、已土或巳土不擅自改成某个天干，时辰未知时不指定全日唯一十神，也不判断作用已经生效。' },
  { label: '追问月令对照', draft: '请按当前固定口径“三命通会主段·三十日定长观察”，并列核对分日司令、已存月柱实际藏干与原有调候月内分支；它们不能互相替代，不重排月柱、不改格局候选或最终喜忌。' },
] as const;

function elapsedLabel(seconds: number) {
  const whole = Math.floor(Math.abs(seconds));
  return `${seconds < 0 ? '−' : ''}${Math.floor(whole / 86400)}天${Math.floor(whole % 86400 / 3600)}小时${Math.floor(whole % 3600 / 60)}分${whole % 60}秒`;
}
function commandLabel(segment: BaziMonthCommandSegment) {
  return segment.stem === null ? `原文「${segment.sourceText}」 · 天干未定` : `${segment.stem}${segment.element}`;
}
function SegmentPosition({ segment, active = false }: { segment: BaziMonthCommandSegment; active?: boolean }) {
  return <article className={styles.segment} data-active={active}>
    <div className={styles.rowHeading}><h3>{segment.monthBranch}月 · {commandLabel(segment)}</h3><span className={styles.tag}>{active ? '已定位分段' : '观察范围候选'}</span></div>
    <p>源表原文：{segment.sourceText} · {segment.sourceDays}日。</p>
    <p className={styles.clock}>当前节月内起止：{segment.from} 至 {segment.untilExclusive}（结束不含）。</p>
    {segment.stem === null && <p className={styles.caution}>保留原文字样及{segment.element}行信息，不据此选定一个天干。</p>}
    <p className={styles.note}>{segment.note}</p>
  </article>;
}
function Locations({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? <ul className={styles.plainList}>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className={styles.note}>{empty}</p>;
}

export default function BaziMonthCommandPanel({ review, onAsk, asking = false }: { review?: BaziMonthCommandReview; onAsk?: (draft: string) => void; asking?: boolean }) {
  const id = useId();
  const [view, setView] = useState<View>('position');
  if (!review) return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h2 id={`${id}-title`}>人元司令与月令分日复核</h2></header>
    <p className={`${styles.note} ${styles.legacy}`}>这份记录尚未保存人元司令分日复核。原月柱、原调候与报告依据继续保留，回看不借用当前规则补算；新生成的报告会单独保存新增复核。</p>
  </section>;

  const candidates = review.segments.filter(segment => review.candidateSegmentIds.includes(segment.id) || segment.id === review.activeSegmentId);
  const hasPosition = review.status !== 'unsupported_clock' && review.status !== 'inconsistent_chart';
  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h2 id={`${id}-title`}>人元司令与月令分日复核</h2><p className={styles.policy}>{review.policyLabel}</p></header>
    <div className={styles.summary}><strong>{review.label}</strong><p>{review.detail}</p></div>
    {review.unknownTime && <p className={`${styles.caution} ${styles.scope}`}>时辰未知：按整个出生日期核对。跨交节或分段边界时保留多份候选；不把试排日主的十神当作全日唯一结果。</p>}
    <div className={styles.tabs} role="tablist" aria-label="人元司令复核视图">{VIEWS.map((item, index) => <button type="button" role="tab" key={item.id} id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}`} aria-selected={view === item.id} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
      setView(VIEWS[next].id);
      document.getElementById(`${id}-${VIEWS[next].id}-tab`)?.focus();
    }}>{item.label}</button>)}</div>

    <div className={styles.body} role="tabpanel" id={`${id}-position`} aria-labelledby={`${id}-position-tab`} hidden={view !== 'position'} tabIndex={0}>
      {review.observation && <p className={styles.clock}><strong>{review.observation.precision === 'day' ? '整日观察范围' : '已保存时间观察范围'}</strong>：{review.observation.from} 至 {review.observation.untilExclusive}（结束不含，{review.observation.timeZone}）。</p>}
      {!hasPosition && <p className={styles.caution}>当前不能定位分日司令，不根据日期片段或试排结果强选天干。</p>}
      <div className={styles.cards}>{review.months.map(month => <article key={`${month.branch}:${month.start}`} className={styles.segment}>
        <h3>{month.branch}月 · {month.startTerm}至{month.endTerm}</h3>
        <p className={styles.clock}>起：{month.start}<br />止：{month.untilExclusive}（结束不含，UTC+08:00）。</p>
        <p className={styles.note}>实际节月时长：{elapsedLabel(month.actualDurationSeconds)}。</p>
        <p className={styles.note}>观察范围距本次交节：{elapsedLabel(month.elapsedSecondsFrom)} 至 {elapsedLabel(month.elapsedSecondsUntilExclusive)}（后界不含）。</p>
        {month.uncoveredTail && <p className={styles.caution}>三十日后尾段：{month.uncoveredTail.from} 至 {month.uncoveredTail.untilExclusive}（结束不含）。{month.uncoveredTail.overlapsObservation ? '与观察范围相交，当前保留待核。' : '未命中本次观察范围，仍保留来源边界。'}不自动沿用末段。</p>}
      </article>)}</div>
      {hasPosition && candidates.length > 0 && <div className={styles.cards} aria-label="本次司令分段候选">{candidates.map(segment => <SegmentPosition key={segment.id} segment={segment} active={segment.id === review.activeSegmentId}/>)}</div>}
      {hasPosition && candidates.length === 0 && <p className={styles.note}>当前没有已保存的源表分段候选；尾段或未决状态继续保留，不补一个司令。</p>}
      <details className={styles.details}><summary>展开涉及节月的全部源表分段（{review.segments.length}段）</summary><div className={styles.detailBody}>
        <p className={styles.note}>源表按交节后定长三十日列段；短节月在下一节截断，长节月超过三十日的尾段另列待核。未命中分段同样完整保留。</p>
        <ul className={styles.segmentList}>{review.segments.map(segment => <li key={segment.id}>
          <div className={styles.rowHeading}><strong>{segment.monthBranch}月第{segment.order}段 · {commandLabel(segment)}</strong><span className={styles.tag}>{segment.overlapsObservation ? '命中观察范围' : '本次未命中'}</span></div>
          <p>原文：{segment.sourceText} · {segment.sourceDays}日；源表区间：交节后满{segment.fromDay}日至满{segment.untilDay}日前。</p>
          <p className={styles.clock}>{segment.from} 至 {segment.untilExclusive}（结束不含）。</p><p className={styles.note}>{segment.note}</p><p className={styles.ruleId}>分段依据：{segment.evidenceId}</p>
        </li>)}</ul>
      </div></details>
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-visibility`} aria-labelledby={`${id}-visibility-tab`} hidden={view !== 'visibility'} tabIndex={0}>
      <p className={styles.note}>源表分日、透出位置与藏根分别核对。位置已见不等于司令有效、成格或喜忌已定；日主同干只作参照，不算额外透出。</p>
      {!hasPosition || candidates.length === 0 ? <p className={styles.caution}>当前没有可定位的司令分段，不另造天干、十神或透藏结论。</p> : <div className={styles.cards}>{candidates.map(segment => <article className={styles.segment} key={segment.id}>
        <div className={styles.rowHeading}><h3>{segment.monthBranch}月 · {commandLabel(segment)}</h3><span className={styles.tag}>{segment.id === review.activeSegmentId ? '已定位分段' : '候选分段'}</span></div>
        <p>原文：{segment.sourceText} · 五行：{segment.element}。</p>
        <p>十神：{review.unknownTime ? '整日待核，不列唯一十神' : segment.tenGod ?? '原文天干未定，不列十神'}。</p>
        {segment.stem === null ? <p className={styles.caution}>源文未明确一个天干，不把{segment.element}行信息替换为严格同干的透藏、根气或格局匹配。</p> : <>
          {!review.unknownTime && segment.dayMasterSameStem && <p className={styles.note}>日主同干参照已见，不计为新增透出位置。</p>}
          <details className={styles.details}><summary>表层同干、严格藏根与同五行支持</summary><div className={styles.detailBody}>
            <h4>已存表层同干位置</h4><Locations items={segment.surface} empty={review.unknownTime ? '已知柱未见，缺时不能判全盘缺失。' : '原局表层未见此同干位置。'}/>
            <h4>严格同干藏根</h4><Locations items={segment.exactRoots} empty={review.unknownTime ? '已知柱未见，时柱仍待核。' : '已存藏干未见严格同干根。'}/>
            <h4>同五行其他藏干</h4><Locations items={segment.sameElementRoots} empty={review.unknownTime ? '已知柱未见，时柱仍待核。' : '已存藏干未见其他同五行位置。'}/>
            <p className={styles.note}>与实际月支藏干：{segment.monthHiddenMatch ? '严格同干位置已见' : '未匹配严格同干位置'}。这不替换月支的完整藏干。</p>
          </div></details>
        </>}
        <details className={styles.details}><summary>关联候选与分段依据</summary><div className={styles.detailBody}>
          {review.unknownTime ? <p>时辰未知，不把试排日主关联的十神或格局当作全日唯一结论。</p> : segment.stem === null ? <p>原文天干未定，不作严格同干或十神格局关联。</p> : segment.patternCandidates.length ? <><p className={styles.note}>仅列原有格局候选的关联位置，不改判成格。</p><ul className={styles.plainList}>{segment.patternCandidates.map(pattern => <li key={pattern.id}>{pattern.label}</li>)}</ul></> : <p className={styles.note}>当前未保存关联的格局候选，不据此证明没有其他取格可能。</p>}
          <p className={styles.note}>{segment.note}</p><p className={styles.ruleId}>分段依据：{segment.evidenceId}</p>
        </div></details>
      </article>)}</div>}
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-comparison`} aria-labelledby={`${id}-comparison-tab`} hidden={view !== 'comparison'} tabIndex={0}>
      <p className={styles.note}>{review.comparisons.note}</p>
      <div className={styles.cards}>
        <article className={styles.segment}><h3>月柱实际藏干 · {review.savedMonthBranch}月</h3><ul className={styles.plainList}>{review.comparisons.monthHiddenStems.map((stem, index) => <li key={`${stem.stem}:${index}`}><strong>{stem.stem}{stem.element}</strong> · {review.unknownTime ? '不列全日唯一十神' : stem.tenGod}</li>)}</ul><p className={styles.note}>这是已存月柱的藏干全集，不按分日司令替换、删减或重新排序。</p></article>
        <article className={styles.segment}><h3>本次分日司令候选</h3>{hasPosition && candidates.length ? <ul className={styles.plainList}>{candidates.map(segment => <li key={segment.id}>{segment.monthBranch}月 · {commandLabel(segment)}</li>)}</ul> : <p>当前未定位，保留原有未决说明。</p>}<p className={styles.note}>这是源表与观察范围的交集，不等于月支只藏此一干。</p></article>
        <article className={styles.segment}><h3>原调候月内分支</h3><p>{review.comparisons.climatePeriod.label}</p><p>原分支参考用干：{review.comparisons.climatePeriod.activeStems.join('、') || '当前未列唯一分支用干'}。</p><p className={styles.note}>{review.comparisons.climatePeriod.note}</p></article>
      </div>
      <p className={styles.notice}>三项各有来源与语义：司令分日不改排盘月柱，也不自动启用调候分支、取格、合化或最终喜忌。</p>
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-sources`} aria-labelledby={`${id}-sources-tab`} hidden={view !== 'sources'} tabIndex={0}>
      {review.sources.map(source => <details className={styles.source} key={source.id}><summary>{source.title}</summary><div className={styles.detailBody}><p>{source.note}</p><a href={source.url} target="_blank" rel="noopener noreferrer">查看人元司令原典来源</a><p className={styles.ruleId}>来源编号：{source.id}</p></div></details>)}
      <details className={styles.details}><summary>复核边界与保存版本</summary><div className={styles.detailBody}><ul className={styles.plainList}>{review.boundaries.map((boundary, index) => <li key={index}>{boundary}</li>)}</ul><p className={styles.ruleId}>复核版本：{review.version}</p><p className={styles.ruleId}>采用口径：{review.policy}</p></div></details>
    </div>
    {onAsk && <footer className={styles.footer}><div className={styles.actions}>{QUESTIONS.map(question => <button type="button" key={question.label} disabled={asking} onClick={() => onAsk(question.draft)}>{asking ? '正在进入对话…' : question.label}</button>)}</div><p className={styles.note}>进入对话后先核对草稿，再自行发送；已有输入不会被覆盖。</p></footer>}
  </section>;
}
