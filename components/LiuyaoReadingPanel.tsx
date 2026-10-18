import type { LiuyaoLineContext, LiuyaoReading } from '@/lib/liuyao/reading-types';
import type { LiuyaoResult } from '@/lib/liuyao/types';
import LiuyaoInfluencePanel from './LiuyaoInfluencePanel';
import styles from './LiuyaoReadingPanel.module.css';

function Context({ value }: { value: LiuyaoLineContext }) {
  const marks = [value.empty && '旬空', value.monthClash && '月冲', value.dayClash && '日冲', value.monthCombine && '月合', value.dayCombine && '日合'].filter(Boolean);
  return <div className={styles.context}>
    <p><strong>{value.branch}{value.element} · 月令{value.monthState}</strong>{marks.length > 0 && <span className={styles.mark}>{marks.join(' · ')}</span>}</p>
    <p>{value.monthRelation}；{value.dayRelation}</p>
    {value.supports.length > 0 && <p className={styles.secondary}>扶助：{value.supports.join('；')}</p>}
    {value.constraints.length > 0 && <p className={styles.secondary}>制约与待核：{value.constraints.join('；')}</p>}
  </div>;
}

function Focus({ reading }: { reading: LiuyaoReading }) {
  const focus = reading.focus;
  return <div>
    <p><strong>{focus.label}</strong>{focus.selected && <span className={styles.mark}>取第{focus.selected.position}爻{focus.selected.hidden ? '伏神' : ''} · {focus.selected.method === 'self' ? '自占取世' : focus.selected.method === 'single' ? '单一候选' : '手动指定'}</span>}</p>
    {focus.status === 'unselected' && <p className={styles.secondary}>尚未指定用神。先明确占问对象，再选择六亲类别或自占本人。</p>}
    {focus.status === 'multiple' && <p className={styles.secondary}>同类多现，当前保留全部候选。新建占问时可按实际问题指定具体爻位；尚未指定时不自动替你取舍。</p>}
    {focus.status === 'missing' && <p className={styles.secondary}>本卦及缺亲伏神中未定位到该类别，需重新核对占问与取用条件。</p>}
    {focus.candidates.length > 0 && <ul className={styles.candidates} aria-label="用神候选爻">{focus.candidates.map(candidate => <li key={`${candidate.position}:${candidate.hidden}`} className={candidate.selected ? styles.selected : undefined}>
      <p><strong>第{candidate.position}爻 · {candidate.kin} {candidate.stem}{candidate.branch}{candidate.element}</strong><span className={styles.mark}>{candidate.hidden ? '伏神' : '本卦'}{candidate.moving ? ' · 动' : ' · 静'}{candidate.role ? ` · ${candidate.role}` : ''}{candidate.selected ? ' · 已取用' : ''}</span></p>
      <Context value={candidate.context}/>
    </li>)}</ul>}
  </div>;
}

