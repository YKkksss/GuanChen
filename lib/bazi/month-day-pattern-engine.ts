import type { BaziDynamicTenGodRole, BaziTenGodName } from './dynamic-ten-god-types';
import {
  BAZI_MONTH_DAY_PATTERN_ENGINE_VERSION,
  BAZI_MONTH_DAY_PATTERN_METHODOLOGY,
  BAZI_MONTH_DAY_PATTERN_METHODOLOGY_VERSION,
} from './month-day-pattern-methodology';
import type {
  BaziMonthDayPatternCandidateMapping,
  BaziMonthDayPatternCheckMapping,
  BaziMonthDayPatternCoverage,
  BaziMonthDayPatternCoverageGroup,
  BaziMonthDayPatternEvidence,
  BaziMonthDayPatternResult,
  BaziMonthDayPatternReviewFlag,
  BaziMonthDayPatternSegment,
} from './month-day-pattern-types';
import type { BaziMonthDayRelationResult } from './month-day-relation-types';
import type { BaziMonthDayStrengthResult } from './month-day-strength-types';
import type { BaziMonthDayVisibilityResult } from './month-day-visibility-types';
import {
  describeBaziPatternConditionRule,
  type BaziPatternRuleDescriptor,
} from './pattern-condition-engine';
import type {
  BaziPatternCandidateConditionAudit,
  BaziPatternConditionCheck,
  BaziPatternConditionResult,
} from './pattern-condition-types';
import type { BaziRelationEvidence } from './relation-audit-types';
import type { BaziCalculationResult } from './types';

const COVERAGE_LABELS: Record<BaziMonthDayPatternCoverage['status'], string> = {
  required_role_groups_observed: '规则所需表层角色组已观察到',
  partial_role_groups_observed: '只观察到部分规则角色组',
  no_required_surface_role_observed: '当前组未观察到规则所需表层角色',
  structural_entry_observed: '观察到明确结构入口',
  structural_entry_not_observed: '当前组未观察到明确结构入口',
  absence_rule_not_reclassified: '缺项规则不由动态层重分类',
  upstream_context_only: '只保留上游上下文',
  partial_unknown_time: '时柱未知，未见项保持不完整',
};

/**
 * 把 M9-13 静态格局条件映射到指定流日的精确动态片段。
 * 本函数只记录规则角色覆盖和结构入口，不修改 M9-13 检查状态。
 */
