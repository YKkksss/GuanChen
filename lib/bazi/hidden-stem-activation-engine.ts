import type { BaziDynamicTenGodResult } from './dynamic-ten-god-types';
import {
  BAZI_HIDDEN_STEM_ACTIVATION_ENGINE_VERSION,
  BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY,
  BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY_VERSION,
} from './hidden-stem-activation-methodology';
import type {
  BaziHiddenStemActivationResult,
  BaziHiddenStemActivationSegment,
  BaziHiddenStemRelationTouchEvidence,
  BaziHiddenStemTouchCandidate,
  BaziHiddenStemTouchEntry,
} from './hidden-stem-activation-types';
import type { BaziRelationAdjudicationResult, BaziRelationAdjudicationSegment } from './relation-adjudication-types';
import type { BaziRelationAuditResult, BaziRelationAuditSegment, BaziRelationType } from './relation-audit-types';
import {
  buildBaziDynamicTenGodOccurrences,
  buildBaziNatalTenGodOccurrences,
} from './ten-god-repeat-engine';
import type { BaziTenGodOccurrence, BaziTenGodRepeatResult, BaziTenGodRepeatSegment } from './ten-god-repeat-types';
import type { BaziTransparencyRootResult, BaziTransparencyRootSegment } from './transparency-root-types';
import type { BaziCalculationResult } from './types';

const RELATION_TOUCH_TYPES = new Set<BaziRelationType>([
  'branch_six_combine',
  'branch_clash',
  'branch_harm',
  'branch_mutual_punishment',
  'branch_self_punishment',
  'branch_three_harmony',
  'branch_three_meeting',
  'branch_three_punishment',
]);

const LAYER_ORDER = { natal: 0, luck_cycle: 1, annual: 2, month: 3, day: 4 } as const;

export function auditBaziHiddenStemActivationConditions(
  chart: BaziCalculationResult,
  relationAudit: BaziRelationAuditResult,
  relationAdjudication: BaziRelationAdjudicationResult,
  dynamicTenGod: BaziDynamicTenGodResult,
  tenGodRepeat: BaziTenGodRepeatResult,
  transparencyRoot: BaziTransparencyRootResult,
): BaziHiddenStemActivationResult {
  const natalOccurrences = buildBaziNatalTenGodOccurrences(chart);
  const years = dynamicTenGod.years.map(dynamicYear => {
    const relationYear = requireYear(relationAudit, dynamicYear.year, 'M9-6 关系证据');
    const adjudicationYear = requireYear(relationAdjudication, dynamicYear.year, 'M9-7 关系条件');
    const repeatYear = requireYear(tenGodRepeat, dynamicYear.year, 'M9-9 同干重复');
    const transparencyYear = requireYear(transparencyRoot, dynamicYear.year, 'M9-10 透出条件');
    const segments = dynamicYear.segments.map(dynamicSegment => {
      const index = dynamicSegment.segmentIndex;
      const relationSegment = requireSegment(relationYear.segments, index, dynamicYear.year, 'M9-6');
      const adjudicationSegment = requireSegment(adjudicationYear.segments, index, dynamicYear.year, 'M9-7');
      const repeatSegment = requireSegment(repeatYear.segments, index, dynamicYear.year, 'M9-9');
      const transparencySegment = requireSegment(transparencyYear.segments, index, dynamicYear.year, 'M9-10');
      const occurrences = [
        ...natalOccurrences,
        ...buildBaziDynamicTenGodOccurrences(dynamicSegment.annual),
        ...(dynamicSegment.luckCycle ? buildBaziDynamicTenGodOccurrences(dynamicSegment.luckCycle) : []),
      ];
      return buildSegment(dynamicSegment, occurrences, relationSegment, adjudicationSegment, repeatSegment, transparencySegment);
    });
    return {
      year: dynamicYear.year,
      annualGanZhi: dynamicYear.annualGanZhi,
      segments,
      counts: sumCounts(segments),
      boundary: '流年跨越交运边界时，藏干触达条件按前后真实片段分别审计，不把后段大运证据倒灌到前段。',
    };
  });
  return {
    methodologyVersion: BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY_VERSION,
    engineVersion: BAZI_HIDDEN_STEM_ACTIVATION_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: relationAudit.status,
    capabilities: {
      hiddenStemTouchConditionAudit: true,
      exactDynamicSurfaceEntry: true,
      sameBranchRepeatEntry: true,
      explicitBranchRelationEntry: true,
      hiddenStemActivationVerdict: false,
      strengthEffectVerdict: false,
      targetEffectVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      relationAuditMethodologyVersion: relationAudit.methodologyVersion,
      relationAuditEngineVersion: relationAudit.engineVersion,
      relationAdjudicationMethodologyVersion: relationAdjudication.methodologyVersion,
      relationAdjudicationEngineVersion: relationAdjudication.engineVersion,
      dynamicTenGodMethodologyVersion: dynamicTenGod.methodologyVersion,
      dynamicTenGodEngineVersion: dynamicTenGod.engineVersion,
      tenGodRepeatMethodologyVersion: tenGodRepeat.methodologyVersion,
      tenGodRepeatEngineVersion: tenGodRepeat.engineVersion,
      transparencyRootMethodologyVersion: transparencyRoot.methodologyVersion,
      transparencyRootEngineVersion: transparencyRoot.engineVersion,
    },
    range: { ...dynamicTenGod.range },
    years,
    rulesApplied: [...BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY.deterministicOutputs],
    warnings: [
      '“触达条件”不是“已经引动／发动”的同义词；当前版本不裁决条件是否有效。',
      '同支重复只说明不同节点出现同一地支；不表示伏吟吉凶、力量叠加或事件重复。',
      '冲合刑害只回指既有关系证据和条件状态；不统一裁决开库、合化、解冲或关系优先级。',
      '多个入口同时命中也不折算力量、旺衰、喜忌、作用对象或事件概率。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，时柱藏干与相关触达条件未参与审计。'] : []),
    ],
    boundary: '本结果只回答每个实际藏干是否被完全同干岁运表层、同支重复或明确地支关系证据触达；不裁决藏干已经发动、强弱变化、作用对象、吉凶或具体事件。',
  };
}

