import { BAZI_DYNAMIC_TEN_GOD_METHODOLOGY } from './dynamic-ten-god-methodology';
import { resolveBaziTenGod } from './dynamic-ten-god-engine';
import type {
  BaziDynamicDirectionLink,
  BaziDynamicTenGodLayerSnapshot,
  BaziDynamicTenGodRole,
  BaziHiddenQiGrade,
} from './dynamic-ten-god-types';
import {
  BAZI_MONTH_DAY_RELATION_ENGINE_VERSION,
  BAZI_MONTH_DAY_RELATION_METHODOLOGY_VERSION,
} from './month-day-relation-methodology';
import type {
  BaziMonthDayRelationResult,
  BaziMonthDayRelationSegment,
} from './month-day-relation-types';
import type { BaziMonthDayTimelineResult } from './month-day-timeline-types';
import {
  auditBaziRelationNodeSet,
  type BaziRelationNodeInput,
} from './relation-audit-engine';
import type {
  BaziRelationEvidence,
  BaziRelationLayer,
  BaziRelationParticipant,
  BaziRelationScope,
  BaziRelationType,
} from './relation-audit-types';
import type {
  BaziRelationConditionCheck,
  BaziRelationConditionDecision,
  BaziRelationConditionState,
  BaziRelationConflictCluster,
} from './relation-adjudication-types';
import type { BaziStemPolarity } from './luck-cycle-types';
import type { BaziCalculationResult, BaziElement, BaziPillar } from './types';

const STEM_META: Record<string, { element: BaziElement; polarity: BaziStemPolarity }> = {
  甲: { element: '木', polarity: 'yang' }, 乙: { element: '木', polarity: 'yin' },
  丙: { element: '火', polarity: 'yang' }, 丁: { element: '火', polarity: 'yin' },
  戊: { element: '土', polarity: 'yang' }, 己: { element: '土', polarity: 'yin' },
  庚: { element: '金', polarity: 'yang' }, 辛: { element: '金', polarity: 'yin' },
  壬: { element: '水', polarity: 'yang' }, 癸: { element: '水', polarity: 'yin' },
};
const BRANCH_ELEMENTS: Record<string, BaziElement> = {
  寅: '木', 卯: '木', 巳: '火', 午: '火', 辰: '土', 戌: '土', 丑: '土', 未: '土',
  申: '金', 酉: '金', 亥: '水', 子: '水',
};
const QI_GRADES: BaziHiddenQiGrade[] = ['main_qi', 'secondary_qi', 'residual_qi'];
const QI_LABELS: Record<BaziHiddenQiGrade, string> = { main_qi: '本气', secondary_qi: '中气', residual_qi: '余气' };
const CONDITIONAL_TYPES = new Set<BaziRelationType>([
  'stem_five_combine', 'branch_six_combine', 'branch_clash', 'branch_harm',
  'branch_mutual_punishment', 'branch_self_punishment', 'branch_three_harmony',
  'branch_three_meeting', 'branch_three_punishment',
]);
const TRANSFORMATION_REVIEW_TYPES = new Set<BaziRelationType>([
  'stem_five_combine', 'branch_six_combine', 'branch_three_harmony', 'branch_three_meeting',
]);
const SET_DEFINITIONS: Array<{
  type: 'branch_three_harmony' | 'branch_three_meeting' | 'branch_three_punishment';
  label: string;
  members: string[];
}> = [
  { type: 'branch_three_harmony', label: '申子辰三合', members: ['申', '子', '辰'] },
  { type: 'branch_three_harmony', label: '亥卯未三合', members: ['亥', '卯', '未'] },
  { type: 'branch_three_harmony', label: '寅午戌三合', members: ['寅', '午', '戌'] },
  { type: 'branch_three_harmony', label: '巳酉丑三合', members: ['巳', '酉', '丑'] },
  { type: 'branch_three_meeting', label: '亥子丑三会', members: ['亥', '子', '丑'] },
  { type: 'branch_three_meeting', label: '寅卯辰三会', members: ['寅', '卯', '辰'] },
  { type: 'branch_three_meeting', label: '巳午未三会', members: ['巳', '午', '未'] },
  { type: 'branch_three_meeting', label: '申酉戌三会', members: ['申', '酉', '戌'] },
  { type: 'branch_three_punishment', label: '寅巳申三刑', members: ['寅', '巳', '申'] },
  { type: 'branch_three_punishment', label: '丑戌未三刑', members: ['丑', '戌', '未'] },
];
const STATE_LABELS: Record<BaziRelationConditionState, string> = {
  conditions_met: '结构条件齐备',
  conditions_missing: '条件缺失',
  relations_coexist: '关系并见',
  deferred_adjudication: '合化条件暂缓',
};

