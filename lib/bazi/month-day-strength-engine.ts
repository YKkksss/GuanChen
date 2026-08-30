import type { BaziDynamicTenGodLayerSnapshot, BaziTenGodName } from './dynamic-ten-god-types';
import type { BaziHiddenStemActivationSegment } from './hidden-stem-activation-types';
import type { BaziInterpretationResult } from './interpretation-types';
import type { BaziMonthDayRelationResult } from './month-day-relation-types';
import {
  BAZI_MONTH_DAY_STRENGTH_ENGINE_VERSION,
  BAZI_MONTH_DAY_STRENGTH_METHODOLOGY,
  BAZI_MONTH_DAY_STRENGTH_METHODOLOGY_VERSION,
} from './month-day-strength-methodology';
import type {
  BaziMonthDayFocusComparison,
  BaziMonthDayStrengthEvidence,
  BaziMonthDayStrengthMonthCommand,
  BaziMonthDayStrengthResult,
  BaziMonthDayStrengthReviewFlag,
  BaziMonthDayStrengthSegment,
} from './month-day-strength-types';
import type { BaziMonthDayVisibilityResult, BaziMonthDayVisibilitySegment } from './month-day-visibility-types';
import {
  resolveComparison,
  resolveDynamicDirection,
  tenGodSide,
} from './strength-composite-engine';
import type {
  BaziDynamicSurfaceDirection,
  BaziStrengthCompositeComparison,
} from './strength-composite-types';
import type { BaziTransparencyRootSegment } from './transparency-root-types';
import type { BaziCalculationResult } from './types';

const DIRECTION_LABELS: Record<BaziDynamicSurfaceDirection, string> = {
  support_only: '只见生扶方向',
  drain_only: '只见泄耗制方向',
  both_sides: '生扶与泄耗制方向并见',
  none: '未见可归类的表层方向',
};

const FOCUS_COMPARISON_LABELS: Record<BaziMonthDayFocusComparison, string> = {
  focus_same_as_inherited: '流月流日与既有岁运表层方向同向',
  focus_different_from_inherited: '流月流日与既有岁运表层方向异向',
  focus_surface_mixed: '流月流日表层两类方向并见',
  inherited_surface_mixed: '既有岁运表层两类方向并见',
  focus_surface_absent: '流月流日表层方向缺失',
  inherited_surface_absent: '既有岁运表层方向缺失',
  partial_unknown_time: '时柱未知，方向比较证据不完整',
};

const STATIC_COMPARISON_LABELS: Record<BaziStrengthCompositeComparison, string> = {
  static_dynamic_same_direction: '静态标签与五层表层方向同向',
  static_dynamic_different_directions: '静态标签与五层表层方向异向',
  static_baseline_mixed: '静态基线本身为证据并见',
  dynamic_surface_mixed: '五层表层两类方向并见',
  partial_unknown_time: '时柱未知，静态与动态比较不完整',
  dynamic_surface_absent: '缺少五层表层方向',
};

/**
 * 将 M9-3 静态基线、M9-15 五层表层角色和 M9-16 条件证据合成按日矩阵。
 * 只有表层角色参与方向归类；所有藏干、透根和触达候选始终停留在上下文列。
 */
