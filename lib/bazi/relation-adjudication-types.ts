import type { BaziElement } from './types';
import type {
  BaziRelationAuditStatus,
  BaziRelationDomain,
  BaziRelationParticipant,
  BaziRelationScope,
  BaziRelationType,
} from './relation-audit-types';

export type BaziRelationConditionState =
  | 'conditions_met'
  | 'conditions_missing'
  | 'relations_coexist'
  | 'deferred_adjudication';

export type BaziRelationConditionCheckResult =
  | 'met'
  | 'missing'
  | 'conflict'
  | 'deferred'
  | 'not_applicable';

export type BaziRelationConditionCheckCode =
  | 'structural_membership'
  | 'same_timeline_segment'
  | 'month_support'
  | 'competing_stem_absence'
  | 'natal_position'
  | 'coexisting_relation';

export interface BaziRelationAdjudicationSource {
  id: string;
  title: string;
  type: 'classical_text' | 'project_methodology';
  url?: string;
  note: string;
}

export interface BaziRelationAdjudicationMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'condition_conflict_audit';
  label: string;
  policy: {
    upstreamPolicy: 'consume_versioned_relation_evidence';
    partialSetPolicy: 'record_two_of_three_as_missing_condition';
    transformationPolicy: 'review_gate_only_no_transformation_verdict';
    conflictPolicy: 'coexistence_without_priority_verdict';
    positionPolicy: 'record_natal_adjacency_without_strength_weight';
    scoringPolicy: 'no_numeric_score_no_fortune_weight';
    crossLuckPolicy: 'adjudicate_each_actual_timeline_segment';
  };
  stemTransformationGates: Array<{
    pair: string;
    targetElement: BaziElement;
    supportingMonths: string[];
    competingStem: string;
  }>;
  threeMemberSets: Record<string, string[]>;
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziRelationAdjudicationSource[];
}

export interface BaziRelationConditionCheck {
  code: BaziRelationConditionCheckCode;
  label: string;
  result: BaziRelationConditionCheckResult;
  detail: string;
  ruleId: string;
}

export interface BaziRelationConditionDecision {
  id: string;
  sourceEvidenceId: string | null;
  domain: BaziRelationDomain;
  type: BaziRelationType;
  scope: BaziRelationScope;
  label: string;
  participants: BaziRelationParticipant[];
  targetElement: BaziElement | null;
  state: BaziRelationConditionState;
  stateLabel: string;
  missingSymbols: string[];
  checks: BaziRelationConditionCheck[];
  coexistingEvidenceIds: string[];
  boundary: string;
}

export interface BaziRelationConflictCluster {
  id: string;
  participant: BaziRelationParticipant;
  evidenceIds: string[];
  relationTypes: BaziRelationType[];
  label: string;
  detail: string;
  conclusion: 'relations_coexist_no_priority';
}

export interface BaziRelationAdjudicationSegment {
  segmentIndex: number;
  startAt: string | null;
  endAtExclusive: string | null;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
  decisions: BaziRelationConditionDecision[];
  conflicts: BaziRelationConflictCluster[];
  counts: {
    conditionsMet: number;
    conditionsMissing: number;
    relationsCoexist: number;
    deferredAdjudication: number;
    total: number;
  };
}

export interface BaziRelationAdjudicationYear {
  year: number;
  annualGanZhi: string;
  segments: BaziRelationAdjudicationSegment[];
  decisionCount: number;
  conflictCount: number;
  boundary: string;
}

export interface BaziRelationAdjudicationResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziRelationAuditStatus;
  capabilities: {
    conditionAudit: true;
    partialSetCandidates: true;
    conflictCoexistence: true;
    transformationVerdict: false;
    relationPriorityVerdict: false;
    strengthEffectVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    relationAuditMethodologyVersion: string;
    relationAuditEngineVersion: string;
    relationAuditStatus: BaziRelationAuditStatus;
  };
  range: {
    startYear: number;
    endYear: number;
    yearCount: number;
  };
  years: BaziRelationAdjudicationYear[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziRelationAdjudicationVersion {
  id: string;
  chartVersionId: string;
  relationAuditVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  relationAuditFingerprint: string;
  relationAdjudicationFingerprint: string;
  result: BaziRelationAdjudicationResult;
  createdAt: number;
  updatedAt: number;
}
