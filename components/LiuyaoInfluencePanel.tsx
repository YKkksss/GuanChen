'use client';

import { useId, useState } from 'react';
import type { LiuyaoInfluenceNode, LiuyaoInfluenceReview } from '@/lib/liuyao/influence-types';
import styles from './LiuyaoInfluencePanel.module.css';

const VIEWS = [
  { id: 'candidates', label: '候选对照' },
  { id: 'paths', label: '作用路径' },
  { id: 'joint', label: '共同发动' },
  { id: 'sources', label: '规则来源' },
] as const;
type View = typeof VIEWS[number]['id'];

function nodeLabel(node: LiuyaoInfluenceNode) {
  return `第${node.position}爻${node.hidden ? '伏神' : '明爻'} · ${node.kin}${node.branch}${node.element}`;
}

function FactList({ title, items }: { title: string; items: string[] }) {
  return items.length > 0 ? <><h5>{title}</h5><ul className={styles.conditions}>{items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul></> : null;
}

function NodeFacts({ node }: { node: LiuyaoInfluenceNode }) {
  const context = node.context;
  const marks = [context.empty && '旬空', context.monthClash && '月冲', context.dayClash && '日冲', context.monthCombine && '月合', context.dayCombine && '日合'].filter(Boolean);
  return <div className={styles.detailBody}>
    <p className={styles.secondary}>{context.monthRelation}；{context.dayRelation}</p>
    {marks.length > 0 && <p className={styles.secondary}>{marks.join(' · ')}</p>}
    <FactList title="扶助条件" items={node.supportFacts}/>
    <FactList title="制约与相反条件" items={node.constraintFacts}/>
    {node.activation && node.activation.status !== 'none' && <><h5>日冲与动静</h5><p className={styles.secondary}>{node.activation.label}</p><ul className={styles.conditions}>{node.activation.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></>}
    {node.change && <><h5>本位动变</h5><p className={styles.secondary}>{node.change.from} → {node.change.to} · {node.change.label}</p><p className={styles.secondary}>{node.change.progressionDetail}</p><p className={styles.secondary}>变爻{node.change.context.monthRelation}；{node.change.context.dayRelation}</p><FactList title="变爻扶助" items={node.change.context.supports}/><FactList title="变爻限制" items={node.change.context.constraints}/></>}
    {node.flyingHidden && <><h5>飞伏条件</h5><p className={styles.secondary}>{node.flyingHidden.label}；{node.flyingHidden.detail}</p></>}
    <FactList title="仍待复核" items={node.pending}/>
  </div>;
}

export default function LiuyaoInfluencePanel({ influence }: { influence?: LiuyaoInfluenceReview }) {
  const id = useId();
  const [view, setView] = useState<View>('candidates');
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  if (!influence) return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><h3 id={`${id}-title`}>用神作用证据链</h3></header>
    <p className={`${styles.secondary} ${styles.legacy}`}>该记录保存于此前阶段，未记录多现候选与元、忌、仇的条件链。此处保留原有结果；新建占问可查看新版复核。</p>
  </section>;

  const nodes = new Map(influence.nodes.map(node => [node.id, node]));
  const candidates = influence.candidates.flatMap(candidate => {
    const node = nodes.get(candidate.nodeId);
    return node ? [{ ...candidate, node }] : [];
  });
  const selected = influence.selection.selectedId ? nodes.get(influence.selection.selectedId) : undefined;
  const activeId = candidates.some(candidate => candidate.nodeId === inspectedId) ? inspectedId : influence.selection.selectedId;
  const active = activeId ? nodes.get(activeId) : undefined;
  const paths = influence.paths.filter(path => path.to === activeId);
  const jointActions = influence.jointActions.filter(action => action.target === activeId);
  const switchView = (next: View) => setView(next);
  const targetPicker = <div className={styles.targetPicker}>
    <label htmlFor={`${id}-target`}>查看对象（不改用神）</label>
    <select id={`${id}-target`} value={activeId || ''} onChange={event => setInspectedId(event.target.value || null)}>
      {!selected && <option value="">请选择候选爻</option>}
      {candidates.map(candidate => <option key={candidate.nodeId} value={candidate.nodeId}>{nodeLabel(candidate.node)}{candidate.selected ? ' · 已取用' : ''}</option>)}
    </select>
  </div>;

  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><div><h3 id={`${id}-title`}>用神作用证据链</h3><p className={styles.secondary}>{candidates.length}个候选 · 逐项查看条件</p></div><span className={styles.version}>{influence.version}</span></header>
    <p className={`${styles.secondary} ${styles.scope}`}>{influence.scope}</p>
    <div className={styles.selection}><strong>{selected ? `已取用：${nodeLabel(selected)}` : influence.selection.status === 'multiple' ? '同类多现，尚未指定具体用神' : '尚未定位具体用神'}</strong>{influence.selection.note}</div>
    <div role="tablist" className={styles.tabs} aria-label="用神作用复核视图">
      {VIEWS.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}`} aria-selected={view === item.id} tabIndex={view === item.id ? 0 : -1}
        onClick={() => switchView(item.id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
          switchView(VIEWS[next].id);
          document.getElementById(`${id}-${VIEWS[next].id}-tab`)?.focus();
        }}>{item.label}</button>)}
    </div>

    <div role="tabpanel" className={styles.body} id={`${id}-candidates`} aria-labelledby={`${id}-candidates-tab`} hidden={view !== 'candidates'} tabIndex={0}>
      <p className={styles.secondary}>候选按爻位保留，不以条件数量评分或自动择优。查看某爻的路径不会更改已保存的取用。</p>
      {candidates.length ? <ul className={styles.list} aria-label="用神多现条件对照">{candidates.map(candidate => <li key={candidate.nodeId} className={`${styles.item}${candidate.selected ? ` ${styles.selected}` : ''}`}>
        <div className={styles.heading}><h4>{nodeLabel(candidate.node)}</h4>{candidate.selected && <span className={styles.mark}>已取用</span>}</div>
        <p className={styles.facts}><span>{candidate.node.hidden ? '伏神' : candidate.node.moving ? '实际动爻' : '静爻'}{candidate.node.role ? ` · ${candidate.node.role}` : ''}</span><span>月令{candidate.node.context.monthState}</span><span>{[candidate.node.context.empty && '旬空', candidate.node.context.monthClash && '月冲', candidate.node.context.dayClash && '日冲', candidate.node.context.monthCombine && '月合', candidate.node.context.dayCombine && '日合'].filter(Boolean).join(' · ') || '未见空、冲、合标记'}</span></p>
        <p className={styles.secondary}>{candidate.node.context.monthRelation}；{candidate.node.context.dayRelation}</p>
        <details className={styles.details}><summary>查看月日、动变与限制</summary><NodeFacts node={candidate.node}/></details>
        <button className={styles.inspect} type="button" onClick={() => { setInspectedId(candidate.nodeId); setView('paths'); document.getElementById(`${id}-paths-tab`)?.focus(); }}>查看第{candidate.node.position}爻{candidate.node.hidden ? '伏神' : '明爻'}作用路径</button>
      </li>)}</ul> : <p className={`${styles.secondary} ${styles.notice}`}>当前未定位候选。请先在新建占问时明确占问对象与取用类别。</p>}
    </div>

    <div role="tabpanel" className={styles.body} id={`${id}-paths`} aria-labelledby={`${id}-paths-tab`} hidden={view !== 'paths'} tabIndex={0}>
      {candidates.length > 0 && targetPicker}
      {!active ? <p className={styles.secondary}>先选择要查看的候选爻，再核对元、忌、仇与该爻的关系。</p> : <>
        <p className={`${styles.secondary} ${styles.notice}`}>当前查看：{nodeLabel(active)}。路径名称表示五行生克关系，能否起作用需逐项核对两侧条件。</p>
        {paths.length ? <ul className={styles.list} aria-label="元忌仇作用路径">{paths.map(path => {
          const source = nodes.get(path.from);
          const target = nodes.get(path.to);
          if (!source || !target) return null;
          const arrow = path.relation === 'same' ? '↔' : path.relation === 'generated_by' || path.relation === 'controlled_by' ? '←' : '→';
          const relationLabel = path.relation === 'same' ? '五行同类' : path.relation === 'generated_by' ? '目标生来源' : path.relation === 'controlled_by' ? '目标克来源' : path.relation === 'generates' ? '来源生目标' : '来源克目标';
          return <li key={path.id} className={styles.item}>
            <div className={styles.heading}><h4>{path.role} · {path.label}</h4><span className={styles.mark}>{path.mode === 'moving' ? '实际发动' : path.mode === 'hidden' ? '伏神条件' : '静爻条件'}</span></div>
            <p className={styles.route}><span>{nodeLabel(source)}</span><span className={styles.arrow} role="img" aria-label={relationLabel}>{arrow}</span><span>{nodeLabel(target)}</span></p>
            <p className={styles.secondary}>{path.detail}</p>
            <details className={styles.details}><summary>查看来源与目标两侧条件</summary><div className={styles.detailBody}><h4>来源：{nodeLabel(source)}</h4><NodeFacts node={source}/><h4 className={styles.subheading}>目标：{nodeLabel(target)}</h4><NodeFacts node={target}/></div></details>
          </li>;
        })}</ul> : <p className={`${styles.secondary} ${styles.notice}`}>该候选未记录可列示的来源路径。</p>}
      </>}
    </div>

    <div role="tabpanel" className={styles.body} id={`${id}-joint`} aria-labelledby={`${id}-joint-tab`} hidden={view !== 'joint'} tabIndex={0}>
      {candidates.length > 0 && <div className={styles.targetPicker}><label htmlFor={`${id}-joint-target`}>查看对象（不改用神）</label><select id={`${id}-joint-target`} value={activeId || ''} onChange={event => setInspectedId(event.target.value || null)}>{!selected && <option value="">请选择候选爻</option>}{candidates.map(candidate => <option key={candidate.nodeId} value={candidate.nodeId}>{nodeLabel(candidate.node)}{candidate.selected ? ' · 已取用' : ''}</option>)}</select></div>}
      <p className={styles.secondary}>共同发动的来源只列本卦实际动爻，目标是否发动按原盘保留；不把静爻、伏神或之卦其他位置自动视为发动。</p>
      {!active ? <p className={`${styles.secondary} ${styles.notice}`}>先选择要查看的候选爻。</p> : jointActions.length ? <ul className={styles.list} aria-label="共同发动条件链">{jointActions.map(action => <li key={action.id} className={styles.item}>
        <h4>{action.label}</h4>
        <ol className={styles.segments}>{action.segments.map((segment, index) => {
          const from = nodes.get(segment.from);
          const to = nodes.get(segment.to);
          return <li key={`${index}:${segment.from}:${segment.to}`}><span>{from ? nodeLabel(from) : '未记录来源节点'}</span><strong>{segment.label}</strong><span>{to ? nodeLabel(to) : '未记录目标节点'}</span></li>;
        })}</ol>
        <p className={styles.secondary}>{action.detail}</p>
        <details className={styles.details}><summary>查看共同发动限制与参与爻</summary><div className={styles.detailBody}><FactList title="仍待复核" items={action.pending}/>{action.nodes.map(nodeId => { const node = nodes.get(nodeId); return node ? <div key={nodeId}><h4 className={styles.subheading}>{nodeLabel(node)}</h4><NodeFacts node={node}/></div> : null; })}</div></details>
      </li>)}</ul> : <p className={`${styles.secondary} ${styles.notice}`}>该候选未记录忌元同动或仇忌同动的实际动爻组合；这不等于已确认没有其他作用。</p>}
    </div>

    <div role="tabpanel" className={styles.body} id={`${id}-sources`} aria-labelledby={`${id}-sources-tab`} hidden={view !== 'sources'} tabIndex={0}>
      {influence.sources.map(source => <div key={source.id} className={styles.source}><h4>{source.label}</h4><p className={styles.secondary}>{source.detail}</p><a href={source.url} target="_blank" rel="noopener noreferrer">核对原典来源</a></div>)}
      <details className={styles.details}><summary>本阶段规则边界</summary><div className={styles.detailBody}><ul className={styles.conditions}>{influence.boundaries.map((boundary, index) => <li key={index}>{boundary}</li>)}</ul></div></details>
    </div>
  </section>;
}