function buildSegment(
  dynamicSegment: BaziDynamicTenGodResult['years'][number]['segments'][number],
  occurrences: BaziTenGodOccurrence[],
  relationSegment: BaziRelationAuditSegment,
  adjudicationSegment: BaziRelationAdjudicationSegment,
  repeatSegment: BaziTenGodRepeatSegment,
  transparencySegment: BaziTransparencyRootSegment,
): BaziHiddenStemActivationSegment {
  const candidates = occurrences
    .filter((item): item is BaziTenGodOccurrence & { tenGod: NonNullable<BaziTenGodOccurrence['tenGod']> } => item.visibility === 'hidden' && item.tenGod !== null)
    .map(hidden => buildCandidate(hidden, occurrences, relationSegment, adjudicationSegment, repeatSegment, transparencySegment))
    .sort((left, right) => compareOccurrences(left.hiddenOccurrence, right.hiddenOccurrence));
  return {
    segmentIndex: dynamicSegment.segmentIndex,
    startAt: dynamicSegment.startAt,
    endAtExclusive: dynamicSegment.endAtExclusive,
    luckCycleIndex: dynamicSegment.luckCycleIndex,
    luckCycleGanZhi: dynamicSegment.luckCycleGanZhi,
    label: dynamicSegment.label,
    candidates,
    counts: countCandidates(candidates),
    boundary: '本片段逐个藏干记录三类入口是否命中；入口可以并见，但没有固定优先级，也不能跨片段累计。',
  };
}