export function auditBaziMonthDayPatternConditions(
  chart: BaziCalculationResult,
  patternCondition: BaziPatternConditionResult,
  relation: BaziMonthDayRelationResult,
  visibility: BaziMonthDayVisibilityResult,
  strength: BaziMonthDayStrengthResult,
): BaziMonthDayPatternResult {
  assertAlignedInputs(relation, visibility, strength);
  const segments = relation.segments.map(relationSegment => {
    const visibilitySegment = visibility.segments.find(item => item.segmentIndex === relationSegment.segmentIndex);
    const strengthSegment = strength.segments.find(item => item.segmentIndex === relationSegment.segmentIndex);
    if (!visibilitySegment || !strengthSegment) throw new Error(`片段 ${relationSegment.segmentIndex} 缺少 M9-16 或 M9-17 上游证据`);
    if (relationSegment.startAt !== visibilitySegment.startAt
      || relationSegment.endAtExclusive !== visibilitySegment.endAtExclusive
      || relationSegment.startAt !== strengthSegment.startAt
      || relationSegment.endAtExclusive !== strengthSegment.endAtExclusive) {
      throw new Error(`片段 ${relationSegment.segmentIndex} 的 M9-15、M9-16 与 M9-17 时间边界不一致`);
    }
    return buildSegment(chart, patternCondition, relationSegment, visibilitySegment, strengthSegment);
  });
  const available = relation.status !== 'sequence_only_unavailable' && segments.length > 0;
  return {
    methodologyVersion: BAZI_MONTH_DAY_PATTERN_METHODOLOGY_VERSION,
    engineVersion: BAZI_MONTH_DAY_PATTERN_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: relation.status,
    capabilities: {
      staticInheritedFocusSeparation: available,
      dynamicRoleCoverageMapping: available,
      monthDayRelationContextMapping: available,
      hiddenPositionTouchContextMapping: available,
      strengthDirectionContext: available,
      finalPatternSuccessFailure: false,
      rescueCompletionVerdict: false,
      patternScore: false,
      usefulGodVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      patternConditionMethodologyVersion: patternCondition.methodologyVersion,
      patternConditionEngineVersion: patternCondition.engineVersion,
      monthDayRelationMethodologyVersion: relation.methodologyVersion,
      monthDayRelationEngineVersion: relation.engineVersion,
      monthDayVisibilityMethodologyVersion: visibility.methodologyVersion,
      monthDayVisibilityEngineVersion: visibility.engineVersion,
      monthDayStrengthMethodologyVersion: strength.methodologyVersion,
      monthDayStrengthEngineVersion: strength.engineVersion,
      targetYear: relation.source.targetYear,
      targetDate: relation.target.effectiveDate,
      lateZiPolicy: relation.source.lateZiPolicy,
    },
    target: {
      effectiveDate: relation.target.effectiveDate,
      dayGanZhi: relation.target.dayGanZhi,
      segmentCount: segments.length,
    },
    segments,
    reviewFlags: [...new Set(segments.flatMap(item => item.reviewFlags))],
    rulesApplied: [...BAZI_MONTH_DAY_PATTERN_METHODOLOGY.deterministicOutputs],
    warnings: available ? [
      'M9-13 的候选、静态检查状态和风险救应链接保持不变，动态层只增加可追溯映射。',
      '规则角色组在表层观察到不等于条件已经齐备，更不等于格局成立、破败或救应完成。',
      '流月流日藏干位置和触达只进入上下文，不得冒充表层角色覆盖。',
      'M9-17 方向只提供身用承载背景，不参与格局成败、层次或评分。',
      '跨节或跨运流日必须逐片段读取，不得累计前后角色和结构入口。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，静态缺项与所有未见项继续保持不完整。'] : []),
    ] : ['上游没有精确流日片段，M9-18 不补写动态格局条件。'],
    boundary: '本结果只把 M9-13 静态格局条件与 M9-15 表层角色／关系、M9-16 藏干条件、M9-17 方向背景按精确片段并列；不裁决某日成格、破格、救应完成、格局高低、用神喜忌、吉凶或事件。',
  };
}

function buildSegment(
  chart: BaziCalculationResult,
  patternCondition: BaziPatternConditionResult,
  relationSegment: BaziMonthDayRelationResult['segments'][number],
  visibilitySegment: BaziMonthDayVisibilityResult['segments'][number],
  strengthSegment: BaziMonthDayStrengthResult['segments'][number],
): BaziMonthDayPatternSegment {
  const inheritedRoles = relationSegment.layers
    .filter(layer => layer.layer === 'luck_cycle' || layer.layer === 'annual')
    .flatMap(layer => layer.roles.filter(isSurfaceRole));
  const focusRoles = relationSegment.layers
    .filter(layer => layer.layer === 'month' || layer.layer === 'day')
    .flatMap(layer => layer.roles.filter(isSurfaceRole));
  const candidates = patternCondition.candidates.map(candidate => buildCandidateMapping(
    chart,
    candidate,
    inheritedRoles,
    focusRoles,
    relationSegment.evidence,
    visibilitySegment,
  ));
  const reviewFlags = [...new Set([
    'strength_context_not_final' as const,
    ...(chart.completeness === 'partial_unknown_time' ? ['unknown_time' as const] : []),
    ...candidates.flatMap(item => item.reviewFlags),
  ])];
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
    strengthContext: {
      staticLabel: strengthSegment.monthCommand.staticAssessmentLabel,
      inheritedDirectionLabel: strengthSegment.inheritedSurfaceDirectionLabel,
      focusDirectionLabel: strengthSegment.focusSurfaceDirectionLabel,
      combinedDirectionLabel: strengthSegment.combinedSurfaceDirectionLabel,
      focusComparisonLabel: strengthSegment.focusComparisonLabel,
      boundary: '方向仅作为身用承载背景，不参与本片段格局条件覆盖状态。',
    },
    candidates,
    reviewFlags,
    counts: {
      candidates: candidates.length,
      checks: candidates.reduce((sum, item) => sum + item.counts.staticChecks, 0),
      inheritedEntries: candidates.reduce((sum, item) => sum + item.counts.inheritedEntries, 0),
      focusEntries: candidates.reduce((sum, item) => sum + item.counts.focusEntries, 0),
      relationContexts: candidates.reduce((sum, item) => sum + item.counts.relationContexts, 0),
      hiddenContexts: candidates.reduce((sum, item) => sum + item.counts.hiddenContexts, 0),
    },
    boundary: '所有映射只读取本精确片段；静态状态不被动态角色覆盖，前后片段条件不得累计。',
  };
}

