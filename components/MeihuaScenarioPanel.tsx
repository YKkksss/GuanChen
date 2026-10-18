'use client';

import { useId, useState } from 'react';
import type { MeihuaScenario, MeihuaScenarioCondition } from '@/lib/meihua/scenario-types';
import type { MeihuaSeasonState } from '@/lib/meihua/reading-types';
import styles from './MeihuaScenarioPanel.module.css';

const VIEWS = [
  { id: 'roles', label: '占类角色' },
  { id: 'conditions', label: '体用条件' },
  { id: 'supplements', label: '互变并列' },
  { id: 'sources', label: '规则来源' },
] as const;
type View = typeof VIEWS[number]['id'];
function seasonLabel(value: MeihuaSeasonState | null) { return value ? `季节${value}` : '季节未定位'; }
function relationLabel(condition: MeihuaScenarioCondition) {
  const counterpart = ({ primary: '本卦用', mutual_lower: '下互', mutual_upper: '上互', changed: '变卦用' })[condition.nodeKey];
  return ({ '体克用': `本卦固定体克${counterpart}`, '用克体': `${counterpart}克本卦固定体`, '用生体': `${counterpart}生本卦固定体`, '体生用': `本卦固定体生${counterpart}`, '比和': `本卦固定体与${counterpart}同五行` })[condition.relationship];
}

