import type { BaziTenGodName } from './dynamic-ten-god-types';
import type { BaziPatternRuleMatchMode } from './pattern-condition-engine';
import type {
  BaziPatternArchetype,
  BaziPatternConditionCheck,
  BaziPatternConditionKind,
  BaziPatternConditionStatus,
} from './pattern-condition-types';
import type { BaziRelationLayer } from './relation-audit-types';
import type { BaziMonthDayRelationStatus } from './month-day-relation-types';

export type BaziMonthDayPatternStatus = BaziMonthDayRelationStatus;
export type BaziMonthDayPatternSourceGroup =
  | 'static_condition'
  | 'inherited_surface'
  | 'month_day_surface'
  | 'month_day_relation_context'
  | 'hidden_position_context'
  | 'hidden_touch_context'
  | 'strength_direction_context';
export type BaziMonthDayPatternEvidenceVisibility = 'surface' | 'hidden' | 'structural' | 'context';
export type BaziMonthDayPatternCoverageGroup = 'inherited_surface' | 'month_day_surface' | 'combined_surface';
export type BaziMonthDayPatternCoverageStatus =
  | 'required_role_groups_observed'
  | 'partial_role_groups_observed'
  | 'no_required_surface_role_observed'
  | 'structural_entry_observed'
  | 'structural_entry_not_observed'
  | 'absence_rule_not_reclassified'
  | 'upstream_context_only'
  | 'partial_unknown_time';
export type BaziMonthDayPatternReviewFlag =
  | 'unknown_time'
  | 'focus_condition_entry_present'
  | 'combined_only_role_coverage'
  | 'partial_role_coverage'
  | 'hidden_context_present'
  | 'relation_context_present'
  | 'static_risk_present'
  | 'rescue_link_unresolved'
  | 'strength_context_not_final';

export interface BaziMonthDayPatternMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'month_day_pattern_condition_mapping_audit';
  label: string;
  policy: {
    upstreamPolicy: 'consume_versioned_m9_13_m9_15_m9_16_m9_17_evidence';
    candidatePolicy: 'preserve_m9_13_candidates_checks_and_static_statuses';
    layerPolicy: 'separate_static_inherited_and_month_day_condition_entries';
    rolePolicy: 'visible_surface_role_coverage_without_weight';
    hiddenPolicy: 'm9_16_position_or_touch_context_only';
    relationPolicy: 'm9_15_explicit_relation_entry_without_effect_verdict';
    strengthPolicy: 'm9_17_direction_context_without_pattern_verdict';
    segmentPolicy: 'audit_each_exact_day_segment_independently';
    verdictPolicy: 'mapping_only_no_pattern_success_failure_or_rescue_completion';
    scoringPolicy: 'counts_for_traceability_only_no_pattern_score';
  };
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: Array<{
    id: string;
    title: string;
    type: 'project_methodology';
    note: string;
  }>;
}

export interface BaziMonthDayPatternEvidence {
  id: string;
  sourceGroup: BaziMonthDayPatternSourceGroup;
  visibility: BaziMonthDayPatternEvidenceVisibility;
  layer: BaziRelationLayer | null;
  label: string;
  detail: string;
  stem: string | null;
  branch: string | null;
  tenGod: BaziTenGodName | null;
  sourceStage: 'M9-3' | 'M9-12' | 'M9-13' | 'M9-15' | 'M9-16' | 'M9-17';
  sourceIds: string[];
  boundary: string;
}

export interface BaziMonthDayPatternCoverage {
  group: BaziMonthDayPatternCoverageGroup;
  status: BaziMonthDayPatternCoverageStatus;
  statusLabel: string;
  observedRoleGroups: BaziTenGodName[][];
  missingRoleGroups: BaziTenGodName[][];
  evidence: BaziMonthDayPatternEvidence[];
  detail: string;
  boundary: string;
}