export function auditBaziMonthDayRelations(
  chart: BaziCalculationResult,
  timeline: BaziMonthDayTimelineResult,
  targetDate: string,
): BaziMonthDayRelationResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error('目标流日必须使用 YYYY-MM-DD 格式');
  const day = timeline.days.find(item => item.effectiveDate === targetDate);
  if (!day) {
    if (timeline.status !== 'sequence_only_unsupported_timezone') {
      throw new Error(`目标日期 ${targetDate} 不在 ${timeline.source.targetYear} 流年的有效流日范围内`);
    }
    return buildUnavailableResult(chart, timeline, targetDate);
  }

  const segments = day.segments.map((segment, index) => buildSegment(
    chart,
    timeline,
    day.ganZhi,
    targetDate,
    segment,
    index + 1,
  ));
  const status = chart.completeness === 'partial_unknown_time' ? 'partial_unknown_time' : 'complete';
  return {
    ...baseResult(chart, timeline, targetDate, day.ganZhi, day.startAt, day.endAtExclusive, segments),
    status,
    capabilities: {
      fiveLayerRelationEvidence: true,
      exactDaySegmentBoundary: true,
      dynamicTenGodRoles: true,
      conditionState: true,
      transformationVerdict: false,
      relationPriorityVerdict: false,
      hiddenStemActivationVerdict: false,
      strengthEffectVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    warnings: [
      '关系证据只表示同一精确片段内命中规则，不表示合化、解冲、力量或吉凶。',
      '十神是相对日主的角色标签，藏干出现不表示已经透出、引动或发动。',
      ...(day.segments.length > 1 ? ['该流日跨越节界或交运边界，前后片段证据必须分开读取。'] : []),
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，所有涉及时柱的关系均未参与审计。'] : []),
    ],
    boundary: '本结果只审计指定流日五层干支的结构关系、条件状态和十神角色；不得据此判断旺衰变化、格局成败、喜忌、吉凶或具体事件。',
  };
}

function baseResult(
  chart: BaziCalculationResult,
  timeline: BaziMonthDayTimelineResult,
  targetDate: string,
  dayGanZhi: string | null,
  dayStartAt: string | null,
  dayEndAtExclusive: string | null,
  segments: BaziMonthDayRelationSegment[],
): Pick<BaziMonthDayRelationResult,
  'methodologyVersion' | 'engineVersion' | 'calculatedAt' | 'source' | 'target' |
  'segments' | 'counts' | 'rulesApplied'> {
  return {
    methodologyVersion: BAZI_MONTH_DAY_RELATION_METHODOLOGY_VERSION,
    engineVersion: BAZI_MONTH_DAY_RELATION_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      monthDayTimelineMethodologyVersion: timeline.methodologyVersion,
      monthDayTimelineEngineVersion: timeline.engineVersion,
      monthDayTimelineStatus: timeline.status,
      targetYear: timeline.source.targetYear,
      targetDate,
      lateZiPolicy: timeline.source.lateZiPolicy,
    },
    target: {
      effectiveDate: targetDate,
      dayGanZhi,
      dayStartAt,
      dayEndAtExclusive,
      segmentCount: segments.length,
    },
    segments,
    counts: {
      segments: segments.length,
      roles: segments.reduce((total, item) => total + item.counts.roles, 0),
      evidence: segments.reduce((total, item) => total + item.counts.evidence, 0),
      decisions: segments.reduce((total, item) => total + item.counts.decisions, 0),
      conflicts: segments.reduce((total, item) => total + item.counts.conflicts, 0),
    },
    rulesApplied: [
      '只在 M9-14 指定流日的真实时间片段内组合五层节点',
      '直接复用 M9-6 关系目录，并只保留含流月或流日参与者的证据',
      '完整关系、三字缺一与关系并见沿用 M9-7 状态语义，但不判合化和优先级',
      '大运、流年、流月、流日十神统一以原局日主为参照',
      '跨节或跨运流日逐片段审计，禁止跨片段拼接证据',
    ],
  };
}

