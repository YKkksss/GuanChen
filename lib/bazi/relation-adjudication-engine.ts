import {
  BAZI_RELATION_ADJUDICATION_ENGINE_VERSION,
  BAZI_RELATION_ADJUDICATION_METHODOLOGY,
  BAZI_RELATION_ADJUDICATION_METHODOLOGY_VERSION,
} from './relation-adjudication-methodology';
import type {
  BaziRelationAdjudicationResult,
  BaziRelationAdjudicationSegment,
  BaziRelationAdjudicationYear,
  BaziRelationConditionCheck,
  BaziRelationConditionDecision,
  BaziRelationConditionState,
  BaziRelationConflictCluster,
} from './relation-adjudication-types';
import type {
  BaziRelationAuditResult,
  BaziRelationAuditSegment,
  BaziRelationEvidence,
  BaziRelationLayer,
  BaziRelationParticipant,
  BaziRelationScope,
  BaziRelationType,
} from './relation-audit-types';
import type { BaziCalculationResult, BaziElement, BaziPillar, BaziPillarKey } from './types';

const BRANCH_ELEMENTS: Record<string, BaziElement> = {
  寅: '木', 卯: '木', 巳: '火', 午: '火', 辰: '土', 戌: '土', 丑: '土', 未: '土',
  申: '金', 酉: '金', 亥: '水', 子: '水',
};

const CONDITIONAL_TYPES = new Set<BaziRelationType>([
  'stem_five_combine',
  'branch_six_combine',
  'branch_clash',
  'branch_harm',
  'branch_mutual_punishment',
  'branch_self_punishment',
  'branch_three_harmony',
  'branch_three_meeting',
  'branch_three_punishment',
]);

const SET_DEFINITIONS: Array<{
  type: 'branch_three_harmony' | 'branch_three_meeting' | 'branch_three_punishment';
  label: string;
  members: string[];
  targetElement: BaziElement | null;
  ruleId: string;
}> = [
  { type: 'branch_three_harmony', label: '申子辰三合', members: ['申', '子', '辰'], targetElement: '水', ruleId: 'partial-three-harmony-water' },
  { type: 'branch_three_harmony', label: '亥卯未三合', members: ['亥', '卯', '未'], targetElement: '木', ruleId: 'partial-three-harmony-wood' },
  { type: 'branch_three_harmony', label: '寅午戌三合', members: ['寅', '午', '戌'], targetElement: '火', ruleId: 'partial-three-harmony-fire' },
  { type: 'branch_three_harmony', label: '巳酉丑三合', members: ['巳', '酉', '丑'], targetElement: '金', ruleId: 'partial-three-harmony-metal' },
  { type: 'branch_three_meeting', label: '亥子丑三会', members: ['亥', '子', '丑'], targetElement: '水', ruleId: 'partial-three-meeting-water' },
  { type: 'branch_three_meeting', label: '寅卯辰三会', members: ['寅', '卯', '辰'], targetElement: '木', ruleId: 'partial-three-meeting-wood' },
  { type: 'branch_three_meeting', label: '巳午未三会', members: ['巳', '午', '未'], targetElement: '火', ruleId: 'partial-three-meeting-fire' },
  { type: 'branch_three_meeting', label: '申酉戌三会', members: ['申', '酉', '戌'], targetElement: '金', ruleId: 'partial-three-meeting-metal' },
  { type: 'branch_three_punishment', label: '寅巳申三刑', members: ['寅', '巳', '申'], targetElement: null, ruleId: 'partial-three-punishment-yin-si-shen' },
  { type: 'branch_three_punishment', label: '丑戌未三刑', members: ['丑', '戌', '未'], targetElement: null, ruleId: 'partial-three-punishment-chou-xu-wei' },
];

const RELATION_TYPE_LABELS: Record<BaziRelationType, string> = {
  stem_same_element: '天干同类', stem_generate: '天干相生', stem_control: '天干相克', stem_five_combine: '天干五合',
  branch_six_combine: '六合', branch_clash: '六冲', branch_harm: '六害',
  branch_mutual_punishment: '子卯刑', branch_self_punishment: '自刑',
  branch_three_harmony: '三合', branch_three_meeting: '三会', branch_three_punishment: '三刑',
};