export function auditBaziMonthDayStrengthComposite(
  chart: BaziCalculationResult,
  interpretation: BaziInterpretationResult,
  relation: BaziMonthDayRelationResult,
  visibility: BaziMonthDayVisibilityResult,
): BaziMonthDayStrengthResult {
  assertAlignedInputs(relation, visibility);
  const segments = relation.segments.map(relationSegment => {
    const visibilitySegment = requireVisibilitySegment(visibility, relationSegment.segmentIndex);
    assertAlignedSegment(relationSegment, visibilitySegment);
    return buildSegment(chart, interpretation, relationSegment, visibilitySegment);
  });
  const available = relation.status !== 'sequence_only_unavailable' && segments.length > 0;

  return {
    methodologyVersion: BAZI_MONTH_DAY_STRENGTH_METHODOLOGY_VERSION,
    engineVersion: BAZI_MONTH_DAY_STRENGTH_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: relation.status,
    capabilities: {
      inheritedAndFocusSurfaceSeparation: available,
      fiveLayerDirectionComparison: available,
      monthCommandTouchReview: available,
      dayMasterRootConditionReview: available,
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
      monthDayRelationMethodologyVersion: relation.methodologyVersion,
      monthDayRelationEngineVersion: relation.engineVersion,
      monthDayVisibilityMethodologyVersion: visibility.methodologyVersion,
      monthDayVisibilityEngineVersion: visibility.engineVersion,
      targetYear: relation.source.targetYear,
      targetDate: relation.target.effectiveDate,
      lateZiPolicy: relation.source.lateZiPolicy,
    },
    staticBaseline: {
      assessment: interpretation.strength.assessment,
      label: interpretation.strength.label,
      confidence: interpretation.strength.confidence,
      boundary: interpretation.strength.boundary,
    },
    target: {
      effectiveDate: relation.target.effectiveDate,
      dayGanZhi: relation.target.dayGanZhi,
      segmentCount: segments.length,
    },
    segments,
    comparisonLabels: [...new Set(segments.flatMap(item => [item.focusComparisonLabel, item.staticComparisonLabel]))],
    reviewFlags: [...new Set(segments.flatMap(item => item.reviewFlags))],
    rulesApplied: [...BAZI_MONTH_DAY_STRENGTH_METHODOLOGY.deterministicOutputs],
    warnings: available ? [
      '既有岁运、流月流日和五层合并结果都只是可见十神方向标签，不是旺衰力量结论。',
      '藏干位置、日主根气、月令触达和其他藏干触达只列入条件上下文，不进入方向计算。',
      '同向不表示增强，异向不表示抵消或反转，两类方向并见也不设置净值或权重。',
      '跨节或跨运的同一日期必须逐片段读取，不能把前后片段证据合并。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，所有方向比较均保持证据不完整状态。'] : []),
    ] : ['上游没有可用的精确流日片段，M9-17 不补写旺衰方向或条件证据。'],
    boundary: '本结果只做 M9-3 静态基线、M9-15 五层可见表层方向与 M9-16 条件上下文的可追溯并列；不裁决最终旺衰、力量增减、格局成败、用神喜忌、吉凶或具体事件。',
  };
}
function buildSegment(
  chart: BaziCalculationResult,
  interpretation: BaziInterpretationResult,
  relationSegment: BaziMonthDayRelationResult['segments'][number],
  visibilitySegment: BaziMonthDayVisibilitySegment,
): BaziMonthDayStrengthSegment {
  const inheritedLayers = relationSegment.layers.filter(layer => layer.layer === 'luck_cycle' || layer.layer === 'annual');
  const focusLayers = relationSegment.layers.filter(layer => layer.layer === 'month' || layer.layer === 'day');
  const staticEvidence = buildStaticEvidence(interpretation);
  const inheritedSurface = buildSurfaceEvidence(inheritedLayers, 'inherited_dynamic_surface');
  const focusSurface = buildSurfaceEvidence(focusLayers, 'month_day_surface');
  const focusHidden = buildFocusHiddenEvidence(focusLayers, visibilitySegment.hiddenStemTouchAudit);
  const rootConditions = buildDayMasterRootConditions(chart, visibilitySegment.transparencyRootAudit);
  const monthCommand = buildMonthCommand(interpretation, visibilitySegment.hiddenStemTouchAudit);
  const monthTouch = buildMonthTouchEvidence(visibilitySegment.hiddenStemTouchAudit);
  const otherTouchContext = buildOtherTouchContext(visibilitySegment.hiddenStemTouchAudit);
  const evidence = [
    ...staticEvidence,
    ...inheritedSurface,
    ...focusSurface,
    ...focusHidden,
    ...rootConditions,
    ...monthTouch,
    ...otherTouchContext,
  ];
  const inheritedDirection = resolveDynamicDirection(inheritedSurface);
  const focusDirection = resolveDynamicDirection(focusSurface);
  const combinedDirection = resolveDynamicDirection([...inheritedSurface, ...focusSurface]);
  const focusComparison = resolveFocusComparison(chart, inheritedDirection, focusDirection);
  const staticComparison = resolveComparison(interpretation.strength.assessment, combinedDirection, chart.completeness);
  const reviewFlags = resolveReviewFlags(
    chart,
    inheritedDirection,
    focusDirection,
    focusComparison,
    monthCommand,
    rootConditions,
    otherTouchContext,
  );

  return {
    segmentIndex: relationSegment.segmentIndex,
    startAt: relationSegment.startAt,
    endAtExclusive: relationSegment.endAtExclusive,
    luckCycleIndex: relationSegment.luckCycleIndex,
    luckCycleGanZhi: relationSegment.luckCycleGanZhi,
    annualYear: relationSegment.annualYear,
    annualGanZhi: relationSegment.annualGanZhi,
    monthIndex: relationSegment.monthIndex,
    monthGanZhi: relationSegment.monthGanZhi,
    dayGanZhi: relationSegment.dayGanZhi,
    label: relationSegment.label,
    monthCommand,
    inheritedSurfaceDirection: inheritedDirection,
    inheritedSurfaceDirectionLabel: `大运／流年：${DIRECTION_LABELS[inheritedDirection]}`,
    focusSurfaceDirection: focusDirection,
    focusSurfaceDirectionLabel: `流月／流日：${DIRECTION_LABELS[focusDirection]}`,
    combinedSurfaceDirection: combinedDirection,
    combinedSurfaceDirectionLabel: `五层表层合并：${DIRECTION_LABELS[combinedDirection]}`,
    focusComparison,
    focusComparisonLabel: FOCUS_COMPARISON_LABELS[focusComparison],
    staticComparison,
    staticComparisonLabel: STATIC_COMPARISON_LABELS[staticComparison],
    reviewFlags,
    evidence,
    counts: countEvidence(evidence),
    boundary: '方向列只读取本精确片段中的表层十神；条件上下文列不参与方向计算，同向、异向与并见均不是最终旺衰结论。',
  };
}

