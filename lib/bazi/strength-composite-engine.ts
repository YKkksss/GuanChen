import type { BaziDynamicTenGodResult, BaziTenGodName } from './dynamic-ten-god-types';
import type { BaziHiddenStemActivationResult, BaziHiddenStemActivationSegment } from './hidden-stem-activation-types';
import type { BaziInterpretationResult, BaziRelationRole } from './interpretation-types';
import {
  BAZI_STRENGTH_COMPOSITE_ENGINE_VERSION,
  BAZI_STRENGTH_COMPOSITE_METHODOLOGY,
  BAZI_STRENGTH_COMPOSITE_METHODOLOGY_VERSION,
} from './strength-composite-methodology';
import type {
  BaziDynamicSurfaceDirection,
  BaziMonthCommandComposite,
  BaziStrengthCompositeComparison,
  BaziStrengthCompositeEvidence,
  BaziStrengthCompositeResult,
  BaziStrengthCompositeReviewFlag,
  BaziStrengthCompositeSegment,
  BaziStrengthCompositeSide,
} from './strength-composite-types';
import type { BaziTransparencyRootResult, BaziTransparencyRootSegment } from './transparency-root-types';
import type { BaziCalculationResult } from './types';

const SUPPORT_TEN_GODS = new Set<BaziTenGodName>(['比肩', '劫财', '正印', '偏印']);
const DYNAMIC_DIRECTION_LABELS: Record<BaziDynamicSurfaceDirection, string> = {
  support_only: '岁运表层只见生扶方向',
  drain_only: '岁运表层只见泄耗制方向',
  both_sides: '岁运表层生扶与泄耗制并见',
  none: '岁运表层方向缺失',
};
const COMPARISON_LABELS: Record<BaziStrengthCompositeComparison, string> = {
  static_dynamic_same_direction: '静态标签与岁运表层方向同向',
  static_dynamic_different_directions: '静态标签与岁运表层方向异向',
  static_baseline_mixed: '静态基线本身为证据并见',
  dynamic_surface_mixed: '岁运表层两类方向并见',
  partial_unknown_time: '时柱未知，综合证据不完整',
  dynamic_surface_absent: '缺少岁运表层方向',
};

export function auditBaziStrengthComposite(
  chart: BaziCalculationResult,
  interpretation: BaziInterpretationResult,
  dynamicTenGod: BaziDynamicTenGodResult,
  transparencyRoot: BaziTransparencyRootResult,
  hiddenStemActivation: BaziHiddenStemActivationResult,
): BaziStrengthCompositeResult {
  const years = dynamicTenGod.years.map(dynamicYear => {
    const transparencyYear = requireYear(transparencyRoot, dynamicYear.year, 'M9-10 透根条件');
    const activationYear = requireYear(hiddenStemActivation, dynamicYear.year, 'M9-11 藏干触达');
    const segments = dynamicYear.segments.map(dynamicSegment => {
      const transparencySegment = requireSegment(transparencyYear.segments, dynamicSegment.segmentIndex, dynamicYear.year, 'M9-10');
      const activationSegment = requireSegment(activationYear.segments, dynamicSegment.segmentIndex, dynamicYear.year, 'M9-11');
      return buildSegment(chart, interpretation, dynamicSegment, transparencySegment, activationSegment);
    });
    return {
      year: dynamicYear.year,
      annualGanZhi: dynamicYear.annualGanZhi,
      segments,
      comparisonLabels: [...new Set(segments.map(item => item.comparisonLabel))],
      reviewFlags: [...new Set(segments.flatMap(item => item.reviewFlags))],
      boundary: '同一流年跨交运时分别比较静态基线与实际片段，后段大运表层、藏干和触达条件不得倒灌到前段。',
    };
  });
  return {
    methodologyVersion: BAZI_STRENGTH_COMPOSITE_METHODOLOGY_VERSION,
    engineVersion: BAZI_STRENGTH_COMPOSITE_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: dynamicTenGod.status,
    capabilities: {
      staticDynamicEvidenceMatrix: true,
      monthCommandTouchReview: true,
      dynamicSurfaceDirectionComparison: true,
      dayMasterRootConditionReview: true,
      finalStrengthVerdict: false,
      strengthScore: false,
      usefulGodVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      interpretationMethodologyVersion: interpretation.methodologyVersion,
      interpretationEngineVersion: interpretation.engineVersion,
      dynamicTenGodMethodologyVersion: dynamicTenGod.methodologyVersion,
      dynamicTenGodEngineVersion: dynamicTenGod.engineVersion,
      transparencyRootMethodologyVersion: transparencyRoot.methodologyVersion,
      transparencyRootEngineVersion: transparencyRoot.engineVersion,
      hiddenStemActivationMethodologyVersion: hiddenStemActivation.methodologyVersion,
      hiddenStemActivationEngineVersion: hiddenStemActivation.engineVersion,
    },
    staticBaseline: {
      assessment: interpretation.strength.assessment,
      label: interpretation.strength.label,
      confidence: interpretation.strength.confidence,
      boundary: interpretation.strength.boundary,
    },
    range: { ...dynamicTenGod.range },
    years,
    rulesApplied: [...BAZI_STRENGTH_COMPOSITE_METHODOLOGY.deterministicOutputs],
    warnings: [
      '综合矩阵复用上游证据，不生成旺衰分数、百分比或最终身强身弱。',
      '静态标签与岁运表层同向只表示方向一致，不表示日主力量增强或减弱。',
      '岁运藏干即使有触达条件，也只作为条件上下文，不自动计入实际生扶、泄耗或制克。',
      '月令被冲合刑害触达不等于月令受损、失效、合化或已经解冲。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，静态基线和所有动态比较均保持不完整状态。'] : []),
    ],
    boundary: '本结果只把 M9-3 静态证据与 M9-8 至 M9-11 岁运证据按来源、显隐和方向并列；不裁决最终旺衰、力量变化、格局成败、用神喜忌、吉凶或事件。',
  };
}

