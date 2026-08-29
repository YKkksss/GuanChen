import type { BaziTenGodName } from './dynamic-ten-god-types';
import type { BaziPatternStatus, BaziStrengthAssessment } from './interpretation-types';

export type BaziPatternArchetype =
  | 'direct_officer'
  | 'wealth'
  | 'seal'
  | 'food_god'
  | 'seven_killings'
  | 'hurting_officer'
  | 'yang_blade'
  | 'build_prosperity'
  | 'month_robbery';

export type BaziPatternConditionKind = 'formation_support' | 'breaking_risk' | 'rescue_candidate';
export type BaziPatternConditionStatus =
  | 'evidence_present'
  | 'not_observed'
  | 'requires_manual_review'
  | 'unknown_due_to_missing_time'
  | 'not_applicable';
export type BaziPatternEvidenceVisibility = 'surface' | 'hidden' | 'structural' | 'upstream_context';
export type BaziPatternReviewFlag =
  | 'unknown_time'
  | 'storage_month'
  | 'multiple_month_candidates'
  | 'upstream_candidate_review_required'
  | 'month_branch_interaction'
  | 'strength_context_not_final'
  | 'hidden_role_not_surface'
  | 'combination_effect_unresolved'
  | 'yang_blade_variant'
  | 'metal_water_hurting_officer_exception_pending';

export interface BaziPatternConditionSource {
  id: string;
  title: string;
  type: 'classical_text' | 'project_methodology';
  url?: string;
  note: string;
}

export interface BaziPatternConditionMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'pattern_formation_breaking_rescue_condition_evidence_audit';
  label: string;
  policy: {
    upstreamPolicy: 'consume_versioned_m9_3_candidate_and_m9_12_static_baseline';
    candidatePolicy: 'preserve_every_month_command_candidate_without_ranking';
    layerPolicy: 'natal_chart_only';
    visibilityPolicy: 'separate_surface_hidden_structural_and_upstream_context';
    rescuePolicy: 'link_rescue_candidate_to_observed_or_unresolved_breaking_risk';
    combinationPolicy: 'position_condition_only_no_resolution_verdict';
    unknownTimePolicy: 'mark_absence_dependent_checks_unknown';
    verdictPolicy: 'condition_evidence_only_no_pattern_success_failure';
    scoringPolicy: 'counts_for_traceability_only_no_pattern_score';
  };
  archetypeLabels: Record<BaziPatternArchetype, string>;
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziPatternConditionSource[];
}

export interface BaziPatternConditionEvidence {
  id: string;
  visibility: BaziPatternEvidenceVisibility;
  label: string;
  detail: string;
  pillarKey: 'year' | 'month' | 'day' | 'time' | null;
  stem: string | null;
  branch: string | null;
  tenGod: BaziTenGodName | null;
  sourceStage: 'M9-3' | 'M9-12' | 'M9-13';
}

export interface BaziPatternConditionCheck {
  id: string;
  ruleId: string;
  kind: BaziPatternConditionKind;
  label: string;
  status: BaziPatternConditionStatus;
  statusLabel: string;
  detail: string;
  requiredRoles: BaziTenGodName[];
  evidence: BaziPatternConditionEvidence[];
  linkedBreakingRuleIds: string[];
  boundary: string;
}

export interface BaziPatternCandidateConditionAudit {
  id: string;
  label: string;
  tenGod: BaziTenGodName;
  archetype: BaziPatternArchetype;
  archetypeLabel: string;
  sourceStem: string;
  sourceQi: 'main_qi' | 'secondary_qi' | 'residual_qi';
  transparentAt: string[];
  upstreamStatus: BaziPatternStatus;
  formationSupport: BaziPatternConditionCheck[];
  breakingRisks: BaziPatternConditionCheck[];
  rescueCandidates: BaziPatternConditionCheck[];
  reviewFlags: BaziPatternReviewFlag[];
  counts: {
    formationEvidencePresent: number;
    breakingRiskEvidencePresent: number;
    rescueEvidencePresent: number;
    manualReview: number;
    notObserved: number;
    unknown: number;
  };
  conclusion: 'condition_matrix_only_no_success_failure_verdict';
  boundary: string;
}

export interface BaziPatternConditionResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: 'complete' | 'partial_unknown_time';
  capabilities: {
    formationConditionEvidence: true;
    breakingRiskEvidence: true;
    rescueCandidateEvidence: true;
    visibilitySeparation: true;
    finalPatternSuccessFailure: false;
    patternRank: false;
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
    strengthCompositeMethodologyVersion: string;
    strengthCompositeEngineVersion: string;
  };
  monthCommand: {
    branch: string;
    isStorageMonth: boolean;
    candidateCount: number;
    interactionCount: number;
  };
  strengthContext: {
    assessment: BaziStrengthAssessment;
    label: string;
    boundary: string;
  };
  candidates: BaziPatternCandidateConditionAudit[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziPatternConditionVersion {
  id: string;
  chartVersionId: string;
  analysisVersionId: string;
  strengthCompositeVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  analysisFingerprint: string;
  strengthCompositeFingerprint: string;
  patternConditionFingerprint: string;
  result: BaziPatternConditionResult;
  createdAt: number;
  updatedAt: number;
}