function buildStaticEvidence(interpretation: BaziInterpretationResult): BaziMonthDayStrengthEvidence[] {
  return interpretation.strength.evidence.map(item => makeEvidence({
    id: `month-day-strength-static-${item.id}`,
    family: 'static_baseline',
    side: item.side,
    roleSide: item.side === 'context' ? null : item.side,
    status: 'upstream_label',
    label: item.label,
    detail: item.detail,
    sourceStage: 'M9-3',
    sourceIds: [item.id],
    tenGod: null,
    boundary: '原样保留 M9-3 静态证据方向，不按当前流日重新分类或加权。',
  }));
}

function buildSurfaceEvidence(
  layers: BaziDynamicTenGodLayerSnapshot[],
  family: 'inherited_dynamic_surface' | 'month_day_surface',
): BaziMonthDayStrengthEvidence[] {
  return layers.flatMap(layer => layer.roles
    .filter(role => role.sourceKind === 'surface_stem')
    .map(role => makeEvidence({
      id: `month-day-strength-surface-${role.id}`,
      family,
      side: tenGodSide(role.tenGod),
      roleSide: tenGodSide(role.tenGod),
      status: 'established',
      label: `${layer.label}表层${role.stem}${role.tenGod}`,
      detail: `${role.tenGod}相对日主归入${tenGodSide(role.tenGod) === 'support' ? '生扶' : '泄耗制'}方向；只记表层方向，不设置数量权重。`,
      sourceStage: 'M9-15',
      sourceIds: [role.id],
      tenGod: role.tenGod,
      boundary: `${layer.label}表层十神只作为方向证据，不等于已改变日主旺衰。`,
    })));
}

function buildFocusHiddenEvidence(
  layers: BaziDynamicTenGodLayerSnapshot[],
  activation: BaziHiddenStemActivationSegment,
): BaziMonthDayStrengthEvidence[] {
  return layers.flatMap(layer => layer.roles
    .filter(role => role.sourceKind === 'branch_hidden_stem')
    .map(role => {
      const candidate = activation.candidates.find(item => item.hiddenOccurrence.id === `${role.id}-occurrence`);
      const touched = candidate && candidate.status !== 'no_touch_condition';
      return makeEvidence({
        id: `month-day-strength-hidden-${role.id}`,
        family: 'month_day_hidden_position',
        side: 'context',
        roleSide: tenGodSide(role.tenGod),
        status: touched ? 'condition_only' : 'position_only',
        label: `${layer.label}${role.sourceBranch}藏${role.stem}（${role.hiddenQiLabel}，${role.tenGod}）`,
        detail: touched
          ? `命中${candidate.matchedEntryTypes.length}类 M9-16 触达入口；仍不等于已经发动或形成实际力量。`
          : '只确认流月或流日地支内含此藏干，未命中 M9-16 已开放触达入口。',
        sourceStage: 'M9-16',
        sourceIds: candidate ? [role.id, candidate.id] : [role.id],
        tenGod: role.tenGod,
        boundary: '流月流日藏干只进入条件上下文列，不计入生扶或泄耗制方向。',
      });
    }));
}