function Condition({ condition }: { condition: MeihuaScenarioCondition }) {
  return <section className={styles.condition} aria-label={`${condition.label}占类条件`}>
    <div className={styles.rowHeading}><h3>{condition.label}</h3><strong className={styles.symbol}>{condition.relationship}</strong></div>
    <p className={styles.scopeLabel}>{condition.ruleScope === 'selected_scenario_primary' ? '本次占类的本用条件' : '通用体用补充参考 · 不套用本次占类断语'}</p>
    <dl className={styles.sides}>
      <div><dt>本卦固定体</dt><dd><strong>{condition.body.name}{condition.body.image} · {condition.body.element}</strong><span>{seasonLabel(condition.bodySeasonState)}</span></dd></div>
      <div><dt>对照位置：{condition.label}</dt><dd><strong>{condition.counterpart.name}{condition.counterpart.image} · {condition.counterpart.element}</strong><span>{seasonLabel(condition.seasonState)}</span></dd></div>
    </dl>
    <p className={styles.direction}>{relationLabel(condition)}，关系按保存结果展示。</p>
    <p><strong>观察重点：</strong>{condition.focus}</p>
    <p>{condition.observation}</p>
    <details className={styles.details}><summary>待核条件与依据</summary><div className={styles.detailBody}>
      <ul className={styles.plainList}>{condition.pending.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <p className={styles.ruleId}>规则来源：{condition.sourceId}</p><p className={styles.ruleId}>条件依据：{condition.evidenceId}</p><p className={styles.ruleId}>位置来源：{condition.imageryEvidenceId}</p>
    </div></details>
  </section>;
}

function Sources({ scenario }: { scenario: MeihuaScenario }) {
  return <>
    {scenario.sources.map(source => <details className={styles.source} key={source.id}><summary>{source.title}</summary><div className={styles.detailBody}><p>{source.note}</p><a href={source.url} target="_blank" rel="noopener noreferrer">核对占类原典来源</a><p className={styles.ruleId}>来源编号：{source.id}</p></div></details>)}
    <details className={styles.details}><summary>规则边界与保存版本</summary><div className={styles.detailBody}><ul className={styles.plainList}>{scenario.boundaries.map((boundary, index) => <li key={index}>{boundary}</li>)}</ul><p className={styles.ruleId}>占类规则：{scenario.version}</p></div></details>
  </>;
}

export default function MeihuaScenarioPanel({ scenario }: { scenario?: MeihuaScenario }) {
  const id = useId();
  const [view, setView] = useState<View>('roles');
  if (!scenario) return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h2 id={`${id}-title`}>占类取用复核</h2></header>
    <p className={`${styles.note} ${styles.legacy}`}>这份记录保存时尚未包含明确占类。原卦、原体用及已有复核继续保留，回看不从问题文字补算；需要占类条件时请另建占问并明确选择。</p>
  </section>;
  if (scenario.status === 'unspecified') return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h2 id={`${id}-title`}>占类取用复核</h2></header>
    <div className={styles.body}><p className={styles.notice}><strong>本次未指定占类</strong><span>仅保留通用体用，不猜测这是求谋、求财还是出行。需要具体占类时，请在新建占问中明确选择。</span></p><Sources scenario={scenario}/></div>
  </section>;

  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><div className={styles.rowHeading}><h2 id={`${id}-title`}>占类取用复核</h2><strong className={styles.symbol}>本次明确选择：{scenario.label}</strong></div></header>
    <p className={`${styles.note} ${styles.scope}`}>固定本卦之体，本用按所选占类复核；上下互与变用另列通用参考。保存后不从问题文字换占类，也不将季节标签改成生克结论。</p>
    <div className={styles.tabs} role="tablist" aria-label="梅花占类复核视图">{VIEWS.map((item, index) => <button type="button" role="tab" key={item.id} id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}`} aria-selected={view === item.id} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
      setView(VIEWS[next].id);
      document.getElementById(`${id}-${VIEWS[next].id}-tab`)?.focus();
    }}>{item.label}</button>)}</div>

    <div className={styles.body} role="tabpanel" id={`${id}-roles`} aria-labelledby={`${id}-roles-tab`} hidden={view !== 'roles'} tabIndex={0}>
      <p className={styles.note}>五个结构位置分别保留身份；同一卦名不合并角色。取象目录仍是候选，不自动锁定现实人物、物品或结果。</p>
      <ul className={styles.cards} aria-label="占类五位置角色">{scenario.roles.map(role => <li key={role.nodeKey}>
        <div className={styles.rowHeading}><h3>{role.label}</h3><strong className={styles.symbol}>{role.trigram.name}{role.trigram.image} · {role.trigram.element}</strong></div>
        <p>{role.role}</p><p className={styles.note}>{seasonLabel(role.seasonState)}</p>
        <details className={styles.details}><summary>角色位置与来源</summary><div className={styles.detailBody}><p>读取{role.sourceBoard === 'primary' ? '本卦盘' : '变卦盘'} · 本卦原{role.sourceLinePositions.map(position => `第${position}爻`).join('、')}。</p><p className={styles.ruleId}>角色依据：{role.evidenceId}</p><p className={styles.ruleId}>取象位置：{role.imageryEvidenceId}</p></div></details>
      </li>)}</ul>
    </div>
    <div className={styles.body} role="tabpanel" id={`${id}-conditions`} aria-labelledby={`${id}-conditions-tab`} hidden={view !== 'conditions'} tabIndex={0}>
      {scenario.primaryCondition ? <Condition condition={scenario.primaryCondition}/> : <p className={styles.notice}>这份记录未保存本用占类条件，不在此处补算。</p>}
      <p className={styles.note}>两侧季节状态分别展示。旺相休囚死不改变生克方向，也不直接给出成败或日期。</p>
      {scenario.checks.length > 0 && <details className={styles.details}><summary>本次占类还需核对什么</summary><ul className={styles.plainList}>{scenario.checks.map((check, index) => <li key={index}>{check}</li>)}</ul></details>}
    </div>
    <div className={styles.body} role="tabpanel" id={`${id}-supplements`} aria-labelledby={`${id}-supplements-tab`} hidden={view !== 'supplements'} tabIndex={0}>
      <p className={styles.notice}><strong>三位补充，只读通用体用</strong><span>上下互与变用均与原固定体比较，不套用本用的占类断语；同源结构不累加成独立证据，也不投票决定结果。</span></p>
      <div className={styles.conditions}>{scenario.supplements.map(condition => <Condition key={condition.nodeKey} condition={condition}/>)}</div>
    </div>
    <div className={styles.body} role="tabpanel" id={`${id}-sources`} aria-labelledby={`${id}-sources-tab`} hidden={view !== 'sources'} tabIndex={0}><Sources scenario={scenario}/></div>
  </section>;
}
