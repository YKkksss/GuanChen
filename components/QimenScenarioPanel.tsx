'use client';

import { useId, useState } from 'react';
import type { QimenPalaceReview, QimenPattern } from '@/lib/qimen/reading-types';
import type { QimenScenarioLocation, QimenScenarioReview } from '@/lib/qimen/scenario-types';
import { PALACE_INFO } from '@/lib/qimen/rules';
import styles from './QimenScenarioPanel.module.css';

const VIEWS = [
  { id: 'roles', label: '取用角色' },
  { id: 'palaces', label: '宫位条件' },
  { id: 'comparisons', label: '两侧关系' },
  { id: 'sources', label: '规则来源' },
] as const;
type View = typeof VIEWS[number]['id'];

function palaceName(number: number) {
  return `${PALACE_INFO[number]?.name ?? ''}${number}宫`;
}

function basisLabel(location: QimenScenarioLocation) {
  return `${location.comparisonBasis === 'star' ? '星自身' : '落宫'}五行：${location.comparisonElement}`;
}

function Patterns({ patterns, empty }: { patterns: QimenPattern[]; empty: string }) {
  return patterns.length > 0 ? <ul className={styles.plainList}>{patterns.map(pattern => <li key={pattern.id}>
    <strong>{pattern.label}</strong>{pattern.disputed && <span className={styles.disputed}>有异文，待核</span>}
    <p className={styles.note}>{pattern.detail}</p>
    <a href={pattern.sourceUrl} target="_blank" rel="noopener noreferrer">查看这条规则来源</a>
  </li>)}</ul> : <p className={styles.note}>{empty}</p>;
}

function PalaceFacts({ palace }: { palace: QimenPalaceReview }) {
  return <>
    <p>{palaceName(palace.number)} · {palace.element}宫 · 宫月令{palace.monthState}</p>
    <p className={styles.note}>{palace.emptyBranches.length ? `本宫时旬空支：${palace.emptyBranches.join('、')}。宫内有空支，不等于本角色或整宫条件已经失效。` : '本宫未列时旬空支；这不等于其他制约均已排除。'}</p>
    {palace.center ? <p className={`${styles.note} ${styles.notice}`}>中五不独布活动九星、八门与八神，不补造门迫、宫制门或活动九星旺衰。</p> : <div className={styles.columns}>
      <div><h5>八门与宫位</h5>{palace.door ? <><p>{palace.door.name} · {palace.door.element} · 门月令{palace.door.monthState}</p><p className={styles.note}>{palace.door.label}</p><p className={styles.note}>{palace.door.pressure ? '门克宫：列为门迫条件。' : palace.door.controlled ? '宫克门：列为宫制门，不混作门迫。' : '本宫未列门迫或宫制门条件。'}</p></> : <p className={styles.note}>本宫没有独立八门。</p>}</div>
      <div><h5>九星专门月令</h5>{palace.stars.length ? <ul className={styles.plainList}>{palace.stars.map(star => <li key={star.name}><strong>{star.name} · {star.element} · {star.monthState}</strong><p className={styles.note}>{star.label}</p></li>)}</ul> : <p className={styles.note}>本宫没有活动九星。</p>}<p className={styles.note}>九星采用专门月令口诀，与宫、门的普通五行月令分别保留。</p></div>
    </div>}
  </>;
}

