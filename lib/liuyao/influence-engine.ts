import { CONTROLS, GENERATES, READING_SOURCES } from './reading-rules';
import type { LiuyaoReading } from './reading-types';
import { LIUYAO_INFLUENCE_VERSION, type LiuyaoInfluenceNode, type LiuyaoInfluencePath, type LiuyaoInfluenceReview, type LiuyaoJointAction } from './influence-types';
import type { LiuyaoResult } from './types';

function nodeId(position: number, hidden: boolean) {
  return `${hidden ? 'hidden' : 'line'}-${position}`;
}

function name(node: LiuyaoInfluenceNode) {
  return `第${node.position}爻${node.hidden ? '伏神' : '本爻'}${node.kin}${node.branch}${node.element}`;
}

function relationFor(from: LiuyaoInfluenceNode, to: LiuyaoInfluenceNode): LiuyaoInfluencePath['relation'] {
  if (from.element === to.element) return 'same';
  if (GENERATES[from.element] === to.element) return 'generates';
  if (GENERATES[to.element] === from.element) return 'generated_by';
  return CONTROLS[from.element] === to.element ? 'controls' : 'controlled_by';
}

/** 只连接已保存的节点及已计算条件，不改变取用、动静或原有应期。 */
export function analyzeLiuyaoInfluence(result: LiuyaoResult, reading: LiuyaoReading): LiuyaoInfluenceReview {
  const nodes: LiuyaoInfluenceNode[] = result.lines.flatMap(line => {
    const review = reading.lines.find(item => item.position === line.position)!;
    const visible: LiuyaoInfluenceNode = {
      id: nodeId(line.position, false), position: line.position, hidden: false,
      branch: line.branch, element: line.element, kin: line.kin, moving: line.moving, role: line.role,
      context: review.context, activation: review.activation, change: review.change, flyingHidden: null,
      supportFacts: [...review.context.supports], constraintFacts: [...review.context.constraints],
      pending: [line.moving ? '原记录为明动；发动本身不等于生克有效。' : '原记录为静爻；五行关系不等于主动作用，暗动仍按候选复核。'],
    };
    if (review.context.monthCombine || review.context.dayCombine) {
      visible.pending.push('月日有六合关系；合起、合绊或合化效力尚未裁定。');
    }
    if (review.activation.status !== 'none') visible.pending.push(review.activation.label, ...review.activation.reasons);
    if (review.change) {
      const change = review.change;
      if (change.relation === 'generates') visible.supportFacts.push(`本位变爻${change.to}回头生，是来源自身的生扶入口，未裁定实际效力。`);
      if (change.relation === 'controls') visible.constraintFacts.push(`本位变爻${change.to}回头克原动爻${change.from}，不能只凭原爻生用或克用忽略此制约。`);
      visible.constraintFacts.push(...change.context.constraints.map(fact => `本位变爻：${fact}`));
      visible.pending.push(`本位动变：${change.label}；${change.progressionDetail}`);
      if (change.clash || change.combine) visible.pending.push(`本位动变${[change.clash && '正冲', change.combine && '六合'].filter(Boolean).join('、')}；是否冲散、合绊另核。`);
    }
    if (!line.hidden || !review.hidden) return [visible];
    const hidden: LiuyaoInfluenceNode = {
      id: nodeId(line.position, true), position: line.position, hidden: true,
      branch: line.hidden.branch, element: line.hidden.element, kin: line.hidden.kin,
      moving: false, role: '伏神', context: review.hidden, activation: null, change: null,
      flyingHidden: review.flyingHidden,
      supportFacts: [...review.hidden.supports], constraintFacts: [...review.hidden.constraints],
      pending: ['伏神没有原始明动记录，不因飞爻发动而视为伏神发动；尚未裁定出伏与可用。'],
    };
    if (review.flyingHidden) hidden.pending.push(`${review.flyingHidden.label}：${review.flyingHidden.detail}`);
    if (review.hidden.monthCombine || review.hidden.dayCombine) hidden.pending.push('伏神与月日有六合关系，未据此判断出伏或生克效力。');
    return [visible, hidden];
  });
  const candidates = reading.focus.candidates.map(candidate => ({ nodeId: nodeId(candidate.position, candidate.hidden), selected: candidate.selected }));
  const selectedId = candidates.find(candidate => candidate.selected)?.nodeId ?? null;
  const paths: LiuyaoInfluencePath[] = [];
  const jointActions: LiuyaoJointAction[] = [];
  for (const candidate of candidates) {
    const target = nodes.find(node => node.id === candidate.nodeId)!;
    for (const source of nodes) {
      // 同位飞爻和伏神身份不同；只排除同一节点本身。
      if (source.id === target.id) continue;
      const relation = relationFor(source, target);
      const role: LiuyaoInfluencePath['role'] = relation === 'same' ? '用神同类' : relation === 'generates' ? '元神' : relation === 'controls' ? '忌神' : relation === 'controlled_by' ? '仇神' : '其他';
      const label = { same: '来源与用神同五行', generates: '来源生用神', controls: '来源克用神', generated_by: '用神生来源（泄的关系）', controlled_by: '用神克来源（耗的关系）' }[relation];
      const mode = source.hidden ? 'hidden' : source.moving ? 'moving' : 'static';
      paths.push({ id: `${source.id}-to-${target.id}`, from: source.id, to: target.id, role, relation, label, mode,
        detail: `${name(source)}与${name(target)}：${label}。${mode === 'moving' ? '来源为原记录明动爻，仍须核对来源及目标的条件。' : mode === 'hidden' ? '来源为伏神，只列关系，不假定已经出伏或发动。' : '来源为静爻，只列关系，不假定已经发动。'}${role === '仇神' ? '仇神是克元、生忌的五行类别，不是直接克用神；只有实际元神或忌神存在时才列具体链路。' : ''}`,
      });
    }
    const moving = nodes.filter(node => !node.hidden && node.moving && node.id !== target.id);
    const yuan = moving.filter(node => GENERATES[node.element] === target.element);
    const ji = moving.filter(node => CONTROLS[node.element] === target.element);
    const chou = moving.filter(node => CONTROLS[target.element] === node.element);
    for (const j of ji) {
      for (const y of yuan) {
        if (j.id === y.id || GENERATES[j.element] !== y.element) continue;
        jointActions.push({ id: `ji-yuan-${j.id}-${y.id}-to-${target.id}`, target: target.id, nodes: [j.id, y.id, target.id], kind: 'ji_yuan', label: '忌元同动 · 接续相生条件',
          segments: [{ from: j.id, to: y.id, relation: 'generates', label: '忌神生元神' }, { from: y.id, to: target.id, relation: 'generates', label: '元神生用神' }],
          detail: '两来源均为原记录明动，五行形成忌生元、元生用的连接；原来的忌克用路径仍保留，不自动认定贪生忘克、化解或生扶成功。',
          pending: ['分别核对忌神、元神自身月日、空破、本位动变及用神承受条件。', '同动结构不等于两来源已经有效；不能据此消除回头克、旬空、月破或宣布吉凶。'],
        });
      }
      for (const c of chou) {
        if (c.id === j.id || GENERATES[c.element] !== j.element) continue;
        jointActions.push({ id: `chou-ji-${c.id}-${j.id}-to-${target.id}`, target: target.id, nodes: [c.id, j.id, target.id], kind: 'chou_ji', label: '仇忌同动 · 生忌克用条件',
          segments: [{ from: c.id, to: j.id, relation: 'generates', label: '仇神生忌神' }, { from: j.id, to: target.id, relation: 'controls', label: '忌神克用神' }],
          detail: '两来源均为原记录明动，五行形成仇生忌、忌克用的连接；不把仇神直接画成克用，也不把这条链认定为实际伤害或事件结果。',
          pending: ['分别核对仇神、忌神自身月日、空破、本位动变及用神条件。', '若同时存在忌元同动链，应并列复核，不按链路数量投票、抵消或排序。'],
        });
      }
    }
  }
  return {
    version: LIUYAO_INFLUENCE_VERSION,
    scope: '按候选连接原局来源、自身制约和共同发动结构；不新增用神排名，不裁定完整生克效力或现实结果。',
    selection: { status: reading.focus.status, selectedId,
      note: selectedId ? '按保存时自占取世、唯一候选或用户手选的用神复核；其他候选仍可对照。' : candidates.length ? '多现尚未取定：逐候选独立对照；页面切换候选只改变查看对象，不替用户取用。' : '尚无明确用神候选，请先在新建占问中选择对象或六亲。' },
    nodes, candidates, paths, jointActions,
    sources: [
      { id: 'multiple', label: '用神多现与取用边界', url: READING_SOURCES.multiple, detail: '候选按原爻位保序，保留月日、空破与动变条件；本阶段不将原典取用论述简化为自动排名。' },
      { id: 'effectiveness', label: '元忌衰旺与共同发动条件', url: READING_SOURCES.effectiveness, detail: '复核来源自身条件及忌元、仇忌同动的结构；原典中的确定性断语不转换为程序事件结论，仍保留用神条件与反证。' },
      { id: 'change', label: '实际动变与本位回头生克', url: READING_SOURCES.change, detail: '回头生克只在原明动爻本位核对，变爻不作为跨位来源；支持与制约分别保留。' },
      { id: 'empty', label: '旬空与反向条件并列', url: READING_SOURCES.empty, detail: '旬空、月破不被一条生扶线或共同发动链自动解除，完整效力与应期另核。' },
    ],
    boundaries: [
      '所有来源仅为本卦明爻和缺亲伏神；实际变爻只嵌于本位，不新增跨位来源。',
      '关系箭头表示五行方向；静爻、暗动候选和伏神不能自动当作明动来源。',
      '同支、六合、月日生扶与旬空、月破、回头克等相反条件同时保留，不计总分或自动取用。',
      '共同发动只识别原明动节点的接续结构，不据此判贪生忘克、制化成功、出伏或应验日期。',
      '三合、墓绝、反伏吟、全局生克优先级与完整有效性仍未裁决。',
    ],
  };
}

