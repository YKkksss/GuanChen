import type { BaziDynamicTenGodLayerSnapshot } from './dynamic-ten-god-types';
import type { BaziMonthDayTimelineStatus } from './month-day-timeline-types';
import type {
  BaziRelationConditionDecision,
  BaziRelationConflictCluster,
} from './relation-adjudication-types';
import type { BaziRelationEvidence } from './relation-audit-types';

export type BaziMonthDayRelationStatus =
  | 'complete'
  | 'partial_unknown_time'
  | 'sequence_only_unavailable';

export interface BaziMonthDayRelationMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'five_layer_dynamic_evidence_audit';
  label: string;
  policy: {
    layerPolicy: 'natal_luck_annual_month_day';
    datePolicy: 'one_version_per_effective_date';
    segmentPolicy: 'audit_each_exact_day_segment';
    evidencePolicy: 'reuse_m9_6_and_require_month_or_day_participant';
    conditionPolicy: 'structural_gate_and_coexistence_no_priority';
    tenGodPolicy: 'reuse_m9_8_day_master_mapping';
    hiddenStemPolicy: 'role_metadata_only_no_activation_claim';
    scoringPolicy: 'no_numeric_score_no_strength_or_fortune_weight';
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

export interface BaziMonthDayRelationSegment {
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
  layers: BaziDynamicTenGodLayerSnapshot[];
  evidence: BaziRelationEvidence[];
  decisions: BaziRelationConditionDecision[];
  conflicts: BaziRelationConflictCluster[];
  counts: {
    layers: number;
    roles: number;
    evidence: number;
    stemEvidence: number;
    branchEvidence: number;
    decisions: number;
    conflicts: number;
  };
}

export interface BaziMonthDayRelationResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziMonthDayRelationStatus;
  capabilities: {
    fiveLayerRelationEvidence: boolean;
    exactDaySegmentBoundary: boolean;
    dynamicTenGodRoles: boolean;
    conditionState: boolean;
    transformationVerdict: false;
    relationPriorityVerdict: false;
    hiddenStemActivationVerdict: false;
    strengthEffectVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartCompleteness: 'complete' | 'partial_unknown_time';
    monthDayTimelineMethodologyVersion: string;
    monthDayTimelineEngineVersion: string;
    monthDayTimelineStatus: BaziMonthDayTimelineStatus;
    targetYear: number;
    targetDate: string;
    lateZiPolicy: 'same_day' | 'next_day';
  };
  target: {
    effectiveDate: string;
    dayGanZhi: string | null;
    dayStartAt: string | null;
    dayEndAtExclusive: string | null;
    segmentCount: number;
  };
  segments: BaziMonthDayRelationSegment[];
  counts: {
    segments: number;
    roles: number;
    evidence: number;
    decisions: number;
    conflicts: number;
  };
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziMonthDayRelationVersion {
  id: string;
  chartVersionId: string;
  monthDayTimelineVersionId: string;
  targetDate: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  monthDayTimelineFingerprint: string;
  monthDayRelationFingerprint: string;
  result: BaziMonthDayRelationResult;
  createdAt: number;
  updatedAt: number;
}
