import type { BaziHiddenStemActivationSegment } from './hidden-stem-activation-types';
import type { BaziMonthDayRelationStatus } from './month-day-relation-types';
import type { BaziTenGodRepeatSegment } from './ten-god-repeat-types';
import type { BaziTransparencyRootSegment } from './transparency-root-types';

export type BaziMonthDayVisibilityStatus = BaziMonthDayRelationStatus;

export interface BaziMonthDayVisibilityMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'month_day_visibility_root_touch_condition_audit';
  label: string;
  policy: {
    upstreamPolicy: 'consume_versioned_m9_15_exact_day_segments';
    focusPolicy: 'require_month_or_day_participant_in_each_output';
    repeatPolicy: 'reuse_m9_9_same_stem_and_same_ten_god_clusters';
    transparencyRootPolicy: 'reuse_m9_10_exact_stem_and_same_element_separation';
    hiddenTouchPolicy: 'reuse_m9_11_three_touch_entries';
    segmentPolicy: 'audit_each_exact_day_segment_independently';
    scoringPolicy: 'counts_only_no_strength_fortune_or_event_weight';
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

export interface BaziMonthDayVisibilitySegment {
  segmentIndex: number;
  startAt: string;
  endAtExclusive: string;
  annualYear: number;
  annualGanZhi: string;
  monthIndex: number;
  monthGanZhi: string;
  dayGanZhi: string;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
  repeatAudit: BaziTenGodRepeatSegment;
  transparencyRootAudit: BaziTransparencyRootSegment;
  hiddenStemTouchAudit: BaziHiddenStemActivationSegment;
  counts: {
    stemClusters: number;
    tenGodClusters: number;
    transparencyMatched: number;
    exactSameStemRoots: number;
    sameElementSupportOnly: number;
    touchedHiddenStems: number;
    multipleTouchConditions: number;
  };
  boundary: string;
}

export interface BaziMonthDayVisibilityResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziMonthDayVisibilityStatus;
  capabilities: {
    monthDayRepeatAudit: boolean;
    monthDayTransparencyAudit: boolean;
    monthDayRootConditionAudit: boolean;
    monthDayHiddenStemTouchAudit: boolean;
    exactDaySegmentBoundary: boolean;
    transparencyEffectVerdict: false;
    rootStrengthVerdict: false;
    hiddenStemActivationVerdict: false;
    strengthEffectVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartCompleteness: 'complete' | 'partial_unknown_time';
    monthDayRelationMethodologyVersion: string;
    monthDayRelationEngineVersion: string;
    monthDayRelationStatus: BaziMonthDayRelationStatus;
    targetYear: number;
    targetDate: string;
    lateZiPolicy: 'same_day' | 'next_day';
  };
  target: {
    effectiveDate: string;
    dayGanZhi: string | null;
    segmentCount: number;
  };
  segments: BaziMonthDayVisibilitySegment[];
  counts: {
    segments: number;
    stemClusters: number;
    tenGodClusters: number;
    transparencyMatched: number;
    exactSameStemRoots: number;
    sameElementSupportOnly: number;
    touchedHiddenStems: number;
    multipleTouchConditions: number;
  };
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziMonthDayVisibilityVersion {
  id: string;
  chartVersionId: string;
  monthDayRelationVersionId: string;
  targetDate: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  monthDayRelationFingerprint: string;
  monthDayVisibilityFingerprint: string;
  result: BaziMonthDayVisibilityResult;
  createdAt: number;
  updatedAt: number;
}