export default function QimenScenarioPanel({ scenario, palaces, selectedPalace, onSelectPalace }: {
  scenario?: QimenScenarioReview;
  palaces: QimenPalaceReview[];
  selectedPalace: number;
  onSelectPalace: (number: number) => void;
}) {
  const id = useId();
  const [view, setView] = useState<View>('roles');
  if (!scenario) return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.heading}><h3 id={`${id}-title`}>占类取用与作用条件</h3></header>
    <p className={`${styles.note} ${styles.legacy}`}>这份记录保存时尚未记录占类条件。原盘、参考对象与原依据保持保存时结果；如需使用求财、考试或出行复核，请另建占问。</p>
  </section>;
  if (scenario.status === 'unselected') return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.heading}><h3 id={`${id}-title`}>占类取用与作用条件</h3><span className={styles.version}>{scenario.version}</span></header>
    <p className={`${styles.note} ${styles.legacy}`}>本盘未指定占类。请在新建占问时明确选择求财、考试或出行，再分别核对相应角色与关系；已有参考对象仍按原选择保留。</p>
  </section>;

  const palace = palaces.find(item => item.number === selectedPalace);
  const rolesById = new Map(scenario.roles.map(role => [role.id, role]));
  const here = scenario.roles.flatMap(role => role.locations.filter(location => location.palace === selectedPalace).map(location => ({ role, location })));
  const choosePalace = (number: number) => {
    onSelectPalace(number);
    setView('palaces');
    document.getElementById(`${id}-palaces-tab`)?.focus();
  };
  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.heading}><div><h3 id={`${id}-title`}>占类取用与作用条件</h3><p className={styles.note}>{scenario.label}</p></div><span className={styles.version}>{scenario.version}</span></header>
    <p className={`${styles.note} ${styles.scope}`}>{scenario.scope}</p>
    <p className={styles.summary}>{scenario.status === 'partial' ? '部分角色尚未完整定位，保留缺项与待核条件。' : '角色与比较层级按保存时占类固定；查看宫位不修改取用。'}</p>
    <div className={styles.tabs} role="tablist" aria-label="奇门占类复核视图">{VIEWS.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}`} aria-selected={view === item.id} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
      setView(VIEWS[next].id);
      document.getElementById(`${id}-${VIEWS[next].id}-tab`)?.focus();
    }}>{item.label}</button>)}</div>

    <div className={styles.body} role="tabpanel" id={`${id}-roles`} aria-labelledby={`${id}-roles-tab`} hidden={view !== 'roles'} tabIndex={0}>
      <p className={styles.note}>各角色独立保留；同宫不合并身份，比较层级按下方所列口径核对。</p>
      <ul className={styles.list} aria-label="占类取用角色">{scenario.roles.map(role => <li key={role.id}>
        <div className={styles.roleHeading}><h4>{role.label}</h4><span className={styles.symbol}>{role.symbol}</span></div>
        <p className={styles.note}>{role.detail}</p>
        {role.stemFocus && <details className={styles.details}><summary>原干、旬遁与寄宫依据</summary><div className={styles.detailBody}>
          <p>{role.stemFocus.symbol}{role.stemFocus.hiddenJia ? `（遁${role.stemFocus.matchedSymbol}）` : ''} · {role.stemFocus.detail}</p>
          <p className={styles.note}>地盘原宫：{role.stemFocus.earthOrigin === null ? '不适用' : palaceName(role.stemFocus.earthOrigin)}；寄宫：{role.stemFocus.earthHost === null ? '不适用' : palaceName(role.stemFocus.earthHost)}。</p>
        </div></details>}
        {role.locations.length ? role.locations.map(location => <div className={styles.location} key={location.id}>
          <div className={styles.locationHead}><strong>{location.symbol} · {palaceName(location.palace)}</strong><button type="button" className={styles.textButton} onClick={() => choosePalace(location.palace)}>查看{palaceName(location.palace)}条件</button></div>
          <p className={styles.note}>{basisLabel(location)}</p><p className={styles.note}>{location.detail}</p>
          {(role.stemFocus || location.ownPatterns.length > 0) && <details className={styles.details}><summary>该角色自身干刑墓 · {location.ownPatterns.length}条</summary><div className={styles.detailBody}><Patterns patterns={location.ownPatterns} empty="未记录属于该角色天盘干的刑墓条件；宫内其他格局另在宫位视图核对。"/></div></details>}
        </div>) : <p className={`${styles.note} ${styles.notice}`}>当前快照未能定位该角色，不以其他角色或相邻宫替代。</p>}
      </li>)}</ul>
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-palaces`} aria-labelledby={`${id}-palaces-tab`} hidden={view !== 'palaces'} tabIndex={0}>
      <div className={styles.palaceButtons} role="group" aria-label="占类涉及宫位">{scenario.palaceNumbers.map(number => <button key={number} type="button" aria-pressed={selectedPalace === number} onClick={() => onSelectPalace(number)}>查看{palaceName(number)}</button>)}</div>
      <h4>当前查看：{palaceName(selectedPalace)}</h4>
      {here.length ? <ul className={styles.plainList}>{here.map(({ role, location }) => <li key={`${role.id}:${location.id}`}><strong>{role.label} · {location.symbol}</strong><span className={styles.basis}>{basisLabel(location)}</span></li>)}</ul> : <p className={styles.note}>当前宫未承载本占类的已定位角色，仍可按原盘查看宫内条件。</p>}
      {palace ? <><PalaceFacts palace={palace}/><details className={styles.details}><summary>地盘原干、寄干与逐干加临</summary><div className={styles.detailBody}>
        <p className={styles.note}>地盘：{palace.earthStems.map(stem => `${stem.stem}（原${palaceName(stem.origin)}${stem.hosted ? '，中五寄干' : ''}）`).join('、') || '未记录'}。</p>
        {palace.stems.length ? <ul className={styles.plainList}>{palace.stems.map((stem, index) => <li key={`${index}:${stem.heavenStem}:${stem.earthOrigin}`}><strong>天盘{stem.heavenStem}加地盘{stem.earthStem}</strong><p className={styles.note}>天盘原{palaceName(stem.heavenOrigin)}{stem.heavenCarriedFromCenter ? '，随星携带原中五仪' : ''}；地盘原{palaceName(stem.earthOrigin)}{stem.carriedFromCenter ? '，地盘中五寄干' : ''}。</p><p className={styles.note}>{[stem.sameStem && '同干加临', stem.fiveCombine && '天干五合关系'].filter(Boolean).join('；') || '未列同干或五合关系'}；关系本身不等于合化或吉凶。</p></li>)}</ul> : <p className={styles.note}>中五无独立活动天盘干，不另造加临。</p>}
      </div></details><details className={styles.details}><summary>宫内共同格局 · 不归作每个角色自身</summary><div className={styles.detailBody}><p className={styles.note}>以下保留本宫各干的全部格局条件。某条条件是否属于当前角色，须核对对应天盘干与原宫；角色自身刑墓见取用角色视图。</p><Patterns patterns={palace.patterns} empty="本宫未命中本阶段列出的格局，不代表排除所有流派条件。"/></div></details></> : <p className={styles.note}>原快照未记录该宫深化条件，暂不补算。</p>}
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-comparisons`} aria-labelledby={`${id}-comparisons-tab`} hidden={view !== 'comparisons'} tabIndex={0}>
      <p className={styles.note}>箭头只表达五行方向；同宫、相生或相克均不自动构成吉凶或有效性结论。</p>
      {scenario.comparisons.length ? <ul className={styles.list} aria-label="占类两侧关系">{scenario.comparisons.map(comparison => {
        const fromRole = rolesById.get(comparison.fromRole), toRole = rolesById.get(comparison.toRole);
        const from = fromRole?.locations.find(location => location.id === comparison.fromLocation), to = toRole?.locations.find(location => location.id === comparison.toLocation);
        if (!fromRole || !toRole || !from || !to) return null;
        const fromPalace = palaces.find(item => item.number === from.palace), toPalace = palaces.find(item => item.number === to.palace);
        const arrow = comparison.relation === 'same' ? '↔' : comparison.relation === 'generated_by' || comparison.relation === 'controlled_by' ? '←' : '→';
        const direction = comparison.relation === 'same' ? '两侧同五行' : comparison.relation === 'generated_by' ? '后侧生前侧' : comparison.relation === 'controlled_by' ? '后侧克前侧' : comparison.relation === 'generates' ? '前侧生后侧' : '前侧克后侧';
        return <li key={comparison.id}><h4>{comparison.label}</h4><div className={styles.route}><span>{fromRole.label} · {from.symbol} · {palaceName(from.palace)}<span className={styles.basis}>{basisLabel(from)}</span></span><span className={styles.arrow} role="img" aria-label={direction}>{arrow}</span><span>{toRole.label} · {to.symbol} · {palaceName(to.palace)}<span className={styles.basis}>{basisLabel(to)}</span></span></div>
          {comparison.samePalace && <p className={styles.note}>两角色同宫，身份与比较层级仍分别保留。</p>}<p className={styles.note}>{comparison.detail}</p>
          <details className={styles.details}><summary>分别查看两侧宫位与自身条件</summary><div className={styles.pairSides}>
            {[{ role: fromRole, location: from, palace: fromPalace }, { role: toRole, location: to, palace: toPalace }].map((side, index) => <div key={`${index}:${side.role.id}:${side.location.id}`}><h5>{side.role.label} · {side.location.symbol}</h5><p className={styles.note}>{basisLabel(side.location)}；{side.location.detail}</p>{side.palace ? <PalaceFacts palace={side.palace}/> : <p className={styles.note}>原快照无该宫深化条件。</p>}{(side.role.stemFocus || side.location.ownPatterns.length > 0) && <><h5>该角色自身干刑墓</h5><Patterns patterns={side.location.ownPatterns} empty="该角色未列自身干刑墓，不等于全宫其他条件已排除。"/></>}<button type="button" className={styles.textButton} onClick={() => choosePalace(side.location.palace)}>查看{palaceName(side.location.palace)}全部条件</button></div>)}
          </div></details>
        </li>;
      })}</ul> : <p className={`${styles.note} ${styles.notice}`}>当前未记录完整两侧关系，保留尚未定位的角色条件，不补造比较。</p>}
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-sources`} aria-labelledby={`${id}-sources-tab`} hidden={view !== 'sources'} tabIndex={0}>
      {scenario.sources.map(source => <div className={styles.source} key={source.id}><h4>{source.label}</h4><p className={styles.note}>{source.detail}</p><a href={source.url} target="_blank" rel="noopener noreferrer">核对占类原典来源</a></div>)}
      <details className={styles.details}><summary>待核条件 · {scenario.pending.length}条</summary><div className={styles.detailBody}><ul className={styles.plainList}>{scenario.pending.map((item, index) => <li key={index}>{item}</li>)}</ul></div></details>
      <details className={styles.details}><summary>本阶段规则边界</summary><div className={styles.detailBody}><ul className={styles.plainList}>{scenario.boundaries.map((item, index) => <li key={index}>{item}</li>)}</ul></div></details>
    </div>
  </section>;
}