function buildUnavailableResult(
  chart: BaziCalculationResult,
  timeline: BaziMonthDayTimelineResult,
  targetDate: string,
): BaziMonthDayRelationResult {
  return {
    ...baseResult(chart, timeline, targetDate, null, null, null, []),
    status: 'sequence_only_unavailable',
    capabilities: {
      fiveLayerRelationEvidence: false,
      exactDaySegmentBoundary: false,
      dynamicTenGodRoles: false,
      conditionState: false,
      transformationVerdict: false,
      relationPriorityVerdict: false,
      hiddenStemActivationVerdict: false,
      strengthEffectVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    warnings: ['当前时区只有流月干支顺序，没有精确流日片段，M9-15 不生成五层关系证据。'],
    boundary: '精确流日边界未建立时，不得补写流日干支、五层关系、十神角色、吉凶或具体事件。',
  };
}

function buildSegment(
  chart: BaziCalculationResult,
  timeline: BaziMonthDayTimelineResult,
  dayGanZhi: string,
  targetDate: string,
  segment: BaziMonthDayTimelineResult['days'][number]['segments'][number],
  segmentIndex: number,
): BaziMonthDayRelationSegment {
  const nodes = buildNodes(chart, timeline, dayGanZhi, targetDate, segment);
  const evidence = auditBaziRelationNodeSet({
    nodes,
    year: timeline.source.targetYear,
    segmentIndex,
  }).filter(item => item.participants.some(participant => participant.layer === 'month' || participant.layer === 'day'));
  const conflicts = buildConflicts(targetDate, segmentIndex, evidence);
  const decisions = buildDecisions(targetDate, segmentIndex, nodes, evidence, conflicts);
  const layers = nodes
    .filter(node => node.layer !== 'natal')
    .map(node => buildLayerSnapshot(chart.dayMaster.stem, node, evidence, decisions));
  const stemEvidence = evidence.filter(item => item.domain === 'stem').length;
  return {
    segmentIndex,
    startAt: segment.startAt,
    endAtExclusive: segment.endAtExclusive,
    annualYear: timeline.source.targetYear,
    annualGanZhi: timeline.source.targetYearGanZhi,
    monthIndex: segment.monthIndex,
    monthGanZhi: segment.monthGanZhi,
    dayGanZhi,
    luckCycleIndex: segment.luckCycleIndex,
    luckCycleGanZhi: segment.luckCycleGanZhi,
    label: `第 ${segment.monthIndex} 流月 ${segment.monthGanZhi}／${segment.label}`,
    layers,
    evidence,
    decisions,
    conflicts,
    counts: {
      layers: layers.length,
      roles: layers.reduce((total, item) => total + item.counts.roles, 0),
      evidence: evidence.length,
      stemEvidence,
      branchEvidence: evidence.length - stemEvidence,
      decisions: decisions.length,
      conflicts: conflicts.length,
    },
  };
}

function buildNodes(
  chart: BaziCalculationResult,
  timeline: BaziMonthDayTimelineResult,
  dayGanZhi: string,
  targetDate: string,
  segment: BaziMonthDayTimelineResult['days'][number]['segments'][number],
): BaziRelationNodeInput[] {
  const nodes: BaziRelationNodeInput[] = [
    chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.time,
  ].filter((pillar): pillar is BaziPillar => pillar !== null).map(pillar => ({
    id: `natal-${pillar.key}`,
    layer: 'natal',
    label: `原局${pillar.label}`,
    ganZhi: pillar.ganZhi,
    pillarKey: pillar.key,
  }));
  if (segment.luckCycleIndex && segment.luckCycleGanZhi) nodes.push({
    id: `luck-${segment.luckCycleIndex}`,
    layer: 'luck_cycle',
    label: `第${segment.luckCycleIndex}步大运`,
    ganZhi: segment.luckCycleGanZhi,
    luckCycleIndex: segment.luckCycleIndex,
  });
  nodes.push({
    id: `annual-${timeline.source.targetYear}`,
    layer: 'annual',
    label: `${timeline.source.targetYear}流年`,
    ganZhi: timeline.source.targetYearGanZhi,
    annualYear: timeline.source.targetYear,
  });
  nodes.push({
    id: `month-${timeline.source.targetYear}-${segment.monthIndex}`,
    layer: 'month',
    label: `第${segment.monthIndex}流月`,
    ganZhi: segment.monthGanZhi,
    annualYear: timeline.source.targetYear,
    flowMonthIndex: segment.monthIndex,
  });
  nodes.push({
    id: `day-${targetDate}`,
    layer: 'day',
    label: `${targetDate}流日`,
    ganZhi: dayGanZhi,
    annualYear: timeline.source.targetYear,
    effectiveDate: targetDate,
  });
  return nodes;
}

function buildConflicts(
  targetDate: string,
  segmentIndex: number,
  evidence: BaziRelationEvidence[],
): BaziRelationConflictCluster[] {
  const groups = new Map<string, { participant: BaziRelationParticipant; evidence: BaziRelationEvidence[] }>();
  for (const item of evidence.filter(value => value.domain === 'branch' && CONDITIONAL_TYPES.has(value.type))) {
    for (const participant of item.participants) {
      const current = groups.get(participant.id) ?? { participant, evidence: [] };
      if (!current.evidence.some(value => value.id === item.id)) current.evidence.push(item);
      groups.set(participant.id, current);
    }
  }
  return [...groups.values()].flatMap(group => {
    const relationTypes = [...new Set(group.evidence.map(item => item.type))];
    if (relationTypes.length < 2) return [];
    return [{
      id: `${targetDate}-${segmentIndex}-conflict-${group.participant.id}`,
      participant: group.participant,
      evidenceIds: group.evidence.map(item => item.id),
      relationTypes,
      label: `${group.participant.label}${group.participant.symbol}关系并见`,
      detail: `同一精确流日片段内，该节点同时参与 ${relationTypes.length} 类地支关系；只记录并见，不裁决优先级、解冲或破合。`,
      conclusion: 'relations_coexist_no_priority' as const,
    }];
  });
}

function buildDecisions(
  targetDate: string,
  segmentIndex: number,
  nodes: BaziRelationNodeInput[],
  evidence: BaziRelationEvidence[],
  conflicts: BaziRelationConflictCluster[],
): BaziRelationConditionDecision[] {
  const complete = evidence.filter(item => CONDITIONAL_TYPES.has(item.type)).map(item => {
    const coexistingEvidenceIds = conflicts
      .filter(conflict => conflict.evidenceIds.includes(item.id))
      .flatMap(conflict => conflict.evidenceIds)
      .filter(id => id !== item.id)
      .filter((id, index, values) => values.indexOf(id) === index);
    const checks: BaziRelationConditionCheck[] = [
      makeCheck('structural_membership', '结构成员', 'met', 'M9-6 关系目录已命中完整结构成员。', `${item.ruleId}-members`),
      makeCheck('same_timeline_segment', '精确流日片段', 'met', '全部参与节点属于同一个 M9-14 精确时间片段。', 'same-exact-day-segment'),
    ];
    if (TRANSFORMATION_REVIEW_TYPES.has(item.type)) checks.push(makeCheck(
      'month_support', '合化条件', 'deferred',
      '本阶段只确认组合结构；月令、透干、通根与制化条件不在此处重新裁决。',
      'month-day-transformation-deferred',
    ));
    if (coexistingEvidenceIds.length) checks.push(makeCheck(
      'coexisting_relation', '关系并见', 'conflict',
      `同一节点还命中 ${coexistingEvidenceIds.length} 条其他地支关系，不设固定优先级。`,
      'month-day-coexisting-no-priority',
    ));
    const state = resolveDecisionState(checks);
    return {
      id: `decision-${item.id}`,
      sourceEvidenceId: item.id,
      domain: item.domain,
      type: item.type,
      scope: item.scope,
      label: item.label,
      participants: item.participants,
      targetElement: item.targetElement,
      state,
      stateLabel: STATE_LABELS[state],
      missingSymbols: [],
      checks,
      coexistingEvidenceIds,
      boundary: decisionBoundary(state, item.type),
    } satisfies BaziRelationConditionDecision;
  });
  const partial = buildPartialSetDecisions(targetDate, segmentIndex, nodes);
  return [...complete, ...partial].sort((left, right) =>
    `${left.state}-${left.domain}-${left.label}`.localeCompare(`${right.state}-${right.domain}-${right.label}`, 'zh-CN'),
  );
}

function buildPartialSetDecisions(
  targetDate: string,
  segmentIndex: number,
  nodes: BaziRelationNodeInput[],
): BaziRelationConditionDecision[] {
  return SET_DEFINITIONS.flatMap(definition => {
    const observed = definition.members.filter(member => nodes.some(node => node.ganZhi[1] === member));
    if (observed.length !== 2) return [];
    const participantNodes = nodes.filter(node => observed.includes(node.ganZhi[1]));
    if (!participantNodes.some(node => node.layer === 'month' || node.layer === 'day')) return [];
    if (new Set(participantNodes.map(node => node.layer)).size < 2) return [];
    const participants = participantNodes.map(toBranchParticipant);
    const missingSymbols = definition.members.filter(member => !observed.includes(member));
    const checks = [
      makeCheck('structural_membership', '三字完整性', 'missing', `当前只见${observed.join('、')}，缺${missingSymbols.join('、')}。`, `month-day-partial-${definition.label}`),
      makeCheck('same_timeline_segment', '精确流日片段', 'met', '已出现成员属于同一个精确时间片段。', 'same-exact-day-segment'),
    ];
    return [{
      id: `${targetDate}-${segmentIndex}-partial-${definition.label}-${participants.map(item => item.id).sort().join('_')}`,
      sourceEvidenceId: null,
      domain: 'branch' as const,
      type: definition.type,
      scope: resolveScope(participants),
      label: `${definition.label}候选缺${missingSymbols.join('、')}`,
      participants,
      targetElement: null,
      state: 'conditions_missing' as const,
      stateLabel: STATE_LABELS.conditions_missing,
      missingSymbols,
      checks,
      coexistingEvidenceIds: [],
      boundary: '只记录三字缺一候选；缺失成员未出现前，不得称完整三合、三会或三刑。',
    }];
  });
}

function buildLayerSnapshot(
  dayMasterStem: string,
  node: BaziRelationNodeInput,
  evidence: BaziRelationEvidence[],
  decisions: BaziRelationConditionDecision[],
): BaziDynamicTenGodLayerSnapshot {
  const stem = node.ganZhi[0];
  const branch = node.ganZhi[1];
  const hiddenStems = BAZI_DYNAMIC_TEN_GOD_METHODOLOGY.hiddenStemOrder[branch];
  if (!hiddenStems) throw new Error(`无法识别动态地支藏干：${node.ganZhi}`);
  const roles = [
    createRole(dayMasterStem, node, 'surface_stem', stem, null, null),
    ...hiddenStems.map((hiddenStem, index) => createRole(
      dayMasterStem, node, 'branch_hidden_stem', hiddenStem, branch, QI_GRADES[index],
    )),
  ];
  const directions = buildDirections(node, evidence, decisions);
  return {
    nodeId: node.id,
    layer: node.layer as Exclude<BaziRelationLayer, 'natal'>,
    label: node.label,
    ganZhi: node.ganZhi,
    stem,
    branch,
    roles,
    directions,
    counts: {
      roles: roles.length,
      hiddenStemRoles: roles.filter(item => item.sourceKind === 'branch_hidden_stem').length,
      natalDirectionLinks: directions.length,
    },
    boundary: '表层天干与地支藏干角色分开记录；藏干存在不表示已经透出、引动或产生作用。',
  };
}

function createRole(
  dayMasterStem: string,
  node: BaziRelationNodeInput,
  sourceKind: BaziDynamicTenGodRole['sourceKind'],
  stem: string,
  sourceBranch: string | null,
  hiddenQiGrade: BaziHiddenQiGrade | null,
): BaziDynamicTenGodRole {
  const meta = STEM_META[stem];
  if (!meta) throw new Error(`无法识别天干：${stem}`);
  return {
    id: `${node.id}-${sourceKind}-${stem}-${hiddenQiGrade ?? 'surface'}`,
    nodeId: node.id,
    layer: node.layer as Exclude<BaziRelationLayer, 'natal'>,
    sourceKind,
    sourceBranch,
    stem,
    element: meta.element,
    polarity: meta.polarity,
    tenGod: resolveBaziTenGod(dayMasterStem, stem),
    hiddenQiGrade,
    hiddenQiLabel: hiddenQiGrade ? QI_LABELS[hiddenQiGrade] : null,
    boundary: sourceKind === 'surface_stem'
      ? '表层十神只表示相对日主的角色名称，不直接映射现实事件。'
      : '藏干十神只表示地支所含角色，不代表已经透出或发动。',
  };
}

function buildDirections(
  node: BaziRelationNodeInput,
  evidence: BaziRelationEvidence[],
  decisions: BaziRelationConditionDecision[],
): BaziDynamicDirectionLink[] {
  const links: BaziDynamicDirectionLink[] = [];
  for (const item of evidence) {
    const source = item.participants.find(participant => participant.id === node.id);
    if (!source) continue;
    const decision = decisions.find(value => value.sourceEvidenceId === item.id) ?? null;
    for (const target of item.participants.filter(participant => participant.layer === 'natal' && participant.pillarKey)) {
      links.push({
        id: `${node.id}-${item.domain}-${item.id}-${target.id}`,
        sourceNodeId: node.id,
        sourceLayer: node.layer as Exclude<BaziRelationLayer, 'natal'>,
        sourceDomain: item.domain,
        sourceSymbol: source.symbol,
        targetPillarKey: target.pillarKey!,
        targetPillarLabel: target.label,
        targetSymbol: target.symbol,
        relationType: item.type,
        relationLabel: item.label,
        relationScope: item.scope,
        sourceEvidenceId: item.id,
        conditionDecisionId: decision?.id ?? null,
        conditionState: decision?.state ?? null,
        conditionStateLabel: decision?.stateLabel ?? null,
        boundary: '该链接只表示同一条关系证据包含动态节点与原局柱位，不表示力量、结果或吉凶。',
      });
    }
  }
  return links;
}

function toBranchParticipant(node: BaziRelationNodeInput): BaziRelationParticipant {
  const branch = node.ganZhi[1];
  const element = BRANCH_ELEMENTS[branch];
  if (!element) throw new Error(`无法识别地支：${branch}`);
  return {
    id: node.id,
    layer: node.layer,
    label: node.label,
    pillarKey: node.pillarKey ?? null,
    symbol: branch,
    element,
    luckCycleIndex: node.luckCycleIndex ?? null,
    annualYear: node.annualYear ?? null,
    flowMonthIndex: node.flowMonthIndex ?? null,
    effectiveDate: node.effectiveDate ?? null,
  };
}

function resolveScope(participants: BaziRelationParticipant[]): BaziRelationScope {
  const layers = new Set(participants.map(item => item.layer));
  if (layers.size > 2) return 'multi_layer';
  if (layers.has('day') && layers.has('month')) return 'day_to_month';
  if (layers.has('day') && layers.has('annual')) return 'day_to_annual';
  if (layers.has('day') && layers.has('luck_cycle')) return 'day_to_luck';
  if (layers.has('day')) return 'day_to_natal';
  if (layers.has('month') && layers.has('annual')) return 'month_to_annual';
  if (layers.has('month') && layers.has('luck_cycle')) return 'month_to_luck';
  if (layers.has('month')) return 'month_to_natal';
  if (layers.has('annual') && layers.has('luck_cycle')) return 'annual_to_luck';
  if (layers.has('annual')) return 'annual_to_natal';
  return 'luck_to_natal';
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

function resolveDecisionState(checks: BaziRelationConditionCheck[]): BaziRelationConditionState {
  if (checks.some(check => check.result === 'conflict')) return 'relations_coexist';
  if (checks.some(check => check.result === 'missing')) return 'conditions_missing';
  if (checks.some(check => check.result === 'deferred')) return 'deferred_adjudication';
  return 'conditions_met';
}

function decisionBoundary(state: BaziRelationConditionState, type: BaziRelationType): string {
  if (state === 'relations_coexist') return '只确认多种关系同片段并见；未裁决优先、解除、破坏或消失。';
  if (state === 'conditions_missing') return '结构成员不完整，不得称完整关系成立。';
  if (state === 'deferred_adjudication' || TRANSFORMATION_REVIEW_TYPES.has(type)) return '只确认组合结构，合化所需条件仍暂缓，不得宣告合化成立。';
  return '只确认当前版本的结构条件齐备，不包含力量、吉凶或具体作用结论。';
}
