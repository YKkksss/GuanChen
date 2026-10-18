'use client';

import { useId, useState } from 'react';
import type { MeihuaImagery, MeihuaImageryNode } from '@/lib/meihua/imagery-types';
import type { Line } from '@/lib/meihua/types';
import styles from './MeihuaImageryPanel.module.css';

const VIEWS = [
  { id: 'imagery', label: '卦象取象' },
  { id: 'trace', label: '爻位溯源' },
  { id: 'overlaps', label: '同源关系' },
  { id: 'sources', label: '规则来源' },
] as const;
type View = typeof VIEWS[number]['id'];
function lineName(value: Line) { return value ? '阳' : '阴'; }
function boardName(value: MeihuaImageryNode['sourceBoard']) { return value === 'primary' ? '本卦盘' : '变卦盘'; }
function linePositions(positions: number[]) { return positions.length ? positions.map(position => `第${position}爻`).join('、') : '无'; }

function Trace({ node }: { node: MeihuaImageryNode }) {
  return <ol className={styles.trace} aria-label={`${node.label}逐爻来源`}>{node.lineTrace.map((line, index) => <li key={`${line.position}:${line.originalPosition}:${index}`}>
    <strong>本位置第{line.position}爻 ← 本卦原第{line.originalPosition}爻</strong>
    <span>原值{lineName(line.originalValue)} → 此处{lineName(line.value)} · {line.flipped ? '已使用翻转爻值' : '未翻转'}</span>
  </li>)}</ol>;
}