function buildCandidateMapping(
  chart: BaziCalculationResult,
  candidate: BaziPatternCandidateConditionAudit,
  inheritedRoles: BaziDynamicTenGodRole[],
  focusRoles: BaziDynamicTenGodRole[],
  relationEvidence: BaziRelationEvidence[],
  visibilitySegment: BaziMonthDayVisibilityResult['segments'][number],
): BaziMonthDayPatternCandidateMapping {
  const mapChecks = (checks: BaziPatternConditionCheck[]) => checks.map(check => buildCheckMapping(
    chart, check, inheritedRoles, focusRoles, relationEvidence, visibilitySegment,
  ));
  const formationSupport = mapChecks(candidate.formationSupport);
  const breakingRisks = mapChecks(candidate.breakingRisks);
  const rescueCandidates = mapChecks(candidate.rescueCandidates);
  const all = [...formationSupport, ...breakingRisks, ...rescueCandidates];
  const reviewFlags = [...new Set(all.flatMap(item => item.reviewFlags))];
  return {
    candidateId: candidate.id,
    label: candidate.label,
    tenGod: candidate.tenGod,
    archetype: candidate.archetype,
    archetypeLabel: candidate.archetypeLabel,
    sourceStem: candidate.sourceStem,
    sourceQi: candidate.sourceQi,
    upstreamStatus: candidate.upstreamStatus,
    formationSupport,
    breakingRisks,
    rescueCandidates,
    reviewFlags,
    counts: {
      staticChecks: all.length,
      inheritedEntries: all.reduce((sum, item) => sum + item.inheritedCoverage.evidence.length, 0),
      focusEntries: all.reduce((sum, item) => sum + item.focusCoverage.evidence.length, 0),
      combinedCompleteCoverage: all.filter(item => ['required_role_groups_observed', 'structural_entry_observed'].includes(item.combinedCoverage.status)).length,
      relationContexts: all.reduce((sum, item) => sum + item.relationContext.length, 0),
      hiddenContexts: all.reduce((sum, item) => sum + item.hiddenContext.length, 0),
    },
    boundary: '该候选只展示静态检查与动态条件入口的并列映射，不形成格局成败、变化或层次结论。',
  };
}