const STATE_LABELS: Record<BaziRelationConditionState, string> = {
  conditions_met: '可核验条件齐备',
  conditions_missing: '条件缺失',
  relations_coexist: '关系并见',
  deferred_adjudication: '暂缓裁决',
};

interface SegmentNode {
  id: string;
  layer: BaziRelationLayer;
  label: string;
  pillarKey: BaziPillarKey | null;
  stem: string;
  branch: string;
  branchElement: BaziElement;
  luckCycleIndex: number | null;
  annualYear: number | null;
}

export function adjudicateBaziRelations(
  chart: BaziCalculationResult,
  relationAudit: BaziRelationAuditResult,
): BaziRelationAdjudicationResult {
  const years = relationAudit.years.map(year => adjudicateYear(chart, year));
  return {
    methodologyVersion: BAZI_RELATION_ADJUDICATION_METHODOLOGY_VERSION,
    engineVersion: BAZI_RELATION_ADJUDICATION_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: relationAudit.status,
    capabilities: {
      conditionAudit: true,
      partialSetCandidates: true,
      conflictCoexistence: true,
      transformationVerdict: false,
      relationPriorityVerdict: false,
      strengthEffectVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      relationAuditMethodologyVersion: relationAudit.methodologyVersion,
      relationAuditEngineVersion: relationAudit.engineVersion,
      relationAuditStatus: relationAudit.status,
    },
    range: { ...relationAudit.range },
    years,
    rulesApplied: [
      '只消费 M9-6 已版本化的完整关系证据，并保持原时间片段不变',
      '五合只检查月支支持和妒合干入口条件，不宣告化气成立',
      '三字集合仅有两个成员时记录缺失成员，不称完整三合、三会或三刑',
      '原局柱位邻近只作为位置证据，不换算力量权重',
      '同一参与节点命中多种地支关系时记录关系并见，不判断哪一项优先',
    ],
    warnings: [
      '“可核验条件齐备”只表示当前版本列出的入口条件通过，不等于合化、解冲或破合成立。',
      '“关系并见”只表示同一节点同时参与多种规则，不提供力量大小或优先顺序。',
      '条件状态不得用于旺衰、喜忌、吉凶、健康、财富、婚姻、事业或具体事件推断。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，所有涉及时柱的条件与冲突均未参与审计。'] : []),
    ],
    boundary: '本结果是传统干支关系的条件与冲突证据审计，不是科学因果结论；条件齐备不等于合化成立，关系并见不等于已经裁决优先级。',
  };
}

function adjudicateYear(
  chart: BaziCalculationResult,
  year: BaziRelationAuditResult['years'][number],
): BaziRelationAdjudicationYear {
  const segments = year.segments.map(segment => adjudicateSegment(chart, year.year, year.annualGanZhi, segment));
  return {
    year: year.year,
    annualGanZhi: year.annualGanZhi,
    segments,
    decisionCount: segments.reduce((total, segment) => total + segment.counts.total, 0),
    conflictCount: segments.reduce((total, segment) => total + segment.conflicts.length, 0),
    boundary: '同一流年的前后大运片段独立裁决；任何条件或冲突不得跨越真实交运边界。',
  };
}

function adjudicateSegment(
  chart: BaziCalculationResult,
  year: number,
  annualGanZhi: string,
  segment: BaziRelationAuditSegment,
): BaziRelationAdjudicationSegment {
  const nodes = buildSegmentNodes(chart, year, annualGanZhi, segment);
  const conditionalEvidence = segment.evidence.filter(item => CONDITIONAL_TYPES.has(item.type));
  const conflicts = buildConflictClusters(year, segment.segmentIndex, conditionalEvidence);
  const decisions = [
    ...conditionalEvidence.map(evidence => adjudicateEvidence(chart, nodes, evidence, conflicts)),
    ...buildPartialSetDecisions(year, segment.segmentIndex, nodes),
  ].sort((left, right) => `${left.state}-${left.domain}-${left.label}`.localeCompare(`${right.state}-${right.domain}-${right.label}`, 'zh-CN'));
  const count = (state: BaziRelationConditionState) => decisions.filter(item => item.state === state).length;
  return {
    segmentIndex: segment.segmentIndex,
    startAt: segment.startAt,
    endAtExclusive: segment.endAtExclusive,
    luckCycleIndex: segment.luckCycleIndex,
    luckCycleGanZhi: segment.luckCycleGanZhi,
    label: segment.label,
    decisions,
    conflicts,
    counts: {
      conditionsMet: count('conditions_met'),
      conditionsMissing: count('conditions_missing'),
      relationsCoexist: count('relations_coexist'),
      deferredAdjudication: count('deferred_adjudication'),
      total: decisions.length,
    },
  };
}

