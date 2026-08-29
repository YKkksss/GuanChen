import type { BaziDynamicTenGodSource, BaziTenGodName } from './dynamic-ten-god-types';
import type { BaziRelationAuditStatus } from './relation-audit-types';
import type { BaziRelationRole, BaziStrengthAssessment } from './interpretation-types';

export type BaziStrengthCompositeSide = 'support' | 'drain_or_control' | 'context';
export type BaziStrengthCompositeFamily =
  | 'month_command_baseline'
  | 'natal_root'
  | 'natal_surface'
  | 'dynamic_surface'
  | 'dynamic_hidden_position'
  | 'day_master_root_condition'
  | 'month_command_touch';
export type BaziStrengthCompositeEvidenceStatus =
  | 'upstream_label'
  | 'established'
  | 'position_only'
  | 'condition_only';
export type BaziDynamicSurfaceDirection = 'support_only' | 'drain_only' | 'both_sides' | 'none';
export type BaziStrengthCompositeComparison =
  | 'static_dynamic_same_direction'
  | 'static_dynamic_different_directions'
  | 'static_baseline_mixed'
  | 'dynamic_surface_mixed'
  | 'partial_unknown_time'
  | 'dynamic_surface_absent';
export type BaziMonthCommandTouchStatus =
  | 'multiple_touch_types'
  | 'single_touch_type'
  | 'no_open_touch_condition';
export type BaziStrengthCompositeReviewFlag =
  | 'unknown_time'
  | 'static_dynamic_direction_difference'
  | 'static_baseline_mixed'
  | 'dynamic_surface_mixed'
  | 'month_command_touch_present'
  | 'month_command_relation_state_unresolved'
  | 'day_master_root_condition_present'
  | 'dynamic_hidden_position_only';

export interface BaziStrengthCompositeMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'month_command_strength_composite_evidence_audit_v2';
  label: string;
  policy: {
    upstreamPolicy: 'consume_versioned_m9_3_and_m9_8_to_m9_11_evidence';
    baselinePolicy: 'preserve_static_assessment_without_reclassification';
    dynamicSurfacePolicy: 'classify_visible_ten_god_direction_without_weight';
    hiddenPolicy: 'position_or_touch_condition_only_no_activation';
    monthCommandPolicy: 'preserve_touch_types_and_relation_states_without_strength_effect';
    rootPolicy: 'day_master_root_condition_only_no_strength_grade';
    comparisonPolicy: 'direction_comparison_not_final_strength';
    crossLuckPolicy: 'audit_each_actual_timeline_segment';
    scoringPolicy: 'counts_for_traceability_only_no_numeric_strength_score';
  };
  familyLabels: Record<BaziStrengthCompositeFamily, string>;
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziDynamicTenGodSource[];
}

export interface BaziStrengthCompositeEvidence {
  id: string;
  family: BaziStrengthCompositeFamily;
  familyLabel: string;
  side: BaziStrengthCompositeSide;
  roleSide: Exclude<BaziStrengthCompositeSide, 'context'> | null;
  status: BaziStrengthCompositeEvidenceStatus;
  label: string;
  detail: string;
  sourceStage: 'M9-3' | 'M9-8' | 'M9-10' | 'M9-11';
  sourceIds: string[];
  tenGod: BaziTenGodName | null;
  boundary: string;
}

export interface BaziMonthCommandComposite {
  branch: string;
  mainQiStem: string;
  relation: BaziRelationRole;
  staticAssessment: BaziStrengthAssessment;
  staticAssessmentLabel: string;
  touchStatus: BaziMonthCommandTouchStatus;
  touchTypes: Array<'exact_dynamic_surface_same_stem' | 'same_branch_repeat' | 'explicit_branch_relation'>;
  touchedHiddenOccurrenceIds: string[];
  relationConditionStates: string[];
  boundary: string;
}

export interface BaziStrengthCompositeSegment {
  segmentIndex: number;
  startAt: string | null;
  endAtExclusive: string | null;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
  monthCommand: BaziMonthCommandComposite;
  dynamicSurfaceDirection: BaziDynamicSurfaceDirection;
  dynamicSurfaceDirectionLabel: string;
  comparison: BaziStrengthCompositeComparison;
  comparisonLabel: string;
  reviewFlags: BaziStrengthCompositeReviewFlag[];
  evidence: BaziStrengthCompositeEvidence[];
  counts: {
    supportEvidence: number;
    drainOrControlEvidence: number;
    contextEvidence: number;
    establishedEvidence: number;
    conditionOnlyEvidence: number;
    positionOnlyEvidence: number;
  };
  boundary: string;
}

export interface BaziStrengthCompositeYear {
  year: number;
  annualGanZhi: string;
  segments: BaziStrengthCompositeSegment[];
  comparisonLabels: string[];
  reviewFlags: BaziStrengthCompositeReviewFlag[];
  boundary: string;
}

export interface BaziStrengthCompositeResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziRelationAuditStatus;
  capabilities: {
    staticDynamicEvidenceMatrix: true;
    monthCommandTouchReview: true;
    dynamicSurfaceDirectionComparison: true;
    dayMasterRootConditionReview: true;
    finalStrengthVerdict: false;
    strengthScore: false;
    usefulGodVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartCompleteness: 'complete' | 'partial_unknown_time';
    interpretationMethodologyVersion: string;
    interpretationEngineVersion: string;
    dynamicTenGodMethodologyVersion: string;
    dynamicTenGodEngineVersion: string;
    transparencyRootMethodologyVersion: string;
    transparencyRootEngineVersion: string;
    hiddenStemActivationMethodologyVersion: string;
    hiddenStemActivationEngineVersion: string;
  };
  staticBaseline: {
    assessment: BaziStrengthAssessment;
    label: string;
    confidence: 'low' | 'medium';
    boundary: string;
  };
  range: {
    startYear: number;
    endYear: number;
    yearCount: number;
  };
  years: BaziStrengthCompositeYear[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziStrengthCompositeVersion {
  id: string;
  chartVersionId: string;
  analysisVersionId: string;
  dynamicTenGodVersionId: string;
  transparencyRootVersionId: string;
  hiddenStemActivationVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  analysisFingerprint: string;
  dynamicTenGodFingerprint: string;
  transparencyRootFingerprint: string;
  hiddenStemActivationFingerprint: string;
  strengthCompositeFingerprint: string;
  result: BaziStrengthCompositeResult;
  createdAt: number;
  updatedAt: number;
}
