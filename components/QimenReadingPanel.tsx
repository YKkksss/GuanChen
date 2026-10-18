'use client';
import type {QimenReading} from '@/lib/qimen/reading-types';
import type {MeihuaEvidence} from '@/lib/meihua/types';
import {PALACE_INFO} from '@/lib/qimen/rules';
import QimenScenarioPanel from './QimenScenarioPanel';
import styles from './QimenReadingPanel.module.css';

function palaceName(number:number){return `${PALACE_INFO[number]?.name??''}${number}宫`;}

export default function QimenReadingPanel({reading,selectedPalace,onSelectPalace,evidence}:{reading?:QimenReading;selectedPalace:number;onSelectPalace:(number:number)=>void;evidence:MeihuaEvidence[]}){
  if(!reading)return <section className={styles.panel} aria-label="奇门深化复核"><h2>这是一份第一版固定盘面</h2><p>这份记录保存时尚未包含用神与宫门星深化复核。原盘与原依据继续保留，回看不会重新计算；如需使用新复核条件，请另建占问。</p></section>;
  const palace=reading.palaces.find(p=>p.number===selectedPalace),sources=evidence.filter(e=>e.id.startsWith('reading:'));
  return <section className={styles.panel} aria-label="奇门深化复核">
    <header className={styles.heading}><div><p className={styles.eyebrow}>对象定位 · 条件复核</p><h2>用神与宫门星复核</h2></div><span className={styles.tag}>{reading.focus.label}</span></header>
    <p className={styles.note}>{reading.scope}</p>
    <section className={styles.block} aria-label="占问参考对象"><h3>占问参考对象</h3>{reading.focus.status==='unselected'?<p>本盘未指定参考对象。可逐宫查看条件；涉及用神与应期时，需要先明确占问对象。</p>:reading.focus.status==='unavailable'?<p>当前盘面未能定位所选参考对象，请保留这一待核条件。</p>:<>
      <div className={styles.palaces} role="group" aria-label="参考对象落宫">{reading.focus.palaces.map(n=><button key={n} type="button" aria-pressed={selectedPalace===n} onClick={()=>onSelectPalace(n)}>查看{palaceName(n)}</button>)}</div>
      <dl className={styles.facts}>{reading.focus.items.map(item=><div key={item.key}><dt>{item.label} · {item.symbol}{item.hiddenJia?`（遁${item.matchedSymbol}）`:''}</dt><dd>{item.detail}</dd><dd className={styles.note}>地盘原宫：{item.earthOrigin===null?'不适用':palaceName(item.earthOrigin)}；寄宫：{item.earthHost===null?'不适用':palaceName(item.earthHost)}；天盘落宫：{item.palaces.length?item.palaces.map(palaceName).join('、'):'未定位'}。</dd></div>)}</dl>
    </>}{reading.comparison&&<div className={styles.inset}><strong>日时干宫位五行对照</strong><p>{palaceName(reading.comparison.dayPalace)}与{palaceName(reading.comparison.hourPalace)}：{reading.comparison.label}</p><p className={styles.note}>{reading.comparison.detail}</p></div>}<p className={styles.note}>日干、时干只是定位参考，需要结合具体占问取用；不把日干固定等同本人、时干固定等同事情，也不据此直接判断吉凶。</p></section>
    <QimenScenarioPanel scenario={reading.scenario} palaces={reading.palaces} selectedPalace={selectedPalace} onSelectPalace={onSelectPalace}/>
    {palace&&<section className={styles.block} aria-label="选中宫深化条件"><div className={styles.heading}><h3>{palaceName(palace.number)}的深化条件</h3><span className={styles.tag}>{palace.element}宫 · 月令{palace.monthState}</span></div><p>月支{reading.month.branch}属{reading.month.element}；本宫月令状态采用普通五行旺相休囚死口径。</p><p className={styles.note}>地盘对照：{palace.earthStems.map(stem=>`${stem.stem}（原${stem.origin}宫${stem.hosted?'，地盘中五寄干':''}）`).join('、')}。</p>{palace.emptyBranches.length>0&&<p className={styles.note}>本宫时旬空支：{palace.emptyBranches.join('、')}。只标空支，不等于所有条件失效。</p>}
      {palace.center?<p className={styles.inset}>中五不独布活动九星、八门与八神，不补造门迫、宫制门或活动九星旺衰。</p>:<div className={styles.columns}>
        <div><h4>八门与宫位</h4>{palace.door?<><p><strong>{palace.door.name} · {palace.door.element}</strong>，门月令{palace.door.monthState}</p><p>{palace.door.label}</p><p className={styles.note}>{palace.door.pressure?'门克宫，列为门迫条件。':palace.door.controlled?'宫克门，列为宫制门，不能混作门迫。':'当前未列门迫或宫制门条件。'}</p></>:<p>本宫没有独立八门。</p>}</div>
        <div><h4>九星专门月令口诀</h4>{palace.stars.length?<ul>{palace.stars.map(star=><li key={star.name}><strong>{star.name} · {star.element} · {star.monthState}</strong><p className={styles.note}>{star.label}</p></li>)}</ul>:<p>本宫没有活动九星。</p>}<p className={styles.note}>这里使用九星专门口诀，与本宫、八门的普通五行月令状态分别核对。</p></div>
      </div>}
      <details className={styles.details} open><summary>天盘各干逐一加临与格局条件</summary>{palace.stems.length?<ul>{palace.stems.map((stem,i)=><li key={`${stem.heavenStem}:${stem.earthOrigin}:${i}`}><strong>天盘{stem.heavenStem}加地盘{stem.earthStem}</strong><p className={styles.note}>天盘原{stem.heavenOrigin}宫{stem.heavenCarriedFromCenter?'，随星携带原中五仪':''}；地盘原{stem.earthOrigin}宫{stem.carriedFromCenter?'，地盘中五寄干':''}。</p><p className={styles.note}>{[stem.sameStem?'同干加临':null,stem.fiveCombine?'天干五合关系':null].filter(Boolean).join('；')||'未列同干或五合关系'}；关系本身不等于合化或吉凶。</p></li>)}</ul>:<p>中五没有独立活动天盘干，不另算加临。</p>}{palace.patterns.length?<ul>{palace.patterns.map(pattern=><li key={pattern.id}><strong>{pattern.label}</strong>{pattern.disputed&&<span className={styles.disputed}>有异文，需复核</span>}<p>{pattern.detail}</p><a href={pattern.sourceUrl} target="_blank" rel="noopener noreferrer">查看这条规则来源</a></li>)}</ul>:<p className={styles.note}>本宫未命中本阶段列出的击刑、三奇入墓与明确加临组合；这不代表已排除全部流派格局。</p>}</details>
    </section>}
    <details className={styles.details}><summary>全盘星门伏吟、反吟</summary><div className={styles.structures}>{[['九星伏吟',reading.structures.starFuyin],['八门伏吟',reading.structures.doorFuyin],['九星反吟',reading.structures.starFanyin],['八门反吟',reading.structures.doorFanyin]].map(([label,active])=><p key={String(label)}><strong>{label}</strong>：{active?'符合本阶段位置条件':'未符合本阶段位置条件'}</p>)}</div><p className={styles.note}>{reading.structures.detail}</p></details>
    <details className={styles.details}><summary>条件应期地支参考</summary>{reading.timing.status==='needs_focus'?<p>需要先指定占问参考对象，才能整理对应宫位的条件地支。</p>:<ul>{reading.timing.conditions.map((condition,i)=><li key={`${condition.palace}:${condition.label}:${i}`}><strong>{palaceName(condition.palace)} · {condition.label}：{condition.branches.join('、')||'无'}</strong><p>{condition.detail}</p></li>)}</ul>}<p className={styles.note}>{reading.timing.note}</p></details>
    <details className={styles.details}><summary>复核范围、月令口径与规则来源</summary><p className={styles.note}>规则版本：{reading.version}</p><p>普通五行：{reading.month.ordinaryPolicy}</p><p>九星口诀：{reading.month.starPolicy}</p><ul>{reading.boundaries.map((item,i)=><li key={i}>{item}</li>)}</ul>{sources.map(source=><div className={styles.source} key={source.id}><strong>{source.label}</strong><p>{source.detail}</p><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">查看原典来源</a></div>)}</details>
  </section>;
}