function buildCandidate(
  hidden: BaziTenGodOccurrence & { tenGod: NonNullable<BaziTenGodOccurrence['tenGod']> },
  occurrences: BaziTenGodOccurrence[],
  relationSegment: BaziRelationAuditSegment,
  adjudicationSegment: BaziRelationAdjudicationSegment,
  repeatSegment: BaziTenGodRepeatSegment,
  transparencySegment: BaziTransparencyRootSegment,
): BaziHiddenStemTouchCandidate {
  const exactDynamicSurfaces = occurrences.filter(item =>
    item.visibility !== 'hidden'
    && item.layer !== 'natal'
    && item.stem === hidden.stem,
  );
  const transparencyCandidate = transparencySegment.transparencyCandidates.find(item => item.hiddenOccurrence.id === hidden.id) ?? null;
  const repeatCluster = repeatSegment.stemClusters.find(item =>
    item.stem === hidden.stem
    && item.occurrences.some(occurrence => occurrence.id === hidden.id)
    && exactDynamicSurfaces.some(surface => item.occurrences.some(occurrence => occurrence.id === surface.id)),
  ) ?? null;
  if (exactDynamicSurfaces.length && (!transparencyCandidate || !repeatCluster)) {
    throw new Error(`${hidden.label}存在完全同干岁运表层，但缺少 M9-9／M9-10 回指`);
  }

  const sameBranchNodes = uniqueByNode(occurrences.filter(item =>
    item.visibility === 'hidden'
    && item.sourceBranch === hidden.sourceBranch
    && item.nodeId !== hidden.nodeId
    && (item.layer !== 'natal' || hidden.layer !== 'natal'),
  ));
  const relationEvidence = buildRelationEvidence(hidden, relationSegment, adjudicationSegment);
  const entries: BaziHiddenStemTouchEntry[] = [
    makeEntry(
      'exact_dynamic_surface_same_stem',
      exactDynamicSurfaces.length > 0,
      exactDynamicSurfaces.map(item => item.id),
      exactDynamicSurfaces.map(item => item.nodeId),
      repeatCluster?.id ?? null,
      transparencyCandidate?.id ?? null,
      [],
      exactDynamicSurfaces.length
        ? `同片段岁运表层见${hidden.stem}：${exactDynamicSurfaces.map(item => item.label).join('；')}`
        : `同片段大运与流年表层均未见${hidden.stem}`,
    ),
    makeEntry(
      'same_branch_repeat',
      sameBranchNodes.length > 0,
      sameBranchNodes.map(item => item.id),
      sameBranchNodes.map(item => item.nodeId),
      null,
      null,
      [],
      sameBranchNodes.length
        ? `${hidden.sourceBranch}在不同节点重复：${sameBranchNodes.map(item => branchNodeLabel(item)).join('；')}`
        : `片段内没有其他节点重复地支${hidden.sourceBranch}`,
    ),
    makeEntry(
      'explicit_branch_relation',
      relationEvidence.length > 0,
      [],
      relationEvidence.flatMap(item => item.participantNodeIds),
      null,
      null,
      relationEvidence,
      relationEvidence.length
        ? relationEvidence.map(item => `${item.relationLabel}（${item.conditionStateLabel}）`).join('；')
        : `${hidden.label}所在节点没有命中 M9-6 明确冲合刑害关系`,
    ),
  ];
  const matchedEntryTypes = entries.filter(item => item.state === 'matched').map(item => item.type);
  const status = matchedEntryTypes.length >= 2
    ? 'multiple_touch_conditions' as const
    : matchedEntryTypes.length === 1
      ? 'single_touch_condition' as const
      : 'no_touch_condition' as const;
  return {
    id: `hidden-touch-${relationSegment.segmentIndex}-${hidden.id}`,
    hiddenOccurrence: hidden,
    tenGod: hidden.tenGod,
    scope: hidden.layer === 'natal' && hidden.pillarKey === 'month'
      ? 'month_command_hidden_stem'
      : 'general_hidden_stem',
    status,
    matchedEntryTypes,
    entries,
    boundary: matchedEntryTypes.length
      ? `当前只确认${matchedEntryTypes.length}类入口触达此藏干位置；不等于藏干已经引动、发动或产生作用。`
      : '当前版本没有找到三类已开放入口；不等于该藏干永远不动、无力或没有意义。',
  };
}

function buildRelationEvidence(
  hidden: BaziTenGodOccurrence,
  relationSegment: BaziRelationAuditSegment,
  adjudicationSegment: BaziRelationAdjudicationSegment,
): BaziHiddenStemRelationTouchEvidence[] {
  return relationSegment.evidence
    .filter(evidence =>
      evidence.domain === 'branch'
      && RELATION_TOUCH_TYPES.has(evidence.type)
      && evidence.participants.some(participant => participant.id === hidden.nodeId && participant.symbol === hidden.sourceBranch)
      && evidence.participants.some(participant => participant.layer !== 'natal'),
    )
    .map(evidence => {
      const decision = adjudicationSegment.decisions.find(item => item.sourceEvidenceId === evidence.id);
      if (!decision) throw new Error(`${evidence.label}缺少 M9-7 条件裁决回指`);
      return {
        sourceEvidenceId: evidence.id,
        decisionId: decision.id,
        relationType: evidence.type,
        relationLabel: evidence.label,
        conditionState: decision.state,
        conditionStateLabel: decision.stateLabel,
        participantNodeIds: evidence.participants.map(item => item.id),
        participantLabels: evidence.participants.map(item => `${item.label}${item.symbol}`),
        boundary: '只确认藏干所在支参与既有关系证据，并保留条件状态；不裁决该关系是否使藏干发动。',
      };
    });
}