function adjudicateEvidence(
  chart: BaziCalculationResult,
  nodes: SegmentNode[],
  evidence: BaziRelationEvidence,
  conflicts: BaziRelationConflictCluster[],
): BaziRelationConditionDecision {
  const checks: BaziRelationConditionCheck[] = [
    makeCheck('structural_membership', '结构成员', 'met', 'M9-6 已命中该关系的完整结构成员。', `${evidence.ruleId}-members`),
    makeCheck('same_timeline_segment', '时间片段', 'met', '全部参与节点属于同一个真实流年—大运时间片段。', 'same-timeline-segment'),
    buildNatalPositionCheck(evidence.participants),
  ];

  if (evidence.type === 'stem_five_combine') {
    const gate = findStemGate(evidence);
    const monthBranch = chart.pillars.month.branch;
    if (!gate) {
      checks.push(makeCheck('month_support', '月支支持', 'deferred', '未找到对应的五合条件配置，暂缓裁决。', 'stem-gate-missing'));
    } else {
      const monthSupported = gate.supportingMonths.includes(monthBranch);
      checks.push(makeCheck(
        'month_support', '月支支持', monthSupported ? 'met' : 'missing',
        monthSupported
          ? `原局月支为${monthBranch}，属于${gate.pair}传统化${gate.targetElement}入口所列支持月支。`
          : `原局月支为${monthBranch}，不在${gate.pair}传统化${gate.targetElement}入口所列支持月支中。`,
        `stem-five-combine-${gate.pair}-month-support`,
      ));
      const competingNodes = nodes.filter(node => node.stem === gate.competingStem);
      checks.push(makeCheck(
        'competing_stem_absence', '妒合干检查', competingNodes.length ? 'conflict' : 'met',
        competingNodes.length
          ? `同片段另见${gate.competingStem}干（${competingNodes.map(node => node.label).join('、')}），记录条件冲突，不自动解释结果。`
          : `同片段未见该规则所列${gate.competingStem}干。`,
        `stem-five-combine-${gate.pair}-competing-stem`,
      ));
    }
  }

  const coexistingEvidenceIds = conflicts
    .filter(cluster => cluster.evidenceIds.includes(evidence.id))
    .flatMap(cluster => cluster.evidenceIds)
    .filter(id => id !== evidence.id)
    .filter((id, index, values) => values.indexOf(id) === index);
  if (coexistingEvidenceIds.length) checks.push(makeCheck(
    'coexisting_relation', '关系并见', 'conflict',
    `同一参与节点还命中 ${coexistingEvidenceIds.length} 条其他地支关系；只记录并见，不裁决优先级。`,
    'coexisting-relation-no-priority',
  ));

  const state = resolveState(checks);
  return {
    id: `decision-${evidence.id}`,
    sourceEvidenceId: evidence.id,
    domain: evidence.domain,
    type: evidence.type,
    scope: evidence.scope,
    label: evidence.label,
    participants: evidence.participants,
    targetElement: evidence.targetElement,
    state,
    stateLabel: STATE_LABELS[state],
    missingSymbols: [],
    checks,
    coexistingEvidenceIds,
    boundary: buildDecisionBoundary(state, evidence.type),
  };
}