/** 逐候选摘要复用节点条件；每条路径不重复展开整盘，以控制问答上下文大小。 */
export function influenceEvidence(review: LiuyaoInfluenceReview): LiuyaoResult['evidence'] {
  const describe = (id: string) => name(review.nodes.find(node => node.id === id)!);
  return [
    { id: 'reading:influence:policy', label: '用神作用链复核范围', detail: `${review.version}。${review.scope}${review.selection.note}${review.boundaries.join(' ')}`, sourceUrl: READING_SOURCES.effectiveness },
    ...review.candidates.map(candidate => {
      const node = review.nodes.find(item => item.id === candidate.nodeId)!;
      const paths = review.paths.filter(path => path.to === node.id);
      const joints = review.jointActions.filter(joint => joint.target === node.id);
      return { id: `reading:influence:target:${node.id}`, label: `${name(node)}候选与来源条件`,
        detail: `${candidate.selected ? '保存时已取用' : '仅为候选，未据此另取用'}。${node.context.monthRelation}，${node.context.dayRelation}。生扶入口：${node.supportFacts.join(' ') || '当前未列出'}。制约：${node.constraintFacts.join(' ') || '当前未列出不等于无制约'}。${node.pending.join(' ')}来源：${paths.map(path => `${describe(path.from)}（${path.mode === 'moving' ? '明动' : path.mode === 'hidden' ? '伏神' : '静'}，${path.role}）：${path.label}`).join('；') || '无其他来源'}。共同发动：${joints.map(joint => joint.label).join('；') || '当前未识别'}。来源自身条件必须结合实际节点一起核对，不凭箭头认定有效。`, sourceUrl: READING_SOURCES.effectiveness };
    }),
    ...review.nodes.map(node => ({ id: `reading:influence:node:${node.id}`, label: `${name(node)}自身条件`, detail: `${node.moving ? '原记录明动' : node.hidden ? '伏神，未判出伏' : '原记录静爻'}；${node.context.monthRelation}，${node.context.dayRelation}。生扶入口：${node.supportFacts.join(' ') || '当前未列出'}。制约：${node.constraintFacts.join(' ') || '当前未列出不等于无制约'}。${node.pending.join(' ')}`, sourceUrl: READING_SOURCES.effectiveness })),
    ...review.jointActions.map(joint => ({ id: `reading:influence:joint:${joint.id}`, label: joint.label,
      detail: `${joint.segments.map(segment => `${describe(segment.from)}→${describe(segment.to)}：${segment.label}`).join('；')}。${joint.detail}${joint.pending.join(' ')}`, sourceUrl: READING_SOURCES.effectiveness })),
  ];
}