function buildCheckMapping(
  chart: BaziCalculationResult,
  check: BaziPatternConditionCheck,
  inheritedRoles: BaziDynamicTenGodRole[],
  focusRoles: BaziDynamicTenGodRole[],
  relations: BaziRelationEvidence[],
  visibilitySegment: BaziMonthDayVisibilityResult['segments'][number],
): BaziMonthDayPatternCheckMapping {
  const descriptor = describeBaziPatternConditionRule(check.ruleId, check.requiredRoles);
  const inheritedSurface = inheritedRoles.filter(role => check.requiredRoles.includes(role.tenGod));
  const focusSurface = focusRoles.filter(role => check.requiredRoles.includes(role.tenGod));
  const allSurface = [...inheritedSurface, ...focusSurface];
  const relationContext = buildRelationContext(descriptor, relations, allSurface);
  const hiddenContext = buildHiddenContext(check.requiredRoles, visibilitySegment);
  const inheritedRelations = filterRelationsForRoles(relationContext, inheritedSurface);
  const focusRelations = descriptor.matchMode === 'month_interaction' || descriptor.matchMode === 'month_relation_rescue'
    ? relationContext
    : filterRelationsForRoles(relationContext, focusSurface);
  const inheritedCoverage = buildCoverage(chart, 'inherited_surface', descriptor, inheritedSurface, inheritedRelations);
  const focusCoverage = buildCoverage(chart, 'month_day_surface', descriptor, focusSurface, focusRelations);
  const combinedCoverage = buildCoverage(chart, 'combined_surface', descriptor, allSurface, relationContext);
  const reviewFlags = resolveCheckReviewFlags(check, inheritedCoverage, focusCoverage, combinedCoverage, relationContext, hiddenContext);
  return {
    id: `month-day-pattern-${check.id}`,
    ruleId: check.ruleId,
    kind: check.kind,
    label: check.label,
    matchMode: descriptor.matchMode,
    requiredRoles: check.requiredRoles,
    roleGroups: descriptor.roleGroups,
    linkedBreakingRuleIds: check.linkedBreakingRuleIds,
    staticStatus: check.status,
    staticStatusLabel: check.statusLabel,
    staticDetail: check.detail,
    staticEvidence: check.evidence.map(item => ({
      id: `month-day-pattern-static-${item.id}`,
      sourceGroup: 'static_condition',
      visibility: item.visibility === 'upstream_context' ? 'context' : item.visibility,
      layer: item.visibility === 'upstream_context' ? null : 'natal',
      label: item.label,
      detail: item.detail,
      stem: item.stem,
      branch: item.branch,
      tenGod: item.tenGod,
      sourceStage: item.sourceStage,
      sourceIds: [item.id, check.id],
      boundary: '原样引用 M9-13 静态证据，不由当前流日改写。',
    })),
    inheritedCoverage,
    focusCoverage,
    combinedCoverage,
    relationContext,
    hiddenContext,
    reviewFlags,
    conclusion: 'mapping_only_no_condition_or_pattern_verdict',
    boundary: `${descriptor.boundary}${check.kind === 'formation_support' ? '支持映射不等于成格。' : check.kind === 'breaking_risk' ? '风险映射不等于破格。' : '救应映射不等于救应完成。'}`,
  };
}

function buildCoverage(
  chart: BaziCalculationResult,
  group: BaziMonthDayPatternCoverageGroup,
  descriptor: BaziPatternRuleDescriptor,
  roles: BaziDynamicTenGodRole[],
  relations: BaziMonthDayPatternEvidence[],
): BaziMonthDayPatternCoverage {
  const roleEvidence = roles.map(role => roleToEvidence(role, group));
  let status: BaziMonthDayPatternCoverage['status'];
  const observedRoleGroups = descriptor.roleGroups.filter(roleGroup => roleGroup.some(roleName => roles.some(role => role.tenGod === roleName)));
  const missingRoleGroups = descriptor.roleGroups.filter(roleGroup => !observedRoleGroups.includes(roleGroup));
  if (descriptor.matchMode === 'candidate_context' || descriptor.matchMode === 'strength_context') {
    status = 'upstream_context_only';
  } else if (descriptor.matchMode === 'absence') {
    status = 'absence_rule_not_reclassified';
  } else if (descriptor.matchMode === 'stem_combine'
    || descriptor.matchMode === 'month_relation_rescue'
    || descriptor.matchMode === 'month_interaction') {
    status = relations.length ? 'structural_entry_observed' : 'structural_entry_not_observed';
  } else if (descriptor.roleGroups.length && observedRoleGroups.length === descriptor.roleGroups.length) {
    status = 'required_role_groups_observed';
  } else if (observedRoleGroups.length) {
    status = 'partial_role_groups_observed';
  } else {
    status = chart.completeness === 'partial_unknown_time' ? 'partial_unknown_time' : 'no_required_surface_role_observed';
  }
  const evidence = uniqueEvidence([...roleEvidence, ...relations]);
  return {
    group,
    status,
    statusLabel: COVERAGE_LABELS[status],
    observedRoleGroups,
    missingRoleGroups,
    evidence,
    detail: coverageDetail(group, status, roles, relations),
    boundary: descriptor.matchMode === 'absence'
      ? '动态层只展示相关角色位置，不能修复、删除或重分类 M9-13 原局缺项状态。'
      : '覆盖状态只表示当前组是否出现规则相关表层角色或明确结构入口，不是条件齐备和格局结论。',
  };
}