function buildSegment(
  chart: BaziCalculationResult,
  interpretation: BaziInterpretationResult,
  dynamicSegment: BaziDynamicTenGodResult['years'][number]['segments'][number],
  transparencySegment: BaziTransparencyRootSegment,
  activationSegment: BaziHiddenStemActivationSegment,
): BaziStrengthCompositeSegment {
  const staticEvidence = buildStaticEvidence(interpretation);
  const dynamicSurfaceEvidence = [dynamicSegment.annual, ...(dynamicSegment.luckCycle ? [dynamicSegment.luckCycle] : [])]
    .flatMap(layer => layer.roles.filter(role => role.sourceKind === 'surface_stem').map(role => makeEvidence({
      id: `composite-surface-${role.id}`,
      family: 'dynamic_surface',
      side: tenGodSide(role.tenGod),
      roleSide: tenGodSide(role.tenGod),
      status: 'established',
      label: `${layer.label}表层${role.stem}${role.tenGod}`,
      detail: `${role.tenGod}相对日主属于${tenGodSide(role.tenGod) === 'support' ? '生扶' : '泄耗制'}方向；只记表层方向，不设置权重。`,
      sourceStage: 'M9-8', sourceIds: [role.id], tenGod: role.tenGod,
      boundary: '岁运表层十神是方向证据，不等于已经改变日主旺衰。',
    })));
  const dynamicHiddenEvidence = activationSegment.candidates
    .filter(candidate => candidate.hiddenOccurrence.layer !== 'natal')
    .map(candidate => makeEvidence({
      id: `composite-hidden-${candidate.id}`,
      family: 'dynamic_hidden_position',
      side: 'context',
      roleSide: tenGodSide(candidate.tenGod),
      status: candidate.status === 'no_touch_condition' ? 'position_only' : 'condition_only',
      label: `${candidate.hiddenOccurrence.label}（${candidate.tenGod}）`,
      detail: candidate.status === 'no_touch_condition'
        ? '只确认岁运地支内含此藏干，未命中 M9-11 开放触达条件。'
        : `命中${candidate.matchedEntryTypes.length}类 M9-11 触达入口；仍不等于已经发动。`,
      sourceStage: 'M9-11', sourceIds: [candidate.id], tenGod: candidate.tenGod,
      boundary: '岁运藏干只进入上下文列，不直接计入生扶或泄耗制证据列。',
    }));
  const rootConditionEvidence = buildDayMasterRootConditionEvidence(chart, transparencySegment);
  const monthCommand = buildMonthCommand(interpretation, activationSegment);
  const monthTouchEvidence = buildMonthTouchEvidence(activationSegment);
  const evidence = [...staticEvidence, ...dynamicSurfaceEvidence, ...dynamicHiddenEvidence, ...rootConditionEvidence, ...monthTouchEvidence];
  const dynamicSurfaceDirection = resolveDynamicDirection(dynamicSurfaceEvidence);
  const comparison = resolveComparison(interpretation.strength.assessment, dynamicSurfaceDirection, chart.completeness);
  const reviewFlags = resolveReviewFlags(chart, interpretation, dynamicSurfaceDirection, comparison, monthCommand, dynamicHiddenEvidence, rootConditionEvidence);
  return {
    segmentIndex: dynamicSegment.segmentIndex,
    startAt: dynamicSegment.startAt,
    endAtExclusive: dynamicSegment.endAtExclusive,
    luckCycleIndex: dynamicSegment.luckCycleIndex,
    luckCycleGanZhi: dynamicSegment.luckCycleGanZhi,
    label: dynamicSegment.label,
    monthCommand,
    dynamicSurfaceDirection,
    dynamicSurfaceDirectionLabel: DYNAMIC_DIRECTION_LABELS[dynamicSurfaceDirection],
    comparison,
    comparisonLabel: COMPARISON_LABELS[comparison],
    reviewFlags,
    evidence,
    counts: countEvidence(evidence),
    boundary: '证据按来源和显隐并列；同向、异向与并见只是比较标签，不是力量增减或最终旺衰结论。',
  };
}