export default function MeihuaImageryPanel({ imagery }: { imagery?: MeihuaImagery }) {
  const id = useId();
  const [view, setView] = useState<View>('imagery');
  if (!imagery) return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h2 id={`${id}-title`}>八卦取象与主互变溯源</h2></header>
    <p className={`${styles.note} ${styles.legacy}`}>这份记录尚未保存八卦取象与爻位溯源。原卦、原依据及已有复核继续保留，回看不补算；新建占问可查看新版条件。</p>
  </section>;

  const nodes = new Map(imagery.nodes.map(node => [node.key, node]));
  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h2 id={`${id}-title`}>八卦取象与主互变溯源</h2></header>
    <p className={`${styles.note} ${styles.scope}`}>分别核对五个结构位置的类象候选与原爻来源。本体固定，重复卦和共享爻不作为独立证据投票；类象不自动对应现实人物、事物或结果。</p>
    <div className={styles.tabs} role="tablist" aria-label="梅花取象溯源视图">{VIEWS.map((item, index) => <button type="button" role="tab" key={item.id} id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}`} aria-selected={view === item.id} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
      setView(VIEWS[next].id);
      document.getElementById(`${id}-${VIEWS[next].id}-tab`)?.focus();
    }}>{item.label}</button>)}</div>

    <div className={styles.body} role="tabpanel" id={`${id}-imagery`} aria-labelledby={`${id}-imagery-tab`} hidden={view !== 'imagery'} tabIndex={0}>
      <p className={styles.note}>同一八卦可以有多种取象。下列为保存目录中的候选，不根据占问文字擅自锁定其中一种；季节标签沿用原有参考。</p>
      <ul className={styles.cards} aria-label="五位置八卦取象候选">{imagery.nodes.map(node => <li key={node.key}>
        <div className={styles.rowHeading}><h3>{node.label}</h3><strong className={styles.symbol}>{node.trigram.name}{node.trigram.image} · {node.trigram.element}</strong></div>
        <p className={styles.facts}><span>{node.relationship}</span><span>{node.seasonState ? `季节${node.seasonState}` : '季节未定位'}</span></p>
        <dl className={styles.candidateGroup}><dt>自然类象候选</dt><dd>{node.symbolicCandidates.nature.join('、') || '本目录未列'}</dd></dl>
        <details className={styles.details}><summary>展开物象与形态候选</summary><div className={styles.detailBody}>
          <dl className={styles.candidateGroup}><dt>物象候选</dt><dd>{node.symbolicCandidates.objects.join('、') || '本目录未列'}</dd></dl>
          <dl className={styles.candidateGroup}><dt>形态候选</dt><dd>{node.symbolicCandidates.forms.join('、') || '本目录未列'}</dd></dl>
          <p className={styles.note}>候选并列，不将词目数量换算成权重或结论。</p>
        </div></details>
      </li>)}</ul>
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-trace`} aria-labelledby={`${id}-trace-tab`} hidden={view !== 'trace'} tabIndex={0}>
      <div className={styles.notice}><strong>主变只翻转本卦原第{imagery.change.originalMovingLine}爻</strong><p>本用局部第{imagery.change.localMovingLine}爻：{lineName(imagery.change.before)} → {lineName(imagery.change.after)}。本卦固定体保留，不因变卦重新换体。</p><p>互卦取源：{imagery.mutualSource === 'primary' ? '本卦盘' : '变卦盘'}。以下来源均按保存时互卦口径展示。</p></div>
      <p className={styles.note}>各位置内部从下向上编号。“包含原动爻位置”只说明取入了该原位置；“使用翻转值”另外核对，不能混称已经翻转。</p>
      <ul className={styles.cards} aria-label="五位置爻位溯源">{imagery.nodes.map(node => <li key={node.key}>
        <div className={styles.rowHeading}><h3>{node.label}</h3><strong className={styles.symbol}>{node.trigram.name}{node.trigram.image}</strong></div>
        <p>取自{boardName(node.sourceBoard)} · 原爻位：{linePositions(node.sourceLinePositions)}</p>
        <p className={styles.note}>包含原动爻位置：{node.containsMovingOrigin ? '是' : '否'}。</p><p className={styles.note}>实际使用翻转爻值：{node.changedApplied ? '是' : '否'}。</p>
        <details className={styles.details}><summary>逐爻核对原值与此处爻值</summary><div className={styles.detailBody}><Trace node={node}/><p className={styles.ruleId}>依据编号：{node.evidenceId}</p></div></details>
      </li>)}</ul>
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-overlaps`} aria-labelledby={`${id}-overlaps-tab`} hidden={view !== 'overlaps'} tabIndex={0}>
      <p className={styles.note}>五个位置的{imagery.overlaps.length}组配对逐项保留。没有共享原爻，也不意味着它们来自两次独立起卦；相同卦象同样不能多投一票。</p>
      <ul className={styles.cards} aria-label="完整节点同源配对">{imagery.overlaps.map((overlap, index) => {
        const left = nodes.get(overlap.left), right = nodes.get(overlap.right);
        if (!left || !right) return null;
        return <li key={`${overlap.evidenceId}:${index}`}><details className={`${styles.details} ${styles.pairDetails}`}><summary>{left.label} ↔ {right.label}</summary><div className={styles.detailBody}>
          <p>卦象：{left.trigram.name}／{right.trigram.name} · {overlap.sameTrigram ? '相同卦象，仍保留两个结构身份' : '卦象不同，仍同出一卦结构'}。</p>
          <p>共享本卦原爻位：{linePositions(overlap.originalLines)}。</p>
          <p>同一原爻位在两侧的现值不同：{linePositions(overlap.differentValues)}。</p>
          {overlap.originalLines.length > 0 && <ul className={styles.plainList}>{overlap.originalLines.map(position => {
            const leftLine = left.lineTrace.find(line => line.originalPosition === position), rightLine = right.lineTrace.find(line => line.originalPosition === position);
            return <li key={position}>原第{position}爻：{left.label}{leftLine ? lineName(leftLine.value) : '值未记录'}／{right.label}{rightLine ? lineName(rightLine.value) : '值未记录'}。</li>;
          })}</ul>}
          <p className={styles.note}>原位置共用与变爻后的阴阳差异分开核对；它们是结构来源，不构成现实事件的相互印证。</p><p className={styles.ruleId}>依据编号：{overlap.evidenceId}</p>
        </div></details></li>;
      })}</ul>
    </div>

    <div className={styles.body} role="tabpanel" id={`${id}-sources`} aria-labelledby={`${id}-sources-tab`} hidden={view !== 'sources'} tabIndex={0}>
      {imagery.sources.map(source => <div className={styles.source} key={source.id}><h3>{source.title}</h3><p className={styles.note}>{source.note}</p><a href={source.url} target="_blank" rel="noopener noreferrer">核对取象与爻位来源</a></div>)}
      <details className={styles.details}><summary>本阶段规则边界</summary><div className={styles.detailBody}><ul className={styles.plainList}>{imagery.boundaries.map((boundary, index) => <li key={index}>{boundary}</li>)}</ul></div></details>
      <details className={styles.details}><summary>目录版本与依据编号</summary><div className={styles.detailBody}><p className={styles.note}>取象层：{imagery.version}</p><p className={styles.note}>候选目录：{imagery.catalogVersion}</p><p className={styles.note}>主变依据：{imagery.change.evidenceId}</p><ul className={styles.plainList}>{imagery.nodes.map(node => <li key={node.key}>{node.label} · 类象来源：{node.symbolicCandidates.sourceId} · 位置依据：{node.evidenceId}</li>)}</ul></div></details>
    </div>
  </section>;
}
