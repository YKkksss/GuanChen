'use client';
import { useState } from 'react';
import type { BaziMethodCondition, BaziMethodReview } from '@/lib/bazi/method-review-types';
import { METHOD_CONDITION_LABELS } from '@/lib/bazi/method-review-rules';
import styles from './BaziReadingWorkspace.module.css';

const VIEWS = [['strength', '旺衰前提'], ['pattern', '逐格复核'], ['balancing', '扶抑取用'], ['climate', '调候取用'], ['flow', '通关与病药']] as const;
function Conditions({ items }: { items: BaziMethodCondition[] }) {
  return <dl className={styles.conditionList}>{items.map(c => <div key={c.id}><dt>{c.label}<span className={styles.conditionTag} data-status={c.status}>{METHOD_CONDITION_LABELS[c.status]}</span></dt><dd>{c.detail}</dd></div>)}</dl>;
}
function Notes({ items }: { items: string[] }) { return <ul className={styles.methodNotes}>{items.map((s, i) => <li key={i}>{s}</li>)}</ul>; }
export default function BaziMethodReviewPanel({ review }: { review: BaziMethodReview }) {
  const [view, setView] = useState<typeof VIEWS[number][0]>('strength');
  const title = VIEWS.find(v => v[0] === view)![1];
  return <section className={`${styles.card} ${styles.full}`} aria-label="分方法旺衰格局取用复核">
    <p className={styles.step}>分方法复核</p><h2>先核前提，再看取用</h2>
    <p className={styles.note}>月令格局、扶抑、调候各有语义。逐项看已见线索、反向条件和未决项；相同五行不按方法数量投票。</p>
    {review.unknownTime && <p className={styles.caution}>时柱未知。已知柱未见的角色、根或桥接元素，均不能直接判为全盘缺失。</p>}
    <div role="group" aria-label="分方法复核视图" className={styles.reviewViews}>{VIEWS.map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div>
    <div role="region" aria-label={title}>
      {view === 'strength' && <><p className={styles.lead}>{review.strength.label}</p><div className={styles.methodColumns}><div><h3>必要前提与位置</h3><Conditions items={review.strength.conditions} /></div><div><h3>反向及阻碍线索</h3>{review.strength.counterevidence.length ? <Notes items={review.strength.counterevidence} /> : <p className={styles.note}>本清单未见明确反向项，不证明没有阻碍。</p>}<h3>尚未裁决</h3><Notes items={review.strength.pending} /></div></div></>}
      {view === 'pattern' && <><p className={styles.note}>全部 {review.patterns.length} 条月令候选并列保留，顺序与数量不代表优劣。</p><div className={styles.methodColumns}>{review.patterns.map(p => <article className={styles.fineCard} key={p.id}><h3>{p.label}</h3><p>来源：{p.sourceStem}{p.sourceElement} · {p.meaning === 'peer_month_separate_selection' ? '禄劫刃另查财官食杀' : '月令格局语义'}</p><Conditions items={p.conditions} />{([['支持线索', p.support], ['风险线索', p.risks], ['救应候选', p.rescues]] as const).map(([label, items]) => <details key={label} className={styles.pattern}><summary>{label}（{items.filter(i => i.status === 'observed').length} 项已见）</summary><Conditions items={items} /></details>)}<Notes items={p.pending} /></article>)}</div>{!review.patterns.length && <p>当前没有已保存的格局候选，不自行补算。</p>}</>}
      {view === 'balancing' && <><p className={styles.lead}>{review.balancing.label}</p><p>条件候选五行：{review.balancing.elements.join('、') || '暂不列出'}</p><p className={styles.note}>下列前提中的“仍需复核”保留时，不把候选改称喜神或忌神。</p><div className={styles.methodColumns}><Conditions items={review.balancing.conditions} /><div><h3>取用仍需满足</h3><Notes items={review.balancing.pending} /><h3>与调候如何对照</h3><Notes items={review.coordination.filter(c => c.balancing || c.climateStems.length).map(c => `${c.element}：${c.note}`)} /></div></div></>}
      {view === 'climate' && <><p className={styles.lead}>{review.climate.label}</p><Conditions items={review.climate.conditions} /><div className={styles.methodColumns}>{review.climate.stems.map(s => <article key={s.stem} className={styles.fineCard}><h3>{s.stem}{s.element} · {s.role}</h3><p>{s.position}</p>{s.observations.length > 0 && <Notes items={s.observations} />}<details className={styles.pattern}><summary>配合与效力待核</summary><Notes items={s.pending} /></details></article>)}</div><details className={styles.evidence}><summary>查看适用条件</summary><Notes items={review.climate.pending} /></details></>}
      {view === 'flow' && <><p>通关先核两方是否势均对峙，再核桥接是否有效。下列五条仅展示五行相生路径；日干在这里作为对峙对象参照纳入。</p><div className={styles.methodColumns}>{review.flow.map(f => <details className={styles.fineCard} key={f.id}><summary>{f.label}<span className={styles.methodSummary}>{f.conditions.slice(0, 2).every(c => c.status === 'observed') ? '两方位置已见，势力待核' : review.unknownTime ? '位置不全，缺时待核' : '两方位置未齐'}</span></summary><Conditions items={f.conditions} /></details>)}</div><p className={styles.note}>病药法还需识别具体病点、制化关系和效力，目前不指定“药”，不按缺项补五行。</p></>}
    </div>
    <details className={styles.evidence}><summary>方法版本、来源与边界</summary><p className={styles.note}>{review.version}</p><dl>{review.sources.map(s => <div key={s.id}><dt><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></dt><dd>{s.scope}</dd></div>)}</dl><p>{review.boundary}</p></details>
  </section>;
}
