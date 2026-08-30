import {
  BAZI_RELATION_AUDIT_ENGINE_VERSION,
  BAZI_RELATION_AUDIT_METHODOLOGY,
  BAZI_RELATION_AUDIT_METHODOLOGY_VERSION,
} from './relation-audit-methodology';
import type {
  BaziRelationAuditResult,
  BaziRelationAuditSegment,
  BaziRelationAuditYear,
  BaziRelationDomain,
  BaziRelationEvidence,
  BaziRelationLayer,
  BaziRelationParticipant,
  BaziRelationScope,
  BaziRelationType,
} from './relation-audit-types';
import type { BaziAnnualTimelineItem, BaziAnnualTimelineResult } from './annual-timeline-types';
import type { BaziLuckCycleResult } from './luck-cycle-types';
import type { BaziCalculationResult, BaziElement, BaziPillar, BaziPillarKey } from './types';

const GENERATES: Record<BaziElement, BaziElement> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLS: Record<BaziElement, BaziElement> = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };
const STEM_ELEMENTS: Record<string, BaziElement> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};
const BRANCH_ELEMENTS: Record<string, BaziElement> = {
  寅: '木', 卯: '木', 巳: '火', 午: '火', 辰: '土', 戌: '土', 丑: '土', 未: '土',
  申: '金', 酉: '金', 亥: '水', 子: '水',
};

