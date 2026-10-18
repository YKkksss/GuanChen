'use client';
import { useState } from 'react';
import { BAZI_MONTHLY_CLIMATE_REFERENCES, CLIMATE_BRANCH_ORDER } from '@/lib/bazi/monthly-climate-rules';
import type { BaziFineReview } from '@/lib/bazi/fine-reading-types';
import type { BaziNatalPeriodReview } from '@/lib/bazi/natal-effect-types';
import styles from './BaziReadingWorkspace.module.css';
export const climateBasisLabel={month_paragraph:'对应月份段落',shared_paragraph:'同干合论参考',period_conditional:'月内条件分支'};
const positionLabel={surface_present:'表层已见',hidden_only:'仅藏未透',not_observed:'当前原局未见',unknown_time:'缺时柱，不能判缺'};
const conditionLabel={reference:'本月参考入口',position_observed:'相关五行位置已见，效力待核',not_observed:'条件位置未见',unknown_time:'缺时柱，条件待核',manual_review:'人工核对条件'};
const patternLabel={entry_observed:'结构入口已见',counterevidence:'已有反证待核',not_observed:'未见此清单入口',unknown_time:'缺时柱，暂不裁定'};
export default function BaziFineReadingPanel({review,stem,branch,period}:{review:BaziFineReview;stem:string;branch:string;period?:BaziNatalPeriodReview}){
  const [lookupStem,setLookupStem]=useState(stem),[lookupBranch,setLookupBranch]=useState(branch);
  const reference=BAZI_MONTHLY_CLIMATE_REFERENCES[`${lookupStem}:${lookupBranch}`];
  const activeBranch=period?.status==='resolved'?period.branches.find(b=>b.id===period.activeBranchId):undefined;
  const roleLabel=(value:typeof review.stemChecks[number])=>activeBranch?(activeBranch.primary.includes(value.stem)?'当前分支主要参考':activeBranch.support.includes(value.stem)?'当前分支配合参考':'其他分支参考，当前未启用'):value.role==='primary'?'章节主要入口':value.role==='support'?'配合参考':'条件支线';
  return <>
    <section className={`${styles.card} ${styles.full}`} aria-label="具体用干复核"><p className={styles.step}>05 · 具体用干</p><h2>透藏、根气与结构条件</h2>
      <p className={styles.note}>同干藏根、同五行其他藏干分别列出。五合位置不等于化气，根支相冲不等于根已拔除。</p>
      {activeBranch&&<p className={styles.note}>当前适用：{activeBranch.label}。其他分支参考仍可核对其原局位置，但不会自动加入当前调候候选。</p>}
      <div className={styles.fineGrid}>{review.stemChecks.map(s=><article className={styles.fineCard} key={s.stem}><h3>{s.stem} · {roleLabel(s)}</h3><p>{positionLabel[s.status]}</p><p>{s.purpose}</p>
        <dl><dt>非日干的表层位置</dt><dd>{s.surface.join('、')||'未见'}</dd><dt>本干藏根</dt><dd>{s.exactRoots.join('、')||'未见'}</dd><dt>同五行其他藏干</dt><dd>{s.sameElementRoots.join('、')||'未见'}</dd></dl>
        {s.role==='conditional'&&<p className={styles.caution}>{conditionLabel[s.condition]}；本支线没有自动并入无条件喜用。</p>}
        <details className={styles.evidence}><summary>查看结构与待核条件</summary><ul>{[...s.combinations,...s.rootClashes,...s.cautions].map((v,i)=><li key={i}>{v}</li>)}</ul>{!s.combinations.length&&!s.rootClashes.length&&!s.cautions.length&&<p>本清单未见额外位置条件，仍不代表取用已生效。</p>}</details>
      </article>)}</div>
    </section>
    <section className={`${styles.card} ${styles.full}`} aria-label="特殊格局复核"><p className={styles.step}>06 · 特殊格局</p><h2>结构入口与反证</h2><p className={styles.note}>先列满足与冲突的条件，保留月令、气势与制化问题。以下清单不直接裁决从格、专旺或化气成立，也不替代普通月令格局。</p>
      {review.specialPatterns.map(p=><details key={p.id} className={styles.pattern}><summary>{p.label} · {patternLabel[p.status]}</summary><h3>本清单检查条件</h3><ul>{p.conditions.map((s,i)=><li key={i}>{s}</li>)}</ul><h3>当前结构观察</h3><ul>{p.observations.map((s,i)=><li key={i}>{s}</li>)}</ul><h3>反证与限制</h3>{p.objections.length?<ul>{p.objections.map((s,i)=><li key={i}>{s}</li>)}</ul>:<p>当前清单未列反证，不等于该格成立。</p>}<ul>{p.pending.map((s,i)=><li key={i}>{s}</li>)}</ul><a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">查看原典讨论来源</a></details>)}
    </section>
    <section className={`${styles.card} ${styles.full}`} aria-label="月令参考索引"><h2>十干十二月参考索引</h2><p>共{review.coverage.total}组：月份段落{review.coverage.monthParagraphs}组、合论映射{review.coverage.sharedParagraphs}组、月内条件{review.coverage.periodConditional}组。</p><p className={styles.note}>索引覆盖不代表120条独立精细月断。此处查阅其他组合不会改变当前命盘或已保存报告。</p>
      <div className={styles.lookupFields}><label>查阅日干<select aria-label="查阅日干" value={lookupStem} onChange={e=>setLookupStem(e.target.value)}>{[...'甲乙丙丁戊己庚辛壬癸'].map(s=><option key={s}>{s}</option>)}</select></label><label>查阅节令月支<select aria-label="查阅节令月支" value={lookupBranch} onChange={e=>setLookupBranch(e.target.value)}>{CLIMATE_BRANCH_ORDER.map(s=><option key={s}>{s}</option>)}</select></label></div>
      <div className={styles.summary} aria-live="polite"><h3>{lookupStem}日主 · {lookupBranch}月</h3><p>{climateBasisLabel[reference.basis]} · {reference.section}</p><p>{reference.rationale}</p><p>主要及配合参考：{reference.coreStems.join('、')}。</p>{reference.conditional.length>0&&<ul>{reference.conditional.map((c,i)=><li key={i}>{c.stem}：{c.detail}</li>)}</ul>}{reference.periodNote&&<p className={styles.caution}>{reference.periodNote}</p>}<a href={reference.sourceUrl} target="_blank" rel="noopener noreferrer">查看对应原典章节</a></div>
    </section>
  </>;
}
