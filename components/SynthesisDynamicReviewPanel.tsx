'use client';

import { useId, useState } from 'react';
import { BRANCHES } from '@/lib/ziwei/constants';
import { SYNTHESIS_TOPICS } from '@/lib/synthesis/types';
import type { SynthesisDynamicReview, SynthesisTopicAnchor } from '@/lib/synthesis/dynamic-review-types';
import styles from './SynthesisDynamicReviewPanel.module.css';

const VIEWS = [
  { id: 'ziwei', label: '紫微主题' },
  { id: 'bazi', label: '八字关系' },
  { id: 'parallel', label: '双侧并列' },
  { id: 'sources', label: '规则来源' },
] as const;
type View = typeof VIEWS[number]['id'];
const LAYERS = { natal: '原局', luck_cycle: '大运', annual: '流年', month: '流月', day: '流日' } as const;
const POSITIONS = { direct: '同宫', opposite: '对宫', trine: '三方' } as const;

function Anchor({ anchor }: { anchor: SynthesisTopicAnchor }) {
  return <div className={styles.anchorRow}><strong>{anchor.topicPalace} · {BRANCHES[anchor.branch] ?? '地支待核'}位</strong><span>对应本命{anchor.nativePalaceName}</span></div>;
}

function Boundaries({ items, label }: { items: string[]; label: string }) {
  return <details className={styles.details}><summary>{label}</summary><div className={styles.detailBody}><ul className={styles.plainList}>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div></details>;
}

