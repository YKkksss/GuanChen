import type { BaziTenGodName } from './dynamic-ten-god-types';
import type { BaziRelationRole, BaziStrengthAssessment } from './interpretation-types';
import type { BaziMonthDayRelationStatus } from './month-day-relation-types';
import type {
  BaziDynamicSurfaceDirection,
  BaziStrengthCompositeComparison,
  BaziStrengthCompositeSide,
} from './strength-composite-types';

export type BaziMonthDayStrengthStatus = BaziMonthDayRelationStatus;
export type BaziMonthDayStrengthFamily =
  | 'static_baseline'
  | 'inherited_dynamic_surface'
  | 'month_day_surface'
  | 'month_day_hidden_position'
  | 'day_master_root_condition'
  | 'month_command_touch'
  | 'hidden_stem_touch_context';
export type BaziMonthDayStrengthEvidenceStatus =
  | 'upstream_label'
  | 'established'
  | 'position_only'
  | 'condition_only';
export type BaziMonthDayFocusComparison =
  | 'focus_same_as_inherited'
  | 'focus_different_from_inherited'
  | 'focus_surface_mixed'
  | 'inherited_surface_mixed'
  | 'focus_surface_absent'
  | 'inherited_surface_absent'
  | 'partial_unknown_time';
export type BaziMonthDayStrengthReviewFlag =
  | 'unknown_time'
  | 'focus_surface_mixed'
  | 'inherited_surface_mixed'
  | 'focus_inherited_direction_difference'
  | 'month_command_touch_present'
  | 'day_master_root_condition_present'
  | 'hidden_touch_context_present';

export interface BaziMonthDayStrengthMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'month_day_strength_composite_evidence_audit';
  label: string;
  policy: {
    upstreamPolicy: 'consume_versioned_m9_3_m9_15_m9_16_evidence';
    staticPolicy: 'preserve_m9_3_baseline_without_reclassification';
    surfacePolicy: 'separate_inherited_and_month_day_visible_directions';
    hiddenPolicy: 'position_or_touch_context_only_no_strength_effect';
    rootPolicy: 'm9_16_day_master_root_condition_only';
    monthCommandPolicy: 'm9_16_touch_context_without_effect_verdict';
    comparisonPolicy: 'direction_comparison_not_final_strength';
    segmentPolicy: 'audit_each_exact_day_segment_independently';
    scoringPolicy: 'no_numeric_score_weight_or_final_strength';
  };
  familyLabels: Record<BaziMonthDayStrengthFamily, string>;
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

export interface BaziMonthDayStrengthEvidence {
  id: string;
  family: BaziMonthDayStrengthFamily;
  familyLabel: string;
  side: BaziStrengthCompositeSide;
  roleSide: Exclude<BaziStrengthCompositeSide, 'context'> | null;
  status: BaziMonthDayStrengthEvidenceStatus;
  label: string;
  detail: string;
  sourceStage: 'M9-3' | 'M9-15' | 'M9-16';
  sourceIds: string[];
  tenGod: BaziTenGodName | null;
  boundary: string;
}

export interface BaziMonthDayStrengthMonthCommand {
  branch: string;
  mainQiStem: string;
  relation: BaziRelationRole;
  staticAssessment: BaziStrengthAssessment;
  staticAssessmentLabel: string;
  touchStatus: 'multiple_touch_types' | 'single_touch_type' | 'no_open_touch_condition';
  touchTypes: Array<'exact_dynamic_surface_same_stem' | 'same_branch_repeat' | 'explicit_branch_relation'>;
  touchedHiddenOccurrenceIds: string[];
  relationConditionStates: string[];
  boundary: string;
}

export interface BaziMonthDayStrengthSegment {
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
  monthCommand: BaziMonthDayStrengthMonthCommand;
  inheritedSurfaceDirection: BaziDynamicSurfaceDirection;
  inheritedSurfaceDirectionLabel: string;
  focusSurfaceDirection: BaziDynamicSurfaceDirection;
  focusSurfaceDirectionLabel: string;
  combinedSurfaceDirection: BaziDynamicSurfaceDirection;
  combinedSurfaceDirectionLabel: string;
  focusComparison: BaziMonthDayFocusComparison;
  focusComparisonLabel: string;
  staticComparison: BaziStrengthCompositeComparison;
  staticComparisonLabel: string;
  reviewFlags: BaziMonthDayStrengthReviewFlag[];
  evidence: BaziMonthDayStrengthEvidence[];
  counts: {
    supportEvidence: number;
    drainOrControlEvidence: number;
    contextEvidence: number;
    inheritedSurfaceEvidence: number;
    focusSurfaceEvidence: number;
    conditionOnlyEvidence: number;
    positionOnlyEvidence: number;
  };
  boundary: string;
}

export interface BaziMonthDayStrengthResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziMonthDayStrengthStatus;
  capabilities: {
    inheritedAndFocusSurfaceSeparation: boolean;
    fiveLayerDirectionComparison: boolean;
    monthCommandTouchReview: boolean;
    dayMasterRootConditionReview: boolean;
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
    monthDayRelationMethodologyVersion: string;
    monthDayRelationEngineVersion: string;
    monthDayVisibilityMethodologyVersion: string;
    monthDayVisibilityEngineVersion: string;
    targetYear: number;
    targetDate: string;
    lateZiPolicy: 'same_day' | 'next_day';
  };
  staticBaseline: {
    assessment: BaziStrengthAssessment;
    label: string;
    confidence: 'low' | 'medium';
    boundary: string;
  };
  target: {
    effectiveDate: string;
    dayGanZhi: string | null;
    segmentCount: number;
  };
  segments: BaziMonthDayStrengthSegment[];
  comparisonLabels: string[];
  reviewFlags: BaziMonthDayStrengthReviewFlag[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziMonthDayStrengthVersion {
  id: string;
  chartVersionId: string;
  analysisVersionId: string;
  monthDayRelationVersionId: string;
  monthDayVisibilityVersionId: string;
  targetDate: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  analysisFingerprint: string;
  monthDayRelationFingerprint: string;
  monthDayVisibilityFingerprint: string;
  monthDayStrengthFingerprint: string;
  result: BaziMonthDayStrengthResult;
  createdAt: number;
  updatedAt: number;
}