function buildPartialSetDecisions(
  year: number,
  segmentIndex: number,
  nodes: SegmentNode[],
): BaziRelationConditionDecision[] {
  return SET_DEFINITIONS.flatMap(definition => {
    const observedSymbols = definition.members.filter(member => nodes.some(node => node.branch === member));
    if (observedSymbols.length !== 2) return [];
    const participants = nodes
      .filter(node => observedSymbols.includes(node.branch))
      .map(node => toBranchParticipant(node));
    if (new Set(participants.map(item => item.layer)).size < 2) return [];
    const missingSymbols = definition.members.filter(member => !observedSymbols.includes(member));
    const checks = [
      makeCheck(
        'structural_membership', '三字完整性', 'missing',
        `当前只见${observedSymbols.join('、')}，缺${missingSymbols.join('、')}；不得称${definition.label}成立。`,
        definition.ruleId,
      ),
      makeCheck('same_timeline_segment', '时间片段', 'met', '已出现的两个成员属于同一个真实时间片段。', 'same-timeline-segment'),
      buildNatalPositionCheck(participants),
    ];
    return [{
      id: `${year}-${segmentIndex}-${definition.ruleId}-${participants.map(item => item.id).sort().join('_')}`,
      sourceEvidenceId: null,
      domain: 'branch' as const,
      type: definition.type,
      scope: resolveScope(participants),
      label: `${definition.label}候选缺${missingSymbols.join('、')}`,
      participants,
      targetElement: definition.targetElement,
      state: 'conditions_missing' as const,
      stateLabel: STATE_LABELS.conditions_missing,
      missingSymbols,
      checks,
      coexistingEvidenceIds: [],
      boundary: '两个成员只构成待复核候选；第三个成员未出现前，不得称完整三字关系。',
    }];
  });
}

function buildConflictClusters(
  year: number,
  segmentIndex: number,
  evidence: BaziRelationEvidence[],
): BaziRelationConflictCluster[] {
  const byParticipant = new Map<string, { participant: BaziRelationParticipant; evidence: BaziRelationEvidence[] }>();
  for (const item of evidence.filter(value => value.domain === 'branch')) {
    for (const participant of item.participants) {
      const current = byParticipant.get(participant.id) ?? { participant, evidence: [] };
      if (!current.evidence.some(value => value.id === item.id)) current.evidence.push(item);
      byParticipant.set(participant.id, current);
    }
  }
  return [...byParticipant.values()].flatMap(group => {
    const relationTypes = group.evidence.map(item => item.type)
      .filter((type, index, values) => values.indexOf(type) === index);
    if (relationTypes.length < 2) return [];
    const labels = relationTypes.map(type => RELATION_TYPE_LABELS[type]);
    return [{
      id: `${year}-${segmentIndex}-conflict-${group.participant.id}`,
      participant: group.participant,
      evidenceIds: group.evidence.map(item => item.id),
      relationTypes,
      label: `${group.participant.label}${group.participant.symbol}关系并见`,
      detail: `同一节点同时参与${labels.join('、')}；程序不采用固定优先级，也不宣告解冲、破合或关系消失。`,
      conclusion: 'relations_coexist_no_priority' as const,
    }];
  });
}

function buildSegmentNodes(
  chart: BaziCalculationResult,
  year: number,
  annualGanZhi: string,
  segment: BaziRelationAuditSegment,
): SegmentNode[] {
  const nodes: SegmentNode[] = [chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.time]
    .filter((pillar): pillar is BaziPillar => pillar !== null)
    .map(pillar => ({
      id: `natal-${pillar.key}`,
      layer: 'natal' as const,
      label: `原局${pillar.label}`,
      pillarKey: pillar.key,
      stem: pillar.stem,
      branch: pillar.branch,
      branchElement: pillar.branchElement,
      luckCycleIndex: null,
      annualYear: null,
    }));
  nodes.push(buildDynamicNode('annual', `${year}流年`, annualGanZhi, null, year));
  if (segment.luckCycleIndex && segment.luckCycleGanZhi) {
    nodes.push(buildDynamicNode('luck_cycle', `第${segment.luckCycleIndex}步大运`, segment.luckCycleGanZhi, segment.luckCycleIndex, null));
  }
  return nodes;
}

