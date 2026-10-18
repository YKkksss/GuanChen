'use client';
import { useState } from 'react';
import type { BaziNatalEffectReview, NatalCondition } from '@/lib/bazi/natal-effect-types';
import { NATAL_COMBINATION_LABELS, NATAL_CONDITION_LABELS } from '@/lib/bazi/natal-effect-rules';
import styles from './BaziReadingWorkspace.module.css';

function Conditions({ items }: { items: NatalCondition[] }) {
  return <dl className={styles.conditionList}>{items.map(item => <div key={item.label}>
    <dt>{item.label}<span className={styles.conditionTag} data-status={item.status}>{NATAL_CONDITION_LABELS[item.status]}</span></dt>
    <dd>{item.detail}</dd>
  </div>)}</dl>;
}
export default function BaziNatalEffectPanel({ review }: { review: BaziNatalEffectReview }) {
  const [view, setView] = useState<'period' | 'contact' | 'root' | 'method'>('period');
  const period = review.period;
  return <section className={`${styles.card} ${styles.full}`} aria-label="原局作用复核">
    <p className={styles.step}>新增 · 原局作用复核</p><h2>把适用条件核对清楚</h2>
    <p className={styles.note}>“满足”只针对写明的检查项。近合入口通过，仍需核对合绊与化气；藏根受冲，也不会直接被判为失效。</p>
    {review.unknownTime && <p className={styles.caution}>缺少时柱：以下只检查已知三柱，不能排除时干争合、时支相冲或额外藏根。月内分支另按整日是否跨界核对。</p>}
    <div className={styles.reviewViews} role="group" aria-label="原局复核内容">
      {([['period', '月内分支'], ['contact', '五合近邻'], ['root', '藏根与合冲'], ['method', '方法与来源']] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
    </div>
    {view === 'period' && <div aria-label="月内分支复核">
      <p className={styles.lead}>{period.label}</p><p>{period.detail}</p>
      {period.boundary && <p className={styles.reviewClock}>{period.boundary.name}交接：<strong>{period.boundary.at}</strong>（{period.boundary.timeZone}）<br />交接时刻起属于后一段；晚子时换日不改变节气交接时刻。</p>}
      {period.observation && <p className={styles.note}>{period.observation.precision === 'day' ? '出生时间未知，核对整个出生日期' : '按已保存有效时间核对'}：{period.observation.from}{period.observation.precision === 'day' ? ` 至 ${period.observation.untilExclusive}（结束不含）` : '（秒级）'}。</p>}
      {period.branches.length > 0 && <div className={styles.fineGrid}>{period.branches.map(branch => <article className={styles.fineCard} key={branch.id}>
        <h3>{branch.label}</h3><span className={styles.conditionTag} data-status={branch.status}>{NATAL_CONDITION_LABELS[branch.status]}</span>
        <p>主要参考：{branch.primary.join('、')}；配合参考：{branch.support.join('、') || '本段未另列'}。</p><p>{branch.detail}</p>
      </article>)}</div>}
      <p className={styles.note}>下方“具体用干”和“参考索引”保留章节参考全集；已定位分支的当前调候入口按本分支显示。分支定位不能替代完整人元司令或最终喜忌判断。</p>
      <a href={period.sourceUrl} target="_blank" rel="noopener noreferrer">查看月内条件来源</a>
    </div>}
    {view === 'contact' && <div aria-label="五合近邻复核">
      <p className={styles.note}>按年、月、日、时的固定位置检查，不把缺失的时柱移位。隔位重复不会直接当成近邻争合。</p>
      {review.combinations.length ? review.combinations.map(item => <details key={item.id} className={styles.pattern}>
        <summary>{item.label} · {NATAL_COMBINATION_LABELS[item.status]}</summary>
        <Conditions items={item.conditions} />
        {item.involvesDay && <p className={styles.caution}>涉及日干本身之合，不能自动解释为财官被合去。</p>}
        <ul>{[...item.observations, ...item.pending].map((s, i) => <li key={i}>{s}</li>)}</ul>
      </details>) : <p className={styles.empty}>已知柱的表层天干未见五合对象；这不表示整盘没有其他生克作用。{review.unknownTime ? '时柱未知，也不能排除时干新增五合。' : ''}</p>}
    </div>}
    {view === 'root' && <div aria-label="藏根与合冲复核">
      {review.roots.map(item => <details key={item.stem} className={styles.pattern} open={item.isDayMaster}>
        <summary>{item.stem}{item.isDayMaster ? ' · 日主参照' : ''} · 同干藏根{item.roots.filter(r => r.kind === 'same_stem').length}处</summary>
        <p>表层位置：{item.surfaces.join('、') || '未见'}。</p><Conditions items={item.conditions} />
        {item.roots.length > 0 && <ul>{item.roots.map(root => <li key={root.id}><strong>{root.location} · {root.kind === 'same_stem' ? '严格同干根' : '同五行支持'}</strong><p>六冲：{root.clashes.join('；') || '已知柱未见'}。</p>{root.concurrentRelations.length > 0 && <p>并见会合：{root.concurrentRelations.join('；')}；仍未判成局或解冲。</p>}</li>)}</ul>}
      </details>)}
      <h3>六冲与会合并见</h3>
      {review.branchClashes.length ? review.branchClashes.map(item => <details key={item.id} className={styles.pattern}><summary>{item.label} · {item.adjacent ? '近邻' : '隔位'}</summary><p>{item.detail}</p>{item.concurrentRelations.length > 0 && <ul>{item.concurrentRelations.map((s, i) => <li key={i}>{s}</li>)}</ul>}</details>) : <p>已知柱未见六冲；本清单不据此证明根气强弱。</p>}
    </div>}
    {view === 'method' && <div aria-label="原局复核方法来源"><p className={styles.lead}>{review.methodLabel}</p><p>{review.boundary}</p><ul>{review.sources.map(s => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a><p>{s.scope}</p></li>)}</ul><p className={styles.note}>规则版本：{review.version}。复核随新报告固定保存；旧报告仍按原有依据回看。</p></div>}
  </section>;
}