function buildStaticEvidence(interpretation: BaziInterpretationResult): BaziStrengthCompositeEvidence[] {
  return interpretation.strength.evidence.map(item => makeEvidence({
    id: `composite-static-${item.id}`,
    family: item.id === 'month_command' ? 'month_command_baseline' : item.id.startsWith('root_') ? 'natal_root' : 'natal_surface',
    side: item.side,
    roleSide: item.side === 'context' ? null : item.side,
    status: item.id === 'month_command' ? 'upstream_label' : 'established',
    label: item.label,
    detail: item.detail,
    sourceStage: 'M9-3', sourceIds: [item.id], tenGod: null,
    boundary: item.id === 'month_command'
      ? '月令是 M9-3 首要静态证据，但不能单独决定旺衰。'
      : '原局证据保持 M9-3 原始方向和重要性，不在本阶段重新加权。',
  }));
}

function buildDayMasterRootConditionEvidence(
  chart: BaziCalculationResult,
  segment: BaziTransparencyRootSegment,
): BaziStrengthCompositeEvidence[] {
  return segment.rootCandidates
    .filter(candidate => candidate.surfaceOccurrence.sourceKind === 'day_master_reference')
    .filter(candidate => candidate.status !== 'hidden_support_missing')
    .map(candidate => makeEvidence({
      id: `composite-day-root-${candidate.id}`,
      family: 'day_master_root_condition',
      side: 'support', roleSide: 'support', status: 'condition_only',
      label: candidate.status === 'exact_same_stem_root'
        ? `日主${chart.dayMaster.stem}见严格同干根条件`
        : `日主${chart.dayMaster.stem}见同五行支持参照`,
      detail: candidate.status === 'exact_same_stem_root'
        ? `完全同干位置：${candidate.exactRootMatches.map(item => item.label).join('；')}`
        : `同五行不同干位置：${candidate.sameElementSupportMatches.map(item => item.label).join('；')}`,
      sourceStage: 'M9-10', sourceIds: [candidate.id], tenGod: null,
      boundary: '这里只记录日主根气条件，不裁决根气有效、等级、真假或力量。',
    }));
}

function buildMonthCommand(
  interpretation: BaziInterpretationResult,
  activationSegment: BaziHiddenStemActivationSegment,
): BaziMonthCommandComposite {
  const candidates = activationSegment.candidates.filter(item => item.scope === 'month_command_hidden_stem');
  const touchTypes = [...new Set(candidates.flatMap(item => item.matchedEntryTypes))];
  const relationConditionStates = [...new Set(candidates.flatMap(item => item.entries
    .filter(entry => entry.type === 'explicit_branch_relation')
    .flatMap(entry => entry.relationEvidence.map(evidence => evidence.conditionStateLabel))))];
  return {
    branch: interpretation.strength.monthBranch,
    mainQiStem: interpretation.strength.monthMainQiStem,
    relation: interpretation.strength.monthRelation,
    staticAssessment: interpretation.strength.assessment,
    staticAssessmentLabel: interpretation.strength.label,
    touchStatus: touchTypes.length >= 2 ? 'multiple_touch_types' : touchTypes.length === 1 ? 'single_touch_type' : 'no_open_touch_condition',
    touchTypes,
    touchedHiddenOccurrenceIds: candidates.filter(item => item.status !== 'no_touch_condition').map(item => item.hiddenOccurrence.id),
    relationConditionStates,
    boundary: touchTypes.length
      ? '月令藏干存在开放触达入口；只要求复核，不推导月令增强、受损、失效或合化。'
      : '当前未命中 M9-11 三类开放入口；不等于月令绝对稳定或不受其他未实现条件影响。',
  };
}

