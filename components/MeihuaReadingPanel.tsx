import type { MeihuaReading } from '@/lib/meihua/reading-types';
import type { MeihuaEvidence } from '@/lib/meihua/types';
import styles from './MeihuaReadingPanel.module.css';
export default function MeihuaReadingPanel({ reading, evidence }: { reading?: MeihuaReading; evidence: MeihuaEvidence[] }) {
  if (!reading) return <section className={styles.panel} aria-label="梅花深化复核"><h2>这是一份第一版固定卦象</h2><p>保存时尚未含季节与条件应期复核。原卦与原依据继续保留，回看不重新计算；需要新复核时请另建占问。</p></section>;
  return <section className={styles.panel} aria-label="梅花深化复核">
    <header><p className={styles.eyebrow}>体用互变 · 季节条件</p><h2>季节与条件应期复核</h2></header>
    {reading.context ? <div className={styles.inset}><strong>{reading.context.source === 'cast' ? '起卦时刻' : '补充的季节参考时刻'}：{reading.context.dateTime.replace('T', ' ')}</strong><p>北京时间 UTC+08:00 · {reading.context.label} · {reading.context.monthBranch}月属{reading.context.monthElement}</p><p className={styles.note}>{reading.context.note}</p></div> : <p className={styles.inset}>未提供季节参考时刻，季节状态未定位。没有自动套用现在的时间；下方仍可核对固定体用关系。</p>}
    <div className={styles.rows}>{reading.rows.map(row => <section key={row.key}><h3>{row.label}</h3><p><strong>{row.trigram.name} · {row.trigram.element}</strong> <span className={styles.tag}>{row.state ? `季节${row.state}` : '季节未定位'}</span></p><p>{row.relationship}</p></section>)}</div>
    <p className={styles.note}>“旺相休囚死”为传统五行季节术语，不是对人体、寿命或事情成败的判断。季节标签不改写生克方向，也不形成最终强弱评分。</p>
    <details className={styles.details}><summary>结构位置与相反条件并列</summary><dl>{reading.groups.map(group => <div key={group.relationship}><dt>{group.relationship}</dt><dd>{group.positions.join('、') || '当前未列'}</dd></div>)}</dl><p>{reading.groups[0]?.note}</p></details>
    <section className={styles.timing} aria-label="梅花条件应期"><h3>条件应期观察</h3><p>本次明确参考：<strong>{reading.timing.label} · {reading.timing.trigram.name}{reading.timing.trigram.element}</strong></p><p className={styles.note}>先天卦数 {reading.timing.number}，只作象数记录。</p><ul>{reading.timing.conditions.map(condition => <li key={condition.label}><strong>{condition.label}：{condition.branches.join('、')}</strong><p>{condition.detail}</p></li>)}</ul><p className={styles.inset}>{reading.timing.note}</p></section>
    <details className={styles.details}><summary>复核范围、版本与规则来源</summary><p className={styles.note}>规则版本：{reading.version}</p><ul>{reading.boundaries.map((text,i) => <li key={i}>{text}</li>)}</ul>{evidence.filter(e => e.id.startsWith('reading:') && !e.id.startsWith('reading:imagery:') && !e.id.startsWith('reading:scenario:')).map(e => <div className={styles.source} key={e.id}><strong>{e.label}</strong><p>{e.detail}</p><a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">查看原典来源</a></div>)}</details>
  </section>;
}