function buildDayMasterRootConditions(
  chart: BaziCalculationResult,
  segment: BaziTransparencyRootSegment,
): BaziMonthDayStrengthEvidence[] {
  return segment.rootCandidates
    .filter(candidate => candidate.surfaceOccurrence.sourceKind === 'day_master_reference')
    .filter(candidate => candidate.status !== 'hidden_support_missing')
    .map(candidate => makeEvidence({
      id: `month-day-strength-day-root-${candidate.id}`,
      family: 'day_master_root_condition',
      side: 'context',
      roleSide: 'support',
      status: 'condition_only',
      label: candidate.status === 'exact_same_stem_root'
        ? `日主${chart.dayMaster.stem}见严格同干根条件`
        : `日主${chart.dayMaster.stem}见同五行支持参照`,
      detail: candidate.status === 'exact_same_stem_root'
        ? `完全同干位置：${candidate.exactRootMatches.map(item => item.label).join('；')}`
        : `同五行不同干位置：${candidate.sameElementSupportMatches.map(item => item.label).join('；')}`,
      sourceStage: 'M9-16',
      sourceIds: [candidate.id],
      tenGod: null,
      boundary: '这里只记录日主根气条件，不裁决根气有效、等级、真假或力量。',
    }));
}

function buildMonthCommand(
  interpretation: BaziInterpretationResult,
  activation: BaziHiddenStemActivationSegment,
): BaziMonthDayStrengthMonthCommand {
  const candidates = activation.candidates.filter(item => item.scope === 'month_command_hidden_stem');
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
    touchedHiddenOccurrenceIds: candidates
      .filter(item => item.status !== 'no_touch_condition')
      .map(item => item.hiddenOccurrence.id),
    relationConditionStates,
    boundary: touchTypes.length
      ? '月令藏干存在 M9-16 开放触达入口；只要求复核，不推导月令增强、受损、失效或合化。'
      : '当前未命中 M9-16 开放入口；不等于月令绝对稳定或不受尚未实现的条件影响。',
  };
}

function buildMonthTouchEvidence(activation: BaziHiddenStemActivationSegment): BaziMonthDayStrengthEvidence[] {
  const candidates = activation.candidates.filter(item => item.scope === 'month_command_hidden_stem');
  const types = [...new Set(candidates.flatMap(item => item.matchedEntryTypes))];
  return types.map(type => {
    const matched = candidates.filter(candidate => candidate.matchedEntryTypes.includes(type));
    const entries = matched.flatMap(candidate => candidate.entries.filter(entry => entry.type === type));
    return makeEvidence({
      id: `month-day-strength-month-command-${activation.segmentIndex}-${type}`,
      family: 'month_command_touch',
      side: 'context',
      roleSide: null,
      status: 'condition_only',
      label: BAZI_MONTH_DAY_STRENGTH_METHODOLOGY.familyLabels.month_command_touch,
      detail: `${entries[0]?.label ?? type}：${entries.map(entry => entry.detail).join('；')}`,
      sourceStage: 'M9-16',
      sourceIds: matched.map(item => item.id),
      tenGod: null,
      boundary: '月令触达只进入复核列，不直接改变月令静态证据方向。',
    });
  });
}

function buildOtherTouchContext(activation: BaziHiddenStemActivationSegment): BaziMonthDayStrengthEvidence[] {
  return activation.candidates
    .filter(candidate => candidate.scope === 'general_hidden_stem' && candidate.status !== 'no_touch_condition')
    .map(candidate => makeEvidence({
      id: `month-day-strength-touch-${candidate.id}`,
      family: 'hidden_stem_touch_context',
      side: 'context',
      roleSide: tenGodSide(candidate.tenGod),
      status: 'condition_only',
      label: `${candidate.hiddenOccurrence.label}触达条件`,
      detail: `命中${candidate.matchedEntryTypes.length}类入口：${candidate.entries
        .filter(entry => entry.state === 'matched')
        .map(entry => entry.label)
        .join('、')}；只记录条件，不宣告藏干发动。`,
      sourceStage: 'M9-16',
      sourceIds: [candidate.id],
      tenGod: candidate.tenGod,
      boundary: '藏干触达上下文不计入方向，不推导实际生扶、泄耗或制克力量。',
    }));
}