function buildMonthTouchEvidence(segment: BaziHiddenStemActivationSegment): BaziStrengthCompositeEvidence[] {
  const candidates = segment.candidates.filter(item => item.scope === 'month_command_hidden_stem');
  const types = [...new Set(candidates.flatMap(item => item.matchedEntryTypes))];
  return types.map(type => {
    const matched = candidates.filter(candidate => candidate.matchedEntryTypes.includes(type));
    const entries = matched.flatMap(candidate => candidate.entries.filter(entry => entry.type === type));
    return makeEvidence({
      id: `composite-month-touch-${segment.segmentIndex}-${type}`,
      family: 'month_command_touch', side: 'context', roleSide: null, status: 'condition_only',
      label: BAZI_STRENGTH_COMPOSITE_METHODOLOGY.familyLabels.month_command_touch,
      detail: `${entries[0]?.label ?? type}：${entries.map(entry => entry.detail).join('；')}`,
      sourceStage: 'M9-11', sourceIds: matched.map(item => item.id), tenGod: null,
      boundary: '月令触达只进入复核列，不直接改变月令静态证据方向。',
    });
  });
}

/** 供按日综合矩阵复用 M9-12 的表层方向分类，不接收条件型藏干证据。 */
export function resolveDynamicDirection(evidence: Array<Pick<BaziStrengthCompositeEvidence, 'side'>>): BaziDynamicSurfaceDirection {
  const support = evidence.some(item => item.side === 'support');
  const drain = evidence.some(item => item.side === 'drain_or_control');
  if (support && drain) return 'both_sides';
  if (support) return 'support_only';
  if (drain) return 'drain_only';
  return 'none';
}

/** 复用 M9-12 的静态基线与可见动态表层比较语义。 */
export function resolveComparison(
  assessment: BaziInterpretationResult['strength']['assessment'],
  dynamic: BaziDynamicSurfaceDirection,
  completeness: BaziCalculationResult['completeness'],
): BaziStrengthCompositeComparison {
  if (completeness === 'partial_unknown_time' || assessment === 'insufficient_due_to_unknown_time') return 'partial_unknown_time';
  if (assessment === 'mixed_evidence') return 'static_baseline_mixed';
  if (dynamic === 'both_sides') return 'dynamic_surface_mixed';
  if (dynamic === 'none') return 'dynamic_surface_absent';
  const staticDirection = assessment === 'supporting_evidence_established' ? 'support_only' : 'drain_only';
  return staticDirection === dynamic ? 'static_dynamic_same_direction' : 'static_dynamic_different_directions';
}

function resolveReviewFlags(
  chart: BaziCalculationResult,
  interpretation: BaziInterpretationResult,
  dynamic: BaziDynamicSurfaceDirection,
  comparison: BaziStrengthCompositeComparison,
  monthCommand: BaziMonthCommandComposite,
  dynamicHidden: BaziStrengthCompositeEvidence[],
  rootConditions: BaziStrengthCompositeEvidence[],
): BaziStrengthCompositeReviewFlag[] {
  const flags: BaziStrengthCompositeReviewFlag[] = [];
  if (chart.completeness === 'partial_unknown_time') flags.push('unknown_time');
  if (comparison === 'static_dynamic_different_directions') flags.push('static_dynamic_direction_difference');
  if (interpretation.strength.assessment === 'mixed_evidence') flags.push('static_baseline_mixed');
  if (dynamic === 'both_sides') flags.push('dynamic_surface_mixed');
  if (monthCommand.touchStatus !== 'no_open_touch_condition') flags.push('month_command_touch_present');
  if (monthCommand.relationConditionStates.some(state => state !== '可核验条件齐备')) flags.push('month_command_relation_state_unresolved');
  if (rootConditions.length) flags.push('day_master_root_condition_present');
  if (dynamicHidden.length) flags.push('dynamic_hidden_position_only');
  return flags;
}

function countEvidence(evidence: BaziStrengthCompositeEvidence[]): BaziStrengthCompositeSegment['counts'] {
  return {
    supportEvidence: evidence.filter(item => item.side === 'support').length,
    drainOrControlEvidence: evidence.filter(item => item.side === 'drain_or_control').length,
    contextEvidence: evidence.filter(item => item.side === 'context').length,
    establishedEvidence: evidence.filter(item => item.status === 'established').length,
    conditionOnlyEvidence: evidence.filter(item => item.status === 'condition_only').length,
    positionOnlyEvidence: evidence.filter(item => item.status === 'position_only').length,
  };
}

/** 统一十神在扶抑方向矩阵中的生扶／泄耗制分类。 */
export function tenGodSide(tenGod: BaziTenGodName): Exclude<BaziStrengthCompositeSide, 'context'> {
  return SUPPORT_TEN_GODS.has(tenGod) ? 'support' : 'drain_or_control';
}

function makeEvidence(input: Omit<BaziStrengthCompositeEvidence, 'familyLabel'>): BaziStrengthCompositeEvidence {
  return { ...input, familyLabel: BAZI_STRENGTH_COMPOSITE_METHODOLOGY.familyLabels[input.family] };
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