function makeEntry(
  type: BaziHiddenStemTouchEntry['type'],
  matched: boolean,
  evidenceOccurrenceIds: string[],
  sourceNodeIds: string[],
  repeatClusterId: string | null,
  transparencyCandidateId: string | null,
  relationEvidence: BaziHiddenStemRelationTouchEvidence[],
  detail: string,
): BaziHiddenStemTouchEntry {
  return {
    type,
    label: BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY.entryLabels[type],
    state: matched ? 'matched' : 'missing',
    evidenceOccurrenceIds,
    sourceNodeIds: [...new Set(sourceNodeIds)],
    repeatClusterId,
    transparencyCandidateId,
    relationEvidence,
    detail,
    boundary: type === 'exact_dynamic_surface_same_stem'
      ? '完全同干岁运表层只是触达入口，并不等于透干有效或藏干已经发动。'
      : type === 'same_branch_repeat'
        ? '同支重复只是位置条件，不折算力量，也不自动解释为伏吟吉凶。'
        : '关系触达沿用 M9-6／M9-7 证据，不自定合化、解冲、开库或作用结果。',
  };
}

function uniqueByNode(occurrences: BaziTenGodOccurrence[]): BaziTenGodOccurrence[] {
  const nodes = new Map<string, BaziTenGodOccurrence>();
  for (const occurrence of occurrences) if (!nodes.has(occurrence.nodeId)) nodes.set(occurrence.nodeId, occurrence);
  return [...nodes.values()].sort(compareOccurrences);
}

function branchNodeLabel(occurrence: BaziTenGodOccurrence): string {
  if (occurrence.layer === 'natal') return `原局${occurrence.pillarKey ?? ''}支${occurrence.sourceBranch}`;
  return occurrence.label.replace(/藏.*$/, '');
}

function countCandidates(candidates: BaziHiddenStemTouchCandidate[]): BaziHiddenStemActivationSegment['counts'] {
  return {
    candidates: candidates.length,
    touchedCandidates: candidates.filter(item => item.status !== 'no_touch_condition').length,
    multipleTouchConditions: candidates.filter(item => item.status === 'multiple_touch_conditions').length,
    exactSurfaceMatches: candidates.filter(item => item.matchedEntryTypes.includes('exact_dynamic_surface_same_stem')).length,
    sameBranchRepeats: candidates.filter(item => item.matchedEntryTypes.includes('same_branch_repeat')).length,
    explicitBranchRelations: candidates.filter(item => item.matchedEntryTypes.includes('explicit_branch_relation')).length,
  };
}

function sumCounts(segments: BaziHiddenStemActivationSegment[]): BaziHiddenStemActivationSegment['counts'] {
  return segments.reduce((total, item) => ({
    candidates: total.candidates + item.counts.candidates,
    touchedCandidates: total.touchedCandidates + item.counts.touchedCandidates,
    multipleTouchConditions: total.multipleTouchConditions + item.counts.multipleTouchConditions,
    exactSurfaceMatches: total.exactSurfaceMatches + item.counts.exactSurfaceMatches,
    sameBranchRepeats: total.sameBranchRepeats + item.counts.sameBranchRepeats,
    explicitBranchRelations: total.explicitBranchRelations + item.counts.explicitBranchRelations,
  }), { candidates: 0, touchedCandidates: 0, multipleTouchConditions: 0, exactSurfaceMatches: 0, sameBranchRepeats: 0, explicitBranchRelations: 0 });
}

function compareOccurrences(left: BaziTenGodOccurrence, right: BaziTenGodOccurrence): number {
  const layer = LAYER_ORDER[left.layer] - LAYER_ORDER[right.layer];
  return layer || left.nodeId.localeCompare(right.nodeId, 'zh-CN') || left.id.localeCompare(right.id, 'zh-CN');
}

function requireYear<T extends { years: Array<{ year: number }> }>(result: T, year: number, label: string): T['years'][number] {
  const found = result.years.find(item => item.year === year);
  if (!found) throw new Error(`${year} 年缺少${label}版本`);
  return found;
}

function requireSegment<T extends { segmentIndex: number }>(segments: T[], segmentIndex: number, year: number, label: string): T {
  const found = segments.find(item => item.segmentIndex === segmentIndex);
  if (!found) throw new Error(`${year} 年片段 ${segmentIndex} 缺少${label}证据`);
  return found;
}
