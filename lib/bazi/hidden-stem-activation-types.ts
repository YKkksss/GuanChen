import type { BaziDynamicTenGodSource, BaziTenGodName } from './dynamic-ten-god-types';
import type { BaziRelationAuditStatus, BaziRelationType } from './relation-audit-types';
import type { BaziRelationConditionState } from './relation-adjudication-types';
import type { BaziTenGodOccurrence } from './ten-god-repeat-types';

export type BaziHiddenStemTouchEntryType =
  | 'exact_dynamic_surface_same_stem'
  | 'same_branch_repeat'
  | 'explicit_branch_relation';

export type BaziHiddenStemTouchState = 'matched' | 'missing';
export type BaziHiddenStemTouchStatus =
  | 'multiple_touch_conditions'
  | 'single_touch_condition'
  | 'no_touch_condition';

export interface BaziHiddenStemActivationMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'hidden_stem_touch_condition_evidence_audit';
  label: string;
  policy: {
    upstreamPolicy: 'consume_versioned_relation_dynamic_repeat_and_transparency_evidence';
    surfacePolicy: 'exact_same_stem_dynamic_surface_in_same_segment';
    branchRepeatPolicy: 'same_branch_distinct_node_with_dynamic_participant';
    relationPolicy: 'explicit_branch_relation_evidence_with_adjudication_state';
    targetPolicy: 'audit_each_actual_hidden_stem_occurrence';
    crossLuckPolicy: 'audit_each_actual_timeline_segment';
    scoringPolicy: 'no_activation_strength_effect_or_fortune_verdict';
  };
  entryLabels: Record<BaziHiddenStemTouchEntryType, string>;
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziDynamicTenGodSource[];
}

export interface BaziHiddenStemRelationTouchEvidence {
  sourceEvidenceId: string;
  decisionId: string;
  relationType: BaziRelationType;
  relationLabel: string;
  conditionState: BaziRelationConditionState;
  conditionStateLabel: string;
  participantNodeIds: string[];
  participantLabels: string[];
  boundary: string;
}

export interface BaziHiddenStemTouchEntry {
  type: BaziHiddenStemTouchEntryType;
  label: string;
  state: BaziHiddenStemTouchState;
  evidenceOccurrenceIds: string[];
  sourceNodeIds: string[];
  repeatClusterId: string | null;
  transparencyCandidateId: string | null;
  relationEvidence: BaziHiddenStemRelationTouchEvidence[];
  detail: string;
  boundary: string;
}

export interface BaziHiddenStemTouchCandidate {
  id: string;
  hiddenOccurrence: BaziTenGodOccurrence;
  tenGod: BaziTenGodName;
  scope: 'month_command_hidden_stem' | 'general_hidden_stem';
  status: BaziHiddenStemTouchStatus;
  matchedEntryTypes: BaziHiddenStemTouchEntryType[];
  entries: BaziHiddenStemTouchEntry[];
  boundary: string;
}

export interface BaziHiddenStemActivationSegment {
  segmentIndex: number;
  startAt: string | null;
  endAtExclusive: string | null;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
  candidates: BaziHiddenStemTouchCandidate[];
  counts: {
    candidates: number;
    touchedCandidates: number;
    multipleTouchConditions: number;
    exactSurfaceMatches: number;
    sameBranchRepeats: number;
    explicitBranchRelations: number;
  };
  boundary: string;
}

export interface BaziHiddenStemActivationYear {
  year: number;
  annualGanZhi: string;
  segments: BaziHiddenStemActivationSegment[];
  counts: BaziHiddenStemActivationSegment['counts'];
  boundary: string;
}

export interface BaziHiddenStemActivationResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziRelationAuditStatus;
  capabilities: {
    hiddenStemTouchConditionAudit: true;
    exactDynamicSurfaceEntry: true;
    sameBranchRepeatEntry: true;
    explicitBranchRelationEntry: true;
    hiddenStemActivationVerdict: false;
    strengthEffectVerdict: false;
    targetEffectVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartCompleteness: 'complete' | 'partial_unknown_time';
    relationAuditMethodologyVersion: string;
    relationAuditEngineVersion: string;
    relationAdjudicationMethodologyVersion: string;
    relationAdjudicationEngineVersion: string;
    dynamicTenGodMethodologyVersion: string;
    dynamicTenGodEngineVersion: string;
    tenGodRepeatMethodologyVersion: string;
    tenGodRepeatEngineVersion: string;
    transparencyRootMethodologyVersion: string;
    transparencyRootEngineVersion: string;
  };
  range: {
    startYear: number;
    endYear: number;
    yearCount: number;
  };
  years: BaziHiddenStemActivationYear[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziHiddenStemActivationVersion {
  id: string;
  chartVersionId: string;
  relationAuditVersionId: string;
  relationAdjudicationVersionId: string;
  dynamicTenGodVersionId: string;
  tenGodRepeatVersionId: string;
  transparencyRootVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  relationAuditFingerprint: string;
  relationAdjudicationFingerprint: string;
  dynamicTenGodFingerprint: string;
  tenGodRepeatFingerprint: string;
  transparencyRootFingerprint: string;
  hiddenStemActivationFingerprint: string;
  result: BaziHiddenStemActivationResult;
  createdAt: number;
  updatedAt: number;
}