function buildRelationContext(
  descriptor: BaziPatternRuleDescriptor,
  relations: BaziRelationEvidence[],
  roles: BaziDynamicTenGodRole[],
): BaziMonthDayPatternEvidence[] {
  let matches: BaziRelationEvidence[] = [];
  if (descriptor.matchMode === 'stem_combine') {
    const nodeIds = new Set(roles.map(role => role.nodeId));
    matches = relations.filter(item => item.type === 'stem_five_combine'
      && item.participants.some(participant => nodeIds.has(participant.id)));
  } else if (descriptor.matchMode === 'month_interaction' || descriptor.matchMode === 'month_relation_rescue') {
    const allowed = descriptor.matchMode === 'month_relation_rescue'
      ? new Set(['branch_six_combine', 'branch_three_harmony', 'branch_three_meeting'])
      : null;
    matches = relations.filter(item => item.domain === 'branch'
      && item.participants.some(participant => participant.layer === 'natal' && participant.pillarKey === 'month')
      && (!allowed || allowed.has(item.type)));
  }
  return matches.map(item => ({
    id: `month-day-pattern-relation-${item.id}`,
    sourceGroup: 'month_day_relation_context',
    visibility: 'structural',
    layer: null,
    label: item.label,
    detail: `${item.detail}参与位置：${item.participants.map(participant => `${participant.label}${participant.symbol}`).join('、')}。`,
    stem: item.domain === 'stem' ? item.participants[0]?.symbol ?? null : null,
    branch: item.domain === 'branch' ? item.participants.map(participant => participant.symbol).join('') : null,
    tenGod: null,
    sourceStage: 'M9-15',
    sourceIds: [item.id, ...item.participants.map(participant => participant.id)],
    boundary: '明确关系只作为格局规则的结构入口，不裁决合化、解冲、破格或救应完成。',
  }));
}

function buildHiddenContext(
  requiredRoles: BaziTenGodName[],
  segment: BaziMonthDayVisibilityResult['segments'][number],
): BaziMonthDayPatternEvidence[] {
  if (!requiredRoles.length) return [];
  return segment.hiddenStemTouchAudit.candidates
    .filter(candidate => requiredRoles.includes(candidate.tenGod))
    .map(candidate => ({
      id: `month-day-pattern-hidden-${candidate.id}`,
      sourceGroup: candidate.status === 'no_touch_condition' ? 'hidden_position_context' : 'hidden_touch_context',
      visibility: 'hidden',
      layer: candidate.hiddenOccurrence.layer,
      label: `${candidate.hiddenOccurrence.label}（${candidate.tenGod}）`,
      detail: candidate.status === 'no_touch_condition'
        ? '只确认藏干位置，未命中 M9-16 已开放触达入口。'
        : `命中${candidate.matchedEntryTypes.length}类 M9-16 触达入口；仍不等于透出、发动或满足表层规则。`,
      stem: candidate.hiddenOccurrence.stem,
      branch: candidate.hiddenOccurrence.sourceBranch,
      tenGod: candidate.tenGod,
      sourceStage: 'M9-16',
      sourceIds: [candidate.id, candidate.hiddenOccurrence.id],
      boundary: '藏干位置与触达只能作为条件上下文，不计入表层角色覆盖。',
    }));
}

function roleToEvidence(
  role: BaziDynamicTenGodRole,
  group: BaziMonthDayPatternCoverageGroup,
): BaziMonthDayPatternEvidence {
  return {
    id: `month-day-pattern-role-${group}-${role.id}`,
    sourceGroup: role.layer === 'month' || role.layer === 'day' ? 'month_day_surface' : 'inherited_surface',
    visibility: 'surface',
    layer: role.layer,
    label: `${layerLabel(role.layer)}表层${role.stem}（${role.tenGod}）`,
    detail: `${role.tenGod}与当前 M9-13 规则角色组发生表层覆盖；只记录位置，不设置权重。`,
    stem: role.stem,
    branch: null,
    tenGod: role.tenGod,
    sourceStage: 'M9-15',
    sourceIds: [role.id, role.nodeId],
    boundary: '表层角色覆盖不等于格局条件齐备、成格、破格或救应完成。',
  };
}

