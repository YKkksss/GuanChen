import type { BaziDynamicTenGodSource, BaziTenGodName } from './dynamic-ten-god-types';
import type { BaziRelationAuditStatus } from './relation-audit-types';
import type { BaziElement } from './types';
import type { BaziTenGodOccurrence } from './ten-god-repeat-types';

export type BaziTransparencyStatus = 'exact_surface_matched' | 'exact_surface_missing';
export type BaziRootStatus = 'exact_same_stem_root' | 'same_element_support_only' | 'hidden_support_missing';
export type BaziTransparencyScope = 'month_command_hidden_stem' | 'general_hidden_stem';
export type BaziTransparencyRootConditionState = 'met' | 'missing' | 'not_applicable';
export type BaziTransparencyRootConditionCode =
  | 'hidden_occurrence_present'
  | 'exact_surface_same_segment'
  | 'upstream_repeat_cluster'
  | 'surface_occurrence_present'
  | 'exact_hidden_same_segment'
  | 'same_element_hidden_same_segment'
  | 'same_node_exact_hidden';

export interface BaziTransparencyRootMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'transparency_root_condition_evidence_audit';
  label: string;
  policy: {
    upstreamPolicy: 'consume_versioned_repeat_clusters_and_dynamic_occurrences';
    transparencyPolicy: 'exact_hidden_stem_to_surface_stem_in_same_segment';
    monthCommandPolicy: 'label_natal_month_hidden_stem_separately';
    rootPolicy: 'separate_exact_same_stem_from_same_element_support';
    selfSeatPolicy: 'same_node_exact_hidden_only';
    dynamicPolicy: 'require_dynamic_occurrence_in_each_candidate';
    crossLuckPolicy: 'audit_each_actual_timeline_segment';
    scoringPolicy: 'no_strength_weight_no_fortune_verdict';
  };
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziDynamicTenGodSource[];
}

export interface BaziTransparencyRootConditionCheck {
  code: BaziTransparencyRootConditionCode;
  label: string;
  state: BaziTransparencyRootConditionState;
  evidenceOccurrenceIds: string[];
  detail: string;
}

export interface BaziTransparencyCandidate {
  id: string;
  stem: string;
  element: BaziElement;
  tenGod: BaziTenGodName;
  scope: BaziTransparencyScope;
  hiddenOccurrence: BaziTenGodOccurrence;
  surfaceMatches: BaziTenGodOccurrence[];
  status: BaziTransparencyStatus;
  repeatClusterId: string | null;
  conditionChecks: BaziTransparencyRootConditionCheck[];
  boundary: string;
}

export interface BaziRootCandidate {
  id: string;
  stem: string;
  element: BaziElement;
  tenGod: BaziTenGodName | null;
  surfaceOccurrence: BaziTenGodOccurrence;
  exactRootMatches: BaziTenGodOccurrence[];
  sameElementSupportMatches: BaziTenGodOccurrence[];
  status: BaziRootStatus;
  selfSeatExactRoot: boolean;
  repeatClusterId: string | null;
  conditionChecks: BaziTransparencyRootConditionCheck[];
  boundary: string;
}

export interface BaziTransparencyRootSegment {
  segmentIndex: number;
  startAt: string | null;
  endAtExclusive: string | null;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
  transparencyCandidates: BaziTransparencyCandidate[];
  rootCandidates: BaziRootCandidate[];
  counts: {
    transparencyMatched: number;
    transparencyMissing: number;
    monthCommandMatched: number;
    exactSameStemRoots: number;
    sameElementSupportOnly: number;
    hiddenSupportMissing: number;
    selfSeatExactRoots: number;
  };
  boundary: string;
}

export interface BaziTransparencyRootYear {
  year: number;
  annualGanZhi: string;
  segments: BaziTransparencyRootSegment[];
  counts: BaziTransparencyRootSegment['counts'];
  boundary: string;
}

export interface BaziTransparencyRootResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziRelationAuditStatus;
  capabilities: {
    transparencyConditionAudit: true;
    strictSameStemRootAudit: true;
    sameElementSupportSeparation: true;
    selfSeatLocationAudit: true;
    transparencyEffectVerdict: false;
    rootStrengthVerdict: false;
    hiddenStemActivationVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartCompleteness: 'complete' | 'partial_unknown_time';
    dynamicTenGodMethodologyVersion: string;
    dynamicTenGodEngineVersion: string;
    tenGodRepeatMethodologyVersion: string;
    tenGodRepeatEngineVersion: string;
  };
  dayMaster: {
    stem: string;
    element: BaziElement;
  };
  range: {
    startYear: number;
    endYear: number;
    yearCount: number;
  };
  years: BaziTransparencyRootYear[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziTransparencyRootVersion {
  id: string;
  chartVersionId: string;
  dynamicTenGodVersionId: string;
  tenGodRepeatVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  dynamicTenGodFingerprint: string;
  tenGodRepeatFingerprint: string;
  transparencyRootFingerprint: string;
  result: BaziTransparencyRootResult;
  createdAt: number;
  updatedAt: number;
}