function buildDynamicNode(
  layer: 'luck_cycle' | 'annual',
  label: string,
  ganZhi: string,
  luckCycleIndex: number | null,
  annualYear: number | null,
): SegmentNode {
  const branch = ganZhi[1];
  const branchElement = BRANCH_ELEMENTS[branch];
  if (!branchElement) throw new Error(`无法识别动态地支：${ganZhi}`);
  return {
    id: layer === 'annual' ? `annual-${annualYear}` : `luck-${luckCycleIndex}`,
    layer,
    label,
    pillarKey: null,
    stem: ganZhi[0],
    branch,
    branchElement,
    luckCycleIndex,
    annualYear,
  };
}

function toBranchParticipant(node: SegmentNode): BaziRelationParticipant {
  return {
    id: node.id,
    layer: node.layer,
    label: node.label,
    pillarKey: node.pillarKey,
    symbol: node.branch,
    element: node.branchElement,
    luckCycleIndex: node.luckCycleIndex,
    annualYear: node.annualYear,
  };
}

function findStemGate(evidence: BaziRelationEvidence) {
  const symbols = evidence.participants.map(item => item.symbol);
  return BAZI_RELATION_ADJUDICATION_METHODOLOGY.stemTransformationGates.find(gate =>
    [...gate.pair].every(symbol => symbols.includes(symbol)),
  );
}

function buildNatalPositionCheck(participants: BaziRelationParticipant[]): BaziRelationConditionCheck {
  const order: Record<BaziPillarKey, number> = { year: 0, month: 1, day: 2, time: 3 };
  const natalPositions = participants
    .filter(item => item.layer === 'natal' && item.pillarKey)
    .map(item => ({ label: item.label, position: order[item.pillarKey!] }))
    .sort((left, right) => left.position - right.position);
  if (natalPositions.length < 2) return makeCheck(
    'natal_position', '原局柱位', 'not_applicable',
    '少于两个原局柱参与；动态层与原局层不套用相邻柱位权重。',
    'natal-position-observation',
  );
  const contiguous = natalPositions.every((item, index) => index === 0 || item.position - natalPositions[index - 1].position === 1);
  return makeCheck(
    'natal_position', '原局柱位', contiguous ? 'met' : 'deferred',
    contiguous
      ? `参与的原局柱位${natalPositions.map(item => item.label.replace('原局', '')).join('、')}连续相邻；只记录位置，不折算力量。`
      : `参与的原局柱位${natalPositions.map(item => item.label.replace('原局', '')).join('、')}并非连续相邻；位置影响暂缓裁决。`,
    'natal-position-observation',
  );
}

function makeCheck(
  code: BaziRelationConditionCheck['code'],
  label: string,
  result: BaziRelationConditionCheck['result'],
  detail: string,
  ruleId: string,
): BaziRelationConditionCheck {
  return { code, label, result, detail, ruleId };
}

function resolveState(checks: BaziRelationConditionCheck[]): BaziRelationConditionState {
  if (checks.some(check => check.result === 'conflict')) return 'relations_coexist';
  if (checks.some(check => check.result === 'missing')) return 'conditions_missing';
  if (checks.some(check => check.result === 'deferred')) return 'deferred_adjudication';
  return 'conditions_met';
}

function resolveScope(participants: BaziRelationParticipant[]): BaziRelationScope {
  const layers = new Set(participants.map(item => item.layer));
  if (layers.size > 2) return 'multi_layer';
  if (layers.has('annual') && layers.has('luck_cycle')) return 'annual_to_luck';
  if (layers.has('annual')) return 'annual_to_natal';
  return 'luck_to_natal';
}

function buildDecisionBoundary(state: BaziRelationConditionState, type: BaziRelationType): string {
  if (state === 'relations_coexist') return '只确认多种关系同时存在；未裁决任何关系优先、解除、破坏或消失。';
  if (state === 'conditions_missing') return '至少一项当前版本要求的入口条件缺失；不得进入合化或完整关系结论。';
  if (state === 'deferred_adjudication') return '结构已经记录，但位置或其他未版本化条件仍需人工复核。';
  if (type === 'stem_five_combine' || type === 'branch_six_combine' || type === 'branch_three_harmony' || type === 'branch_three_meeting') {
    return '当前可程序核验的入口条件齐备；这仍不等于合化成立。';
  }
  return '当前版本的结构条件齐备；不包含力量、吉凶或具体作用结论。';
}