function filterRelationsForRoles(
  relations: BaziMonthDayPatternEvidence[],
  roles: BaziDynamicTenGodRole[],
): BaziMonthDayPatternEvidence[] {
  const nodeIds = new Set(roles.map(role => role.nodeId));
  return relations.filter(item => item.sourceIds.some(id => nodeIds.has(id)));
}

function resolveCheckReviewFlags(
  check: BaziPatternConditionCheck,
  inherited: BaziMonthDayPatternCoverage,
  focus: BaziMonthDayPatternCoverage,
  combined: BaziMonthDayPatternCoverage,
  relations: BaziMonthDayPatternEvidence[],
  hidden: BaziMonthDayPatternEvidence[],
): BaziMonthDayPatternReviewFlag[] {
  const flags: BaziMonthDayPatternReviewFlag[] = ['strength_context_not_final'];
  if ([inherited, focus, combined].some(item => item.status === 'partial_unknown_time')) flags.push('unknown_time');
  if (focus.evidence.length) flags.push('focus_condition_entry_present');
  if (combined.status === 'required_role_groups_observed'
    && inherited.status !== 'required_role_groups_observed'
    && focus.status !== 'required_role_groups_observed') flags.push('combined_only_role_coverage');
  if ([inherited, focus, combined].some(item => item.status === 'partial_role_groups_observed')) flags.push('partial_role_coverage');
  if (hidden.length) flags.push('hidden_context_present');
  if (relations.length) flags.push('relation_context_present');
  if (check.kind === 'breaking_risk' && ['evidence_present', 'requires_manual_review', 'unknown_due_to_missing_time'].includes(check.status)) flags.push('static_risk_present');
  if (check.kind === 'rescue_candidate' && check.linkedBreakingRuleIds.length) flags.push('rescue_link_unresolved');
  return [...new Set(flags)];
}

function coverageDetail(
  group: BaziMonthDayPatternCoverageGroup,
  status: BaziMonthDayPatternCoverage['status'],
  roles: BaziDynamicTenGodRole[],
  relations: BaziMonthDayPatternEvidence[],
): string {
  const groupLabel = group === 'inherited_surface' ? '大运／流年既有层' : group === 'month_day_surface' ? '流月／流日新增层' : '四个动态表层合并层';
  if (status === 'absence_rule_not_reclassified') return `${groupLabel}只列相关角色，不改写原局缺项规则。`;
  if (status === 'upstream_context_only') return `${groupLabel}不参与该上游上下文检查。`;
  if (relations.length) return `${groupLabel}观察到${relations.map(item => item.label).join('、')}结构入口。`;
  if (roles.length) return `${groupLabel}观察到${[...new Set(roles.map(role => role.tenGod))].join('、')}表层角色。`;
  return `${groupLabel}未观察到当前规则所需的已开放表层角色或结构入口。`;
}

function uniqueEvidence(evidence: BaziMonthDayPatternEvidence[]): BaziMonthDayPatternEvidence[] {
  return [...new Map(evidence.map(item => [item.id, item])).values()];
}

function isSurfaceRole(role: BaziDynamicTenGodRole): boolean {
  return role.sourceKind === 'surface_stem';
}

function layerLabel(layer: BaziDynamicTenGodRole['layer']): string {
  return ({ luck_cycle: '大运', annual: '流年', month: '流月', day: '流日' } as const)[layer];
}

function assertAlignedInputs(
  relation: BaziMonthDayRelationResult,
  visibility: BaziMonthDayVisibilityResult,
  strength: BaziMonthDayStrengthResult,
): void {
  if (relation.target.effectiveDate !== visibility.target.effectiveDate
    || relation.target.effectiveDate !== strength.target.effectiveDate) {
    throw new Error('M9-15、M9-16 与 M9-17 目标日期不一致');
  }
  if (relation.source.targetYear !== visibility.source.targetYear
    || relation.source.targetYear !== strength.source.targetYear) {
    throw new Error('M9-15、M9-16 与 M9-17 目标年份不一致');
  }
}