function resolveFocusComparison(
  chart: BaziCalculationResult,
  inherited: BaziDynamicSurfaceDirection,
  focus: BaziDynamicSurfaceDirection,
): BaziMonthDayFocusComparison {
  if (chart.completeness === 'partial_unknown_time') return 'partial_unknown_time';
  if (focus === 'none') return 'focus_surface_absent';
  if (inherited === 'none') return 'inherited_surface_absent';
  if (focus === 'both_sides') return 'focus_surface_mixed';
  if (inherited === 'both_sides') return 'inherited_surface_mixed';
  return focus === inherited ? 'focus_same_as_inherited' : 'focus_different_from_inherited';
}

function resolveReviewFlags(
  chart: BaziCalculationResult,
  inherited: BaziDynamicSurfaceDirection,
  focus: BaziDynamicSurfaceDirection,
  comparison: BaziMonthDayFocusComparison,
  monthCommand: BaziMonthDayStrengthMonthCommand,
  rootConditions: BaziMonthDayStrengthEvidence[],
  hiddenTouch: BaziMonthDayStrengthEvidence[],
): BaziMonthDayStrengthReviewFlag[] {
  const flags: BaziMonthDayStrengthReviewFlag[] = [];
  if (chart.completeness === 'partial_unknown_time') flags.push('unknown_time');
  if (focus === 'both_sides') flags.push('focus_surface_mixed');
  if (inherited === 'both_sides') flags.push('inherited_surface_mixed');
  if (comparison === 'focus_different_from_inherited') flags.push('focus_inherited_direction_difference');
  if (monthCommand.touchStatus !== 'no_open_touch_condition') flags.push('month_command_touch_present');
  if (rootConditions.length) flags.push('day_master_root_condition_present');
  if (hiddenTouch.length) flags.push('hidden_touch_context_present');
  return flags;
}

function countEvidence(evidence: BaziMonthDayStrengthEvidence[]): BaziMonthDayStrengthSegment['counts'] {
  return {
    supportEvidence: evidence.filter(item => item.side === 'support').length,
    drainOrControlEvidence: evidence.filter(item => item.side === 'drain_or_control').length,
    contextEvidence: evidence.filter(item => item.side === 'context').length,
    inheritedSurfaceEvidence: evidence.filter(item => item.family === 'inherited_dynamic_surface').length,
    focusSurfaceEvidence: evidence.filter(item => item.family === 'month_day_surface').length,
    conditionOnlyEvidence: evidence.filter(item => item.status === 'condition_only').length,
    positionOnlyEvidence: evidence.filter(item => item.status === 'position_only').length,
  };
}

function makeEvidence(input: Omit<BaziMonthDayStrengthEvidence, 'familyLabel'>): BaziMonthDayStrengthEvidence {
  return { ...input, familyLabel: BAZI_MONTH_DAY_STRENGTH_METHODOLOGY.familyLabels[input.family] };
}

function assertAlignedInputs(relation: BaziMonthDayRelationResult, visibility: BaziMonthDayVisibilityResult): void {
  if (relation.target.effectiveDate !== visibility.target.effectiveDate) {
    throw new Error(`M9-15 与 M9-16 目标日期不一致：${relation.target.effectiveDate} / ${visibility.target.effectiveDate}`);
  }
  if (relation.source.targetYear !== visibility.source.targetYear) {
    throw new Error(`M9-15 与 M9-16 目标年份不一致：${relation.source.targetYear} / ${visibility.source.targetYear}`);
  }
}

function requireVisibilitySegment(
  visibility: BaziMonthDayVisibilityResult,
  segmentIndex: number,
): BaziMonthDayVisibilitySegment {
  const found = visibility.segments.find(item => item.segmentIndex === segmentIndex);
  if (!found) throw new Error(`片段 ${segmentIndex} 缺少 M9-16 显隐、透根与触达条件`);
  return found;
}

function assertAlignedSegment(
  relation: BaziMonthDayRelationResult['segments'][number],
  visibility: BaziMonthDayVisibilitySegment,
): void {
  if (relation.startAt !== visibility.startAt || relation.endAtExclusive !== visibility.endAtExclusive) {
    throw new Error(`片段 ${relation.segmentIndex} 的 M9-15 与 M9-16 时间边界不一致`);
  }
  if (relation.annualGanZhi !== visibility.annualGanZhi
    || relation.monthGanZhi !== visibility.monthGanZhi
    || relation.dayGanZhi !== visibility.dayGanZhi
    || relation.luckCycleIndex !== visibility.luckCycleIndex) {
    throw new Error(`片段 ${relation.segmentIndex} 的 M9-15 与 M9-16 五层快照不一致`);
  }
}
