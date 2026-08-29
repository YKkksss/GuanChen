import type { BaziAnnualTimelineStatus } from './annual-timeline-types';
import type { BaziStemPolarity } from './luck-cycle-types';
import type {
  BaziRelationAuditStatus,
  BaziRelationDomain,
  BaziRelationLayer,
  BaziRelationScope,
  BaziRelationType,
} from './relation-audit-types';
import type { BaziRelationConditionState } from './relation-adjudication-types';
import type { BaziElement, BaziPillarKey } from './types';

export type BaziTenGodName =
  | '比肩'
  | '劫财'
  | '食神'
  | '伤官'
  | '偏财'
  | '正财'
  | '七杀'
  | '正官'
  | '偏印'
  | '正印';

export type BaziHiddenQiGrade = 'main_qi' | 'secondary_qi' | 'residual_qi';
export type BaziDynamicTenGodSourceKind = 'surface_stem' | 'branch_hidden_stem';

export interface BaziDynamicTenGodSource {
  id: string;
  title: string;
  type: 'classical_text' | 'official_implementation' | 'project_methodology';
  url?: string;
  note: string;
}

export interface BaziDynamicTenGodMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'dynamic_role_direction_evidence_audit';
  label: string;
  policy: {
    tenGodReference: 'day_master_stem';
    hiddenStemPolicy: 'role_metadata_only_no_activation_claim';
    hiddenQiPolicy: 'ordered_main_secondary_residual';
    directionPolicy: 'consume_versioned_cross_layer_relation_evidence';
    targetPolicy: 'natal_pillar_only';
    adjudicationPolicy: 'attach_existing_condition_state_without_reinterpreting';
    crossLuckPolicy: 'audit_each_actual_timeline_segment';
    scoringPolicy: 'no_numeric_score_no_strength_or_fortune_weight';
  };
  tenGodNames: BaziTenGodName[];
  hiddenStemOrder: Record<string, string[]>;
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziDynamicTenGodSource[];
}

export interface BaziDynamicTenGodRole {
  id: string;
  nodeId: string;
  layer: Exclude<BaziRelationLayer, 'natal'>;
  sourceKind: BaziDynamicTenGodSourceKind;
  sourceBranch: string | null;
  stem: string;
  element: BaziElement;
  polarity: BaziStemPolarity;
  tenGod: BaziTenGodName;
  hiddenQiGrade: BaziHiddenQiGrade | null;
  hiddenQiLabel: string | null;
  boundary: string;
}

export interface BaziDynamicDirectionLink {
  id: string;
  sourceNodeId: string;
  sourceLayer: Exclude<BaziRelationLayer, 'natal'>;
  sourceDomain: BaziRelationDomain;
  sourceSymbol: string;
  targetPillarKey: BaziPillarKey;
  targetPillarLabel: string;
  targetSymbol: string;
  relationType: BaziRelationType;
  relationLabel: string;
  relationScope: BaziRelationScope;
  sourceEvidenceId: string;
  conditionDecisionId: string | null;
  conditionState: BaziRelationConditionState | null;
  conditionStateLabel: string | null;
  boundary: string;
}

export interface BaziDynamicTenGodLayerSnapshot {
  nodeId: string;
  layer: Exclude<BaziRelationLayer, 'natal'>;
  label: string;
  ganZhi: string;
  stem: string;
  branch: string;
  roles: BaziDynamicTenGodRole[];
  directions: BaziDynamicDirectionLink[];
  counts: {
    roles: number;
    hiddenStemRoles: number;
    natalDirectionLinks: number;
  };
  boundary: string;
}

export interface BaziDynamicTenGodSegment {
  segmentIndex: number;
  startAt: string | null;
  endAtExclusive: string | null;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
  annual: BaziDynamicTenGodLayerSnapshot;
  luckCycle: BaziDynamicTenGodLayerSnapshot | null;
  counts: {
    roles: number;
    hiddenStemRoles: number;
    natalDirectionLinks: number;
  };
}

export interface BaziDynamicTenGodYear {
  year: number;
  annualGanZhi: string;
  segments: BaziDynamicTenGodSegment[];
  roleCount: number;
  natalDirectionLinkCount: number;
  boundary: string;
}

export interface BaziDynamicTenGodResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziRelationAuditStatus;
  capabilities: {
    dynamicTenGodRoles: true;
    hiddenStemRoles: true;
    evidenceBoundDirection: true;
    hiddenStemActivationVerdict: false;
    strengthEffectVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartCompleteness: 'complete' | 'partial_unknown_time';
    annualTimelineStatus: BaziAnnualTimelineStatus;
    relationAuditMethodologyVersion: string;
    relationAuditEngineVersion: string;
    relationAdjudicationMethodologyVersion: string;
    relationAdjudicationEngineVersion: string;
  };
  dayMaster: {
    stem: string;
    element: BaziElement;
    polarity: BaziStemPolarity;
  };
  range: {
    startYear: number;
    endYear: number;
    yearCount: number;
  };
  years: BaziDynamicTenGodYear[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziDynamicTenGodVersion {
  id: string;
  chartVersionId: string;
  annualTimelineVersionId: string;
  relationAuditVersionId: string;
  relationAdjudicationVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  annualTimelineFingerprint: string;
  relationAuditFingerprint: string;
  relationAdjudicationFingerprint: string;
  dynamicTenGodFingerprint: string;
  result: BaziDynamicTenGodResult;
  createdAt: number;
  updatedAt: number;
}