export interface BaziMonthDayPatternCheckMapping {
  id: string;
  ruleId: string;
  kind: BaziPatternConditionKind;
  label: string;
  matchMode: BaziPatternRuleMatchMode;
  requiredRoles: BaziTenGodName[];
  roleGroups: BaziTenGodName[][];
  linkedBreakingRuleIds: string[];
  staticStatus: BaziPatternConditionStatus;
  staticStatusLabel: string;
  staticDetail: string;
  staticEvidence: BaziMonthDayPatternEvidence[];
  inheritedCoverage: BaziMonthDayPatternCoverage;
  focusCoverage: BaziMonthDayPatternCoverage;
  combinedCoverage: BaziMonthDayPatternCoverage;
  relationContext: BaziMonthDayPatternEvidence[];
  hiddenContext: BaziMonthDayPatternEvidence[];
  reviewFlags: BaziMonthDayPatternReviewFlag[];
  conclusion: 'mapping_only_no_condition_or_pattern_verdict';
  boundary: string;
}

export interface BaziMonthDayPatternCandidateMapping {
  candidateId: string;
  label: string;
  tenGod: BaziTenGodName;
  archetype: BaziPatternArchetype;
  archetypeLabel: string;
  sourceStem: string;
  sourceQi: 'main_qi' | 'secondary_qi' | 'residual_qi';
  upstreamStatus: string;
  formationSupport: BaziMonthDayPatternCheckMapping[];
  breakingRisks: BaziMonthDayPatternCheckMapping[];
  rescueCandidates: BaziMonthDayPatternCheckMapping[];
  reviewFlags: BaziMonthDayPatternReviewFlag[];
  counts: {
    staticChecks: number;
    inheritedEntries: number;
    focusEntries: number;
    combinedCompleteCoverage: number;
    relationContexts: number;
    hiddenContexts: number;
  };
  boundary: string;
}

export interface BaziMonthDayPatternSegment {
  segmentIndex: number;
  startAt: string;
  endAtExclusive: string;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  annualYear: number;
  annualGanZhi: string;
  monthIndex: number;
  monthGanZhi: string;
  dayGanZhi: string;
  label: string;
  strengthContext: {
    staticLabel: string;
    inheritedDirectionLabel: string;
    focusDirectionLabel: string;
    combinedDirectionLabel: string;
    focusComparisonLabel: string;
    boundary: string;
  };
  candidates: BaziMonthDayPatternCandidateMapping[];
  reviewFlags: BaziMonthDayPatternReviewFlag[];
  counts: {
    candidates: number;
    checks: number;
    inheritedEntries: number;
    focusEntries: number;
    relationContexts: number;
    hiddenContexts: number;
  };
  boundary: string;
}

export interface BaziMonthDayPatternResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziMonthDayPatternStatus;
  capabilities: {
    staticInheritedFocusSeparation: boolean;
    dynamicRoleCoverageMapping: boolean;
    monthDayRelationContextMapping: boolean;
    hiddenPositionTouchContextMapping: boolean;
    strengthDirectionContext: boolean;
    finalPatternSuccessFailure: false;
    rescueCompletionVerdict: false;
    patternScore: false;
    usefulGodVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartCompleteness: 'complete' | 'partial_unknown_time';
    patternConditionMethodologyVersion: string;
    patternConditionEngineVersion: string;
    monthDayRelationMethodologyVersion: string;
    monthDayRelationEngineVersion: string;
    monthDayVisibilityMethodologyVersion: string;
    monthDayVisibilityEngineVersion: string;
    monthDayStrengthMethodologyVersion: string;
    monthDayStrengthEngineVersion: string;
    targetYear: number;
    targetDate: string;
    lateZiPolicy: 'same_day' | 'next_day';
  };
  target: {
    effectiveDate: string;
    dayGanZhi: string | null;
    segmentCount: number;
  };
  segments: BaziMonthDayPatternSegment[];
  reviewFlags: BaziMonthDayPatternReviewFlag[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziMonthDayPatternVersion {
  id: string;
  chartVersionId: string;
  patternConditionVersionId: string;
  monthDayRelationVersionId: string;
  monthDayVisibilityVersionId: string;
  monthDayStrengthVersionId: string;
  targetDate: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  patternConditionFingerprint: string;
  monthDayRelationFingerprint: string;
  monthDayVisibilityFingerprint: string;
  monthDayStrengthFingerprint: string;
  monthDayPatternFingerprint: string;
  result: BaziMonthDayPatternResult;
  createdAt: number;
  updatedAt: number;
}

export type BaziMonthDayPatternStaticCheck = BaziPatternConditionCheck;
