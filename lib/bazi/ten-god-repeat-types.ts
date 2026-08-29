import type {
  BaziDynamicTenGodSource,
  BaziHiddenQiGrade,
  BaziTenGodName,
} from './dynamic-ten-god-types';
import type {
  BaziRelationAuditStatus,
  BaziRelationLayer,
  BaziRelationScope,
  BaziRelationType,
} from './relation-audit-types';
import type { BaziPillarKey } from './types';

export type BaziTenGodOccurrenceKind =
  | 'surface_stem'
  | 'branch_hidden_stem'
  | 'day_master_reference';

export type BaziTenGodVisibility = 'surface' | 'hidden' | 'reference';

export type BaziTenGodRepeatPattern =
  | 'surface_cross_layer_repeat'
  | 'surface_hidden_coexistence'
  | 'hidden_cross_layer_repeat'
  | 'annual_luck_repeat';

export interface BaziTenGodRepeatMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'ten_god_visibility_repeat_evidence_audit';
  label: string;
  policy: {
    upstreamPolicy: 'consume_versioned_dynamic_ten_god_and_relation_evidence';
    occurrencePolicy: 'preserve_surface_hidden_and_day_master_reference';
    clusterPolicy: 'require_dynamic_occurrence_and_at_least_two_occurrences';
    visibilityPolicy: 'coexistence_only_no_transparency_or_root_verdict';
    connectionPolicy: 'exact_surface_participants_from_relation_evidence_only';
    crossLuckPolicy: 'audit_each_actual_timeline_segment';
    scoringPolicy: 'counts_only_no_strength_or_fortune_weight';
  };
  repeatPatterns: Record<BaziTenGodRepeatPattern, string>;
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziDynamicTenGodSource[];
}

export interface BaziTenGodOccurrence {
  id: string;
  nodeId: string;
  layer: BaziRelationLayer;
  label: string;
  pillarKey: BaziPillarKey | null;
  sourceKind: BaziTenGodOccurrenceKind;
  visibility: BaziTenGodVisibility;
  stem: string;
  tenGod: BaziTenGodName | null;
  sourceBranch: string | null;
  hiddenQiGrade: BaziHiddenQiGrade | null;
  hiddenQiLabel: string | null;
  boundary: string;
}

export interface BaziTenGodRepeatConnection {
  id: string;
  sourceEvidenceId: string;
  relationType: BaziRelationType;
  relationLabel: string;
  relationScope: BaziRelationScope;
  occurrenceIds: string[];
  participantLabels: string[];
  boundary: string;
}

export interface BaziStemRepeatCluster {
  id: string;
  stem: string;
  dynamicTenGod: BaziTenGodName;
  occurrences: BaziTenGodOccurrence[];
  layers: BaziRelationLayer[];
  patterns: BaziTenGodRepeatPattern[];
  connections: BaziTenGodRepeatConnection[];
  counts: {
    surface: number;
    hidden: number;
    reference: number;
    total: number;
  };
  boundary: string;
}

export interface BaziTenGodRoleRepeatCluster {
  id: string;
  tenGod: BaziTenGodName;
  stems: string[];
  occurrences: BaziTenGodOccurrence[];
  layers: BaziRelationLayer[];
  patterns: BaziTenGodRepeatPattern[];
  connections: BaziTenGodRepeatConnection[];
  counts: {
    surface: number;
    hidden: number;
    total: number;
  };
  boundary: string;
}

export interface BaziTenGodRepeatSegment {
  segmentIndex: number;
  startAt: string | null;
  endAtExclusive: string | null;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
  stemClusters: BaziStemRepeatCluster[];
  tenGodClusters: BaziTenGodRoleRepeatCluster[];
  counts: {
    stemClusters: number;
    tenGodClusters: number;
    connectedClusters: number;
    surfaceHiddenClusters: number;
  };
  boundary: string;
}

export interface BaziTenGodRepeatYear {
  year: number;
  annualGanZhi: string;
  segments: BaziTenGodRepeatSegment[];
  stemClusterCount: number;
  tenGodClusterCount: number;
  connectedClusterCount: number;
  boundary: string;
}

export interface BaziTenGodRepeatResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziRelationAuditStatus;
  capabilities: {
    sameStemClusters: true;
    sameTenGodClusters: true;
    visibilitySeparation: true;
    evidenceConnections: true;
    transparencyVerdict: false;
    rootVerdict: false;
    strengthEffectVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartCompleteness: 'complete' | 'partial_unknown_time';
    dynamicTenGodMethodologyVersion: string;
    dynamicTenGodEngineVersion: string;
    relationAuditMethodologyVersion: string;
    relationAuditEngineVersion: string;
  };
  dayMaster: {
    stem: string;
    tenGodReferenceLabel: '日主参照';
  };
  range: {
    startYear: number;
    endYear: number;
    yearCount: number;
  };
  years: BaziTenGodRepeatYear[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziTenGodRepeatVersion {
  id: string;
  chartVersionId: string;
  relationAuditVersionId: string;
  dynamicTenGodVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  relationAuditFingerprint: string;
  dynamicTenGodFingerprint: string;
  tenGodRepeatFingerprint: string;
  result: BaziTenGodRepeatResult;
  createdAt: number;
  updatedAt: number;
}