export default function LiuyaoReadingPanel({ reading, evidence }: { reading: LiuyaoReading; evidence: LiuyaoResult['evidence'] }) {
  const moving = reading.lines.filter(line => line.change);
  const flying = reading.lines.filter(line => line.flyingHidden && line.hidden);
  const sources = evidence.filter(item => item.id.startsWith('reading:'));
  const roleGroups = ['用神同类', '元神', '忌神', '仇神', '其他'] as const;
  return <section className={styles.panel} aria-label="六爻深化复核">
    <header className={styles.header}><div><p className={styles.eyebrow}>用神 · 月日 · 动变</p><h2>六爻条件复核</h2></div><span className={styles.version}>{reading.version}</span></header>
    <p className={styles.scope}>{reading.scope}</p>
    <details className={styles.section} open><summary>用神定位{reading.focus.selected ? ` · 第${reading.focus.selected.position}爻` : ` · ${reading.focus.candidates.length}个候选`}</summary><div className={styles.body}><Focus reading={reading}/></div></details>
    <LiuyaoInfluencePanel influence={reading.influence}/>
    <details className={styles.section} open><summary>逐爻月日与日冲复核</summary><div className={styles.body}><p className={styles.secondary}>分别展示月令与日辰关系，不折算综合分数。日冲静爻的暗动、日破仅列条件候选；有相反条件时一并保留。</p><ol className={styles.lineList} aria-label="逐爻月日复核">{[...reading.lines].reverse().map(line => <li key={line.position} value={line.position}>
      <div className={styles.rowHeading}><strong>第{line.position}爻</strong><span className={line.activation.status === 'none' ? styles.secondary : styles.accent}>{line.activation.label}</span></div><Context value={line.context}/>{line.activation.reasons.length > 0 && <p className={styles.secondary}>{line.activation.reasons.join('；')}</p>}
    </li>)}</ol></div></details>
    <details className={styles.section}><summary>动变与飞伏 · {moving.length}个实际动爻／{flying.length}个伏神</summary><div className={styles.body}>
      <h3>实际动爻</h3>{moving.length ? <ul className={styles.lineList}>{moving.map(line => <li key={line.position}>
        <p><strong>第{line.position}爻 · {line.change!.from} → {line.change!.to}</strong><span className={styles.mark}>{line.change!.label}</span></p><p>{line.change!.progressionDetail}</p>{(line.change!.clash || line.change!.combine) && <p className={styles.secondary}>本位动变地支：{[line.change!.clash && '相冲', line.change!.combine && '六合'].filter(Boolean).join('、')}；合化、冲散仍需结合月日。</p>}<Context value={line.change!.context}/>
      </li>)}</ul> : <p className={styles.secondary}>本卦无动爻，不把之卦整卦的静位当作实际变爻。</p>}
      <h3>缺亲伏神与飞伏关系</h3>{flying.length ? <ul className={styles.lineList}>{flying.map(line => <li key={line.position}><p><strong>第{line.position}爻 · {line.flyingHidden!.label}</strong></p><p>{line.flyingHidden!.detail}</p><Context value={line.hidden!}/></li>)}</ul> : <p className={styles.secondary}>本卦五类齐全，未补列缺亲伏神。</p>}
    </div></details>
    <details className={styles.section}><summary>用神同类、元神、忌神与仇神</summary><div className={styles.body}><p className={styles.secondary}>以下按所取用神的五行关系分类，名称表示生克关系；各爻能否起作用还要结合月日、空破与动静。</p>{reading.roles.length ? <div className={styles.roles}>{roleGroups.map(role => { const lines = reading.roles.filter(item => item.role === role); return lines.length ? <div key={role}><h3>{role}</h3><ul>{lines.map(item => <li key={`${item.position}:${item.hidden}`}><strong>第{item.position}爻{item.hidden ? '伏神' : ''} · {item.kin}{item.branch}{item.element}{item.moving ? ' · 动' : ''}</strong><p className={styles.secondary}>{item.detail}</p></li>)}</ul></div> : null; })}</div> : <p className={styles.secondary}>先定位具体用神，再建立元、忌、仇的对应关系。</p>}</div></details>
    <details className={styles.section}><summary>应期地支条件 · 不生成确定日期</summary><div className={styles.body}>{reading.timing.status === 'needs_selection' && <p className={styles.secondary}>尚未定位具体用神，暂不生成该爻的应期条件。</p>}{reading.timing.conditions.length > 0 && <ul className={styles.conditions}>{reading.timing.conditions.map((condition, index) => <li key={`${condition.label}:${index}`}><p><strong>{condition.label}</strong>{condition.branches.length > 0 && <span className={styles.mark}>{condition.branches.join('、')}</span>}</p><p className={styles.secondary}>{condition.detail}</p></li>)}</ul>}<p className={styles.secondary}>{reading.timing.note}</p></div></details>
    <details className={styles.section}><summary>本版规则边界与来源</summary><div className={styles.body}><ul>{reading.boundaries.map((boundary, index) => <li key={index}>{boundary}</li>)}</ul>{sources.map(source => <div className={styles.source} key={source.id}><strong>{source.label}</strong><p className={styles.secondary}>{source.detail}</p><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">核对原典来源</a></div>)}</div></details>
  </section>;
}