const STEM_COMBINES: Array<{ members: [string, string]; target: BaziElement }> = [
  { members: ['甲', '己'], target: '土' }, { members: ['乙', '庚'], target: '金' },
  { members: ['丙', '辛'], target: '水' }, { members: ['丁', '壬'], target: '木' },
  { members: ['戊', '癸'], target: '火' },
];
const BRANCH_PAIRS: Array<{ type: BaziRelationType; label: string; ruleId: string; pairs: Array<[string, string]> }> = [
  { type: 'branch_six_combine', label: '六合', ruleId: 'branch-six-combine', pairs: [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']] },
  { type: 'branch_clash', label: '六冲', ruleId: 'branch-clash', pairs: [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']] },
  { type: 'branch_harm', label: '六害', ruleId: 'branch-harm', pairs: [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']] },
  { type: 'branch_mutual_punishment', label: '子卯相刑', ruleId: 'branch-mutual-punishment', pairs: [['子', '卯']] },
];
const BRANCH_SETS: Array<{ type: BaziRelationType; label: string; ruleId: string; members: string[]; target: BaziElement | null }> = [
  { type: 'branch_three_harmony', label: '申子辰三合', ruleId: 'branch-three-harmony-water', members: ['申', '子', '辰'], target: '水' },
  { type: 'branch_three_harmony', label: '亥卯未三合', ruleId: 'branch-three-harmony-wood', members: ['亥', '卯', '未'], target: '木' },
  { type: 'branch_three_harmony', label: '寅午戌三合', ruleId: 'branch-three-harmony-fire', members: ['寅', '午', '戌'], target: '火' },
  { type: 'branch_three_harmony', label: '巳酉丑三合', ruleId: 'branch-three-harmony-metal', members: ['巳', '酉', '丑'], target: '金' },
  { type: 'branch_three_meeting', label: '亥子丑三会', ruleId: 'branch-three-meeting-water', members: ['亥', '子', '丑'], target: '水' },
  { type: 'branch_three_meeting', label: '寅卯辰三会', ruleId: 'branch-three-meeting-wood', members: ['寅', '卯', '辰'], target: '木' },
  { type: 'branch_three_meeting', label: '巳午未三会', ruleId: 'branch-three-meeting-fire', members: ['巳', '午', '未'], target: '火' },
  { type: 'branch_three_meeting', label: '申酉戌三会', ruleId: 'branch-three-meeting-metal', members: ['申', '酉', '戌'], target: '金' },
  { type: 'branch_three_punishment', label: '寅巳申三刑', ruleId: 'branch-three-punishment-yin-si-shen', members: ['寅', '巳', '申'], target: null },
  { type: 'branch_three_punishment', label: '丑戌未三刑', ruleId: 'branch-three-punishment-chou-xu-wei', members: ['丑', '戌', '未'], target: null },
];
const SELF_PUNISHMENT_BRANCHES = new Set(['辰', '午', '酉', '亥']);

interface AuditNode {
  id: string;
  layer: BaziRelationLayer;
  label: string;
  pillarKey: BaziPillarKey | null;
  stem: string;
  branch: string;
  stemElement: BaziElement;
  branchElement: BaziElement;
  luckCycleIndex: number | null;
  annualYear: number | null;
  flowMonthIndex?: number | null;
  effectiveDate?: string | null;
}

export interface BaziRelationNodeInput {
  id: string;
  layer: BaziRelationLayer;
  label: string;
  ganZhi: string;
  pillarKey?: BaziPillarKey | null;
  luckCycleIndex?: number | null;
  annualYear?: number | null;
  flowMonthIndex?: number | null;
  effectiveDate?: string | null;
}

/** 供精确流日等下游模块复用 M9-6 的同一套干支关系目录。 */
export function auditBaziRelationNodeSet(input: {
  nodes: BaziRelationNodeInput[];
  year: number;
  segmentIndex: number;
}): BaziRelationEvidence[] {
  const nodes = input.nodes.map(node => {
    const stem = node.ganZhi[0];
    const branch = node.ganZhi[1];
    const stemElement = STEM_ELEMENTS[stem];
    const branchElement = BRANCH_ELEMENTS[branch];
    if (!stemElement || !branchElement) throw new Error(`无法识别关系节点干支：${node.ganZhi}`);
    return {
      id: node.id,
      layer: node.layer,
      label: node.label,
      pillarKey: node.pillarKey ?? null,
      stem,
      branch,
      stemElement,
      branchElement,
      luckCycleIndex: node.luckCycleIndex ?? null,
      annualYear: node.annualYear ?? null,
      flowMonthIndex: node.flowMonthIndex ?? null,
      effectiveDate: node.effectiveDate ?? null,
    } satisfies AuditNode;
  });
  return [
    ...detectStemRelations(nodes, input.year, input.segmentIndex),
    ...detectBranchPairRelations(nodes, input.year, input.segmentIndex),
    ...detectBranchSetRelations(nodes, input.year, input.segmentIndex),
  ].sort((left, right) => `${left.domain}-${left.type}-${left.label}`.localeCompare(`${right.domain}-${right.type}-${right.label}`, 'zh-CN'));
}

export function auditBaziRelations(
  chart: BaziCalculationResult,
  luckCycles: BaziLuckCycleResult,
  annualTimeline: BaziAnnualTimelineResult,
): BaziRelationAuditResult {
  const years = annualTimeline.years.map(item => auditAnnualYear(chart, item));
  const status = chart.completeness === 'partial_unknown_time'
    ? 'partial_unknown_time' as const
    : annualTimeline.capabilities.luckCycleOverlap
      ? 'complete' as const
      : 'annual_only_without_luck_boundary' as const;
  const exactSegmentBoundary = annualTimeline.capabilities.exactLiChunBoundary;
  const warnings = [
    '关系证据只表示规则结构被命中，不表示合化、解冲、旺衰变化或吉凶。',
    '关系条数没有权重含义，不得相加、相减或折算为分数。',
    ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，所有涉及时柱的关系均未参与审计。'] : []),
    ...(!annualTimeline.capabilities.luckCycleOverlap ? ['大运精确边界未建立，当前只审计流年与原局的跨层关系。'] : []),
  ];
  return {
    methodologyVersion: BAZI_RELATION_AUDIT_METHODOLOGY_VERSION,
    engineVersion: BAZI_RELATION_AUDIT_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status,
    capabilities: {
      relationEvidence: true,
      exactSegmentBoundary,
      transformationVerdict: false,
      strengthEffectVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      luckCycleMethodologyVersion: luckCycles.methodologyVersion,
      annualTimelineMethodologyVersion: annualTimeline.methodologyVersion,
      annualTimelineStatus: annualTimeline.status,
    },
    range: { ...annualTimeline.range },
    years,
    rulesApplied: [
      '只审计原局、大运、流年之间的跨层关系，不重复枚举原局内部配对',
      '天干分别记录同类、生、克和五合；五合只检测不判化',
      '地支分别记录六合、六冲、六害、子卯刑和自刑',
      '三合、三会、三刑必须三个成员全部出现才记录',
      '跨运流年按每个实际时间片段分别审计',
    ],
    warnings,
    boundary: '本结果是传统干支规则的结构证据清单，不是科学因果结论；不得据此直接判断吉凶、强弱、喜忌或具体事件。',
  };
}

function auditAnnualYear(chart: BaziCalculationResult, annual: BaziAnnualTimelineItem): BaziRelationAuditYear {
  const timelineSegments = annual.segments.length ? annual.segments : [{
    startAt: annual.activeFrom, endAtExclusive: annual.activeUntilExclusive,
    kind: 'pre_luck' as const, luckCycleIndex: null, luckCycleGanZhi: null,
    label: '大运边界未建立',
  }];
  const segments = timelineSegments.map((segment, index) => auditSegment(chart, annual, segment, index + 1));
  return {
    year: annual.year,
    annualGanZhi: annual.ganZhi,
    segments,
    evidenceCount: segments.reduce((total, segment) => total + segment.counts.total, 0),
    boundary: '同一流年跨越交运边界时，前后片段独立审计；证据不得跨片段混用。',
  };
}

function auditSegment(
  chart: BaziCalculationResult,
  annual: BaziAnnualTimelineItem,
  segment: BaziAnnualTimelineItem['segments'][number] | {
    startAt: string | null; endAtExclusive: string | null; kind: 'pre_luck';
    luckCycleIndex: null; luckCycleGanZhi: null; label: string;
  },
  segmentIndex: number,
): BaziRelationAuditSegment {
  const nodes = buildNatalNodes(chart);
  nodes.push(buildDynamicNode('annual', `${annual.year}流年`, annual.ganZhi, null, annual.year));
  if (segment.kind === 'luck_cycle' && segment.luckCycleIndex && segment.luckCycleGanZhi) {
    nodes.push(buildDynamicNode('luck_cycle', `第${segment.luckCycleIndex}步大运`, segment.luckCycleGanZhi, segment.luckCycleIndex, null));
  }
  const evidence = [
    ...detectStemRelations(nodes, annual.year, segmentIndex),
    ...detectBranchPairRelations(nodes, annual.year, segmentIndex),
    ...detectBranchSetRelations(nodes, annual.year, segmentIndex),
  ].sort((left, right) => `${left.domain}-${left.type}-${left.label}`.localeCompare(`${right.domain}-${right.type}-${right.label}`, 'zh-CN'));
  const stem = evidence.filter(item => item.domain === 'stem').length;
  const branch = evidence.length - stem;
  return {
    segmentIndex,
    startAt: segment.startAt,
    endAtExclusive: segment.endAtExclusive,
    luckCycleIndex: segment.luckCycleIndex,
    luckCycleGanZhi: segment.luckCycleGanZhi,
    label: segment.label,
    evidence,
    counts: { stem, branch, total: evidence.length },
  };
}

function detectStemRelations(nodes: AuditNode[], year: number, segmentIndex: number): BaziRelationEvidence[] {
  const evidence: BaziRelationEvidence[] = [];
  forEachCrossLayerPair(nodes, (left, right) => {
    const combine = STEM_COMBINES.find(item => hasPair(item.members, left.stem, right.stem));
    if (combine) evidence.push(makeEvidence({
      year, segmentIndex, domain: 'stem', type: 'stem_five_combine',
      label: `${left.label}${left.stem}与${right.label}${right.stem}构成天干五合`,
      nodes: [left, right], targetElement: combine.target, conclusion: 'detected_not_transformed',
      ruleId: `stem-five-combine-${combine.members.join('')}`,
      detail: `检测到${combine.members.join('')}五合，传统目标五行为${combine.target}；当前未校验月令、通根、透干和制化条件，不判合化。`,
    }));

    const [source, target, type, verb] = resolveElementRelation(left, right);
    evidence.push(makeEvidence({
      year, segmentIndex, domain: 'stem', type,
      label: `${source.label}${source.stem}${verb}${target.label}${target.stem}`,
      nodes: [source, target], targetElement: null, conclusion: 'detected_only',
      ruleId: `stem-element-${type.replace('stem_', '')}`,
      detail: `${source.stem}属${source.stemElement}，${target.stem}属${target.stemElement}；这里只记录表层五行${verb === '与' ? '同类' : verb}关系。`,
    }));
  });
  return evidence;
}

function detectBranchPairRelations(nodes: AuditNode[], year: number, segmentIndex: number): BaziRelationEvidence[] {
  const evidence: BaziRelationEvidence[] = [];
  forEachCrossLayerPair(nodes, (left, right) => {
    for (const relation of BRANCH_PAIRS) {
      if (!relation.pairs.some(pair => hasPair(pair, left.branch, right.branch))) continue;
      const isCombine = relation.type === 'branch_six_combine';
      evidence.push(makeEvidence({
        year, segmentIndex, domain: 'branch', type: relation.type,
        label: `${left.label}${left.branch}与${right.label}${right.branch}构成${relation.label}`,
        nodes: [left, right], targetElement: null,
        conclusion: isCombine ? 'detected_not_transformed' : 'detected_only',
        ruleId: `${relation.ruleId}-${[left.branch, right.branch].sort().join('')}`,
        detail: isCombine
          ? `检测到${left.branch}${right.branch}六合；当前不校验化气、解冲或力量次序，只保留结构证据。`
          : `检测到${left.branch}${right.branch}${relation.label}；当前不推导力量、解法或吉凶。`,
      }));
    }
    if (left.branch === right.branch && SELF_PUNISHMENT_BRANCHES.has(left.branch)) evidence.push(makeEvidence({
      year, segmentIndex, domain: 'branch', type: 'branch_self_punishment',
      label: `${left.label}与${right.label}同见${left.branch}，构成${left.branch}${left.branch}自刑`,
      nodes: [left, right], targetElement: null, conclusion: 'detected_only',
      ruleId: `branch-self-punishment-${left.branch}`,
      detail: `跨层重复出现${left.branch}，按辰午酉亥自刑集合记录；不解释强度或吉凶。`,
    }));
  });
  return evidence;
}

function detectBranchSetRelations(nodes: AuditNode[], year: number, segmentIndex: number): BaziRelationEvidence[] {
  const evidence: BaziRelationEvidence[] = [];
  for (const relation of BRANCH_SETS) {
    if (!relation.members.every(branch => nodes.some(node => node.branch === branch))) continue;
    const participants = nodes.filter(node => relation.members.includes(node.branch));
    if (new Set(participants.map(node => node.layer)).size < 2) continue;
    const isCombine = relation.type === 'branch_three_harmony' || relation.type === 'branch_three_meeting';
    evidence.push(makeEvidence({
      year, segmentIndex, domain: 'branch', type: relation.type,
      label: `${relation.label}成员齐全`, nodes: participants,
      targetElement: relation.target,
      conclusion: isCombine ? 'detected_not_transformed' : 'detected_only',
      ruleId: relation.ruleId,
      detail: isCombine
        ? `${relation.members.join('、')}三个成员齐全，传统目标五行为${relation.target}；当前只记录成组，不判化局。`
        : `${relation.members.join('、')}三个成员齐全，记录三刑结构；不解释力量或吉凶。`,
    }));
  }
  return evidence;
}

function makeEvidence(input: {
  year: number; segmentIndex: number; domain: BaziRelationDomain; type: BaziRelationType;
  label: string; nodes: AuditNode[]; targetElement: BaziElement | null;
  conclusion: BaziRelationEvidence['conclusion']; ruleId: string; detail: string;
}): BaziRelationEvidence {
  const participants = input.nodes.map(node => toParticipant(node, input.domain));
  return {
    id: `${input.year}-${input.segmentIndex}-${input.ruleId}-${participants.map(item => item.id).sort().join('_')}`,
    domain: input.domain,
    type: input.type,
    scope: resolveScope(input.nodes),
    label: input.label,
    participants,
    targetElement: input.targetElement,
    conclusion: input.conclusion,
    ruleId: input.ruleId,
    detail: input.detail,
  };
}

function resolveElementRelation(left: AuditNode, right: AuditNode): [AuditNode, AuditNode, BaziRelationType, '生' | '克' | '与'] {
  if (left.stemElement === right.stemElement) return [left, right, 'stem_same_element', '与'];
  if (GENERATES[left.stemElement] === right.stemElement) return [left, right, 'stem_generate', '生'];
  if (GENERATES[right.stemElement] === left.stemElement) return [right, left, 'stem_generate', '生'];
  if (CONTROLS[left.stemElement] === right.stemElement) return [left, right, 'stem_control', '克'];
  return [right, left, 'stem_control', '克'];
}

function resolveScope(nodes: AuditNode[]): BaziRelationScope {
  const layers = new Set(nodes.map(node => node.layer));
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

function toParticipant(node: AuditNode, domain: BaziRelationDomain): BaziRelationParticipant {
  return {
    id: node.id,
    layer: node.layer,
    label: node.label,
    pillarKey: node.pillarKey,
    symbol: domain === 'stem' ? node.stem : node.branch,
    element: domain === 'stem' ? node.stemElement : node.branchElement,
    luckCycleIndex: node.luckCycleIndex,
    annualYear: node.annualYear,
    flowMonthIndex: node.flowMonthIndex ?? null,
    effectiveDate: node.effectiveDate ?? null,
  };
}

function buildNatalNodes(chart: BaziCalculationResult): AuditNode[] {
  return [chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.time]
    .filter((pillar): pillar is BaziPillar => pillar !== null)
    .map(pillar => ({
      id: `natal-${pillar.key}`, layer: 'natal', label: `原局${pillar.label}`,
      pillarKey: pillar.key, stem: pillar.stem, branch: pillar.branch,
      stemElement: pillar.stemElement, branchElement: pillar.branchElement,
      luckCycleIndex: null, annualYear: null,
    }));
}

function buildDynamicNode(
  layer: 'luck_cycle' | 'annual',
  label: string,
  ganZhi: string,
  luckCycleIndex: number | null,
  annualYear: number | null,
): AuditNode {
  const stem = ganZhi[0];
  const branch = ganZhi[1];
  const stemElement = STEM_ELEMENTS[stem];
  const branchElement = BRANCH_ELEMENTS[branch];
  if (!stemElement || !branchElement) throw new Error(`无法识别动态干支：${ganZhi}`);
  return {
    id: layer === 'annual' ? `annual-${annualYear}` : `luck-${luckCycleIndex}`,
    layer, label, pillarKey: null, stem, branch, stemElement, branchElement,
    luckCycleIndex, annualYear,
  };
}

function forEachCrossLayerPair(nodes: AuditNode[], callback: (left: AuditNode, right: AuditNode) => void): void {
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      if (left.layer === right.layer) continue;
      callback(left, right);
    }
  }
}

function hasPair(pair: readonly string[], left: string, right: string): boolean {
  return pair.includes(left) && pair.includes(right) && left !== right;
}