export default function SynthesisDynamicReviewPanel({ review }: { review?: SynthesisDynamicReview }) {
  const id = useId();
  const [view, setView] = useState<View>('ziwei');
  if (!review) return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h2 id={`${id}-title`}>动态双盘作用条件复核</h2></header>
    <p className={`${styles.note} ${styles.legacy}`}>这份阶段快照保存时未包含主题位置与跨层关系复核。原阶段依据和报告继续保留，回看不补算本轮条件。</p>
  </section>;

  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><div><h2 id={`${id}-title`}>动态双盘作用条件复核</h2><p className={styles.note}>{SYNTHESIS_TOPICS[review.topic].label} · 观察时刻 {review.observation.replace('T', ' ')} · UTC+08:00</p></div></header>
    <p className={`${styles.note} ${styles.scope}`}>{review.scope}</p>
    {review.status === 'birth_time_unconfirmed' && <div className={styles.notice} role="note" aria-label="个人适用条件未确认"><strong>出生时刻条件未确认，撤回个人适用判断</strong><p>下列保存的历法、位置与形式关系仅供复核，不能据此认定该阶段已适用于本人。</p></div>}
    {(review.status === 'partial_unknown_time' || review.ziwei.referenceOnly) && <div className={styles.notice} role="note" aria-label="未知时辰参考范围"><strong>出生时辰未知，紫微仅为试排参考</strong><p>八字不补时柱；精确大运是否可用以保存的阶段依据为准。主题位置与关系不能消除出生资料的不确定性。</p></div>}
    <div role="tablist" aria-label="动态双盘条件复核视图" className={styles.tabs}>{VIEWS.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}`} aria-selected={view === item.id} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
      setView(VIEWS[next].id);
      document.getElementById(`${id}-${VIEWS[next].id}-tab`)?.focus();
    }}>{item.label}</button>)}</div>

    <div role="tabpanel" id={`${id}-ziwei`} aria-labelledby={`${id}-ziwei-tab`} className={styles.body} hidden={view !== 'ziwei'} tabIndex={0}>
      <p className={styles.note}>分别保留本命主题宫与本阶段主题宫的锚点。四化的位置关系只表示检出条件，不换算为主题分数。</p>
      {review.ziwei.referenceOnly && <p className={styles.mark}>以下紫微位置均为未知时辰试排，不能作为已确认的个人宫位。</p>}
      {review.ziwei.layers.map(layer => <section key={layer.level} className={styles.layer} aria-label={`${layer.label}主题条件`}>
        <div className={styles.layerHeading}><h3>{layer.label}</h3></div>
        <div className={styles.anchors}>{([{ reference: 'natal_topic', label: '本命主题锚点' }, { reference: 'dynamic_topic', label: '本阶段主题锚点' }] as const).map(group => <div key={group.reference}><h4>{group.label}</h4><ul className={styles.plainList}>{layer.anchors.filter(anchor => anchor.reference === group.reference).map((anchor, index) => <li key={`${anchor.topicPalace}:${anchor.branch}:${index}`}><Anchor anchor={anchor}/></li>)}</ul></div>)}</div>
        <details className={styles.details}><summary>逐项四化与主题位置关系 · {layer.transformations.length}项</summary><div className={styles.detailBody}><ul className={styles.list} aria-label={`${layer.label}位置复核`}>{layer.transformations.map((transform, index) => <li key={`${transform.evidenceId}:${index}`}>
          <div className={styles.rowHeading}><h4>{transform.starName}化{transform.type}</h4><span className={styles.note}>{transform.located && transform.natalPalaceBranch !== null ? `${BRANCHES[transform.natalPalaceBranch] ?? '地支待核'}位 · 本命${transform.natalPalaceName ?? '宫名待核'}` : '本命落宫尚未定位'}</span></div>
          {transform.hits.length ? <ul className={styles.plainList}>{transform.hits.map((hit, hitIndex) => <li key={`${hit.reference}:${hit.topicPalace}:${hit.branch}:${hitIndex}`}><strong>{hit.reference === 'natal_topic' ? '本命' : '阶段'}{hit.topicPalace} · {POSITIONS[hit.relation]}</strong><p className={styles.note}>锚点{BRANCHES[hit.branch] ?? '地支待核'}位，对应本命{hit.nativePalaceName}；同一位置在不同主题身份下分别保留，不累加权重。</p></li>)}</ul> : <p className={styles.note}>{transform.located ? '本版未列出与主题锚点的同宫、对宫或三方关系；这里只说明位置复核未命中。' : '落宫未确认，不补造主题位置命中。'}</p>}
          <span className={styles.ruleId}>依据编号：{transform.evidenceId}</span>
        </li>)}</ul></div></details>
      </section>)}
      <Boundaries items={review.ziwei.boundaries} label="紫微主题复核范围"/>
    </div>

    <div role="tabpanel" id={`${id}-bazi`} aria-labelledby={`${id}-bazi-tab`} className={styles.body} hidden={view !== 'bazi'} tabIndex={0}>
      <h3>原局与岁运节点</h3><p className={styles.note}>节点和关系按当前固定阶段保留。缺少时柱或大运边界时，不用其他柱补齐。</p>
      {review.bazi.nodes.length ? <ul className={styles.nodeList} aria-label="八字原局岁运节点">{review.bazi.nodes.map(node => <li key={node.id}><strong>{node.label} · {node.ganZhi}</strong><span>{LAYERS[node.layer]}</span></li>)}</ul> : <p className={styles.note}>当前快照未记录可用的个人原局岁运节点，不在页面补算。</p>}
      <h3>表干与藏干的主题角色</h3><p className={styles.note}>“本主题标签”来自本版主题目录，只表示十神形式角色。藏干另列，不把藏干标签当作表干，也不据标签判定喜忌或作用效力。</p>
      {review.bazi.topicRoles.length ? <ul className={styles.list} aria-label="八字阶段主题角色">{review.bazi.topicRoles.map(role => <li key={role.key}><div className={styles.rowHeading}><h4>{role.label} · {role.ganZhi}</h4></div><p>表干十神：{role.stemTenGod}{role.matchesTopic && <span className={styles.mark}> · 本主题标签</span>}</p><div className={styles.hiddenRoles}><p className={styles.note}>地支藏干</p>{role.hiddenStems.length ? <ul className={styles.roles}>{role.hiddenStems.map((stem, index) => <li key={`${stem.stem}:${index}`}>{stem.stem} · {stem.tenGod}{stem.matchesTopic && <span className={styles.mark}>本主题标签</span>}</li>)}</ul> : <p className={styles.note}>未记录藏干角色。</p>}</div></li>)}</ul> : <p className={styles.note}>当前快照未列阶段主题角色，保留上方适用限制。</p>}
      <details className={styles.details}><summary>完整跨层干支关系 · {review.bazi.relations.length}条（不计吉凶分数）</summary><div className={styles.detailBody}>
        <p className={styles.note}>所有关系逐条保留。检出相生、相克、合冲刑害或成员齐全的结构，都不等于已经合化、有效或应验。</p>
        {review.bazi.relations.length ? <ul className={styles.list} aria-label="完整八字跨层关系">{review.bazi.relations.map((relation, index) => <li key={`${relation.evidenceId}:${index}`}><div className={styles.rowHeading}><h4>{relation.label}</h4><span className={styles.note}>{relation.domain === 'stem' ? '天干' : '地支'} · {relation.conclusion === 'detected_not_transformed' ? '检出条件，未判合化' : '检出形式关系'}</span></div>
          <ul className={styles.participants}>{relation.participants.map((participant, participantIndex) => <li key={`${participant.id}:${participantIndex}`}>{LAYERS[participant.layer]} · {participant.label} · {participant.symbol}{participant.element}</li>)}</ul><p className={styles.note}>{relation.detail}</p>{relation.targetElement && <p className={styles.note}>规则目录所列五行：{relation.targetElement}；不表示已成化。</p>}<span className={styles.ruleId}>规则：{relation.ruleId} · 依据编号：{relation.evidenceId}</span>
        </li>)}</ul> : <p className={styles.note}>本阶段未列跨层关系；可能受适用状态或节点范围限制，不据空列表裁定个人吉凶。</p>}
      </div></details>
      <Boundaries items={review.bazi.boundaries} label="八字作用复核范围"/>
    </div>

    <div role="tabpanel" id={`${id}-parallel`} aria-labelledby={`${id}-parallel-tab`} className={styles.body} hidden={view !== 'parallel'} tabIndex={0}>
      <p className={styles.note}>同一观察点保留两套规则各自的结果与限制，不把四化和十神强行配对，也不将相似表述当作独立互证。</p>
      <ul className={styles.list} aria-label="双侧依据与差异并列">{review.sideBySide.map(item => <li key={item.id}><h3>{item.label}</h3><div className={styles.sideBySide}><div><h4>紫微侧</h4><p>{item.ziwei}</p></div><div><h4>八字侧</h4><p>{item.bazi}</p></div></div></li>)}</ul>
    </div>

    <div role="tabpanel" id={`${id}-sources`} aria-labelledby={`${id}-sources-tab`} className={styles.body} hidden={view !== 'sources'} tabIndex={0}>
      {(['ziwei', 'bazi'] as const).map(system => <section key={system} className={styles.layer} aria-label={`${system === 'ziwei' ? '紫微' : '八字'}复核规则来源`}><h3>{system === 'ziwei' ? '紫微' : '八字'}规则与版本</h3>{review.sources.filter(source => source.system === system).map(source => <div className={styles.source} key={source.id}><h4>{source.title}</h4><p className={styles.version}>{source.version}</p><p className={styles.note}>{source.note}</p>{source.url && <a href={source.url} target="_blank" rel="noopener noreferrer">核对这项规则来源</a>}</div>)}</section>)}
      <details className={styles.details}><summary>本阶段方法版本</summary><div className={styles.detailBody}><p className={styles.note}>复核层：{review.version}</p><p className={styles.note}>八字关系方法：{review.bazi.methodologyVersion}</p><p className={styles.note}>八字关系引擎：{review.bazi.engineVersion}</p></div></details>
      <Boundaries items={review.boundaries} label="双盘复核边界"/>
    </div>
  </section>;
}
