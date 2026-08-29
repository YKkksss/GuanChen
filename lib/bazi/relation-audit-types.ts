import type { BaziElement, BaziPillarKey } from './types';
import type { BaziAnnualTimelineStatus } from './annual-timeline-types';

export type BaziRelationAuditStatus =
  | 'complete'
  | 'partial_unknown_time'
  | 'annual_only_without_luck_boundary';

export type BaziRelationLayer = 'natal' | 'luck_cycle' | 'annual';
export type BaziRelationScope = 'luck_to_natal' | 'annual_to_natal' | 'annual_to_luck' | 'multi_layer';
export type BaziRelationDomain = 'stem' | 'branch';
export type BaziRelationType =
  | 'stem_same_element'
  | 'stem_generate'
  | 'stem_control'
  | 'stem_five_combine'
  | 'branch_six_combine'
  | 'branch_clash'
  | 'branch_harm'
  | 'branch_mutual_punishment'
  | 'branch_self_punishment'
  | 'branch_three_harmony'
  | 'branch_three_meeting'
  | 'branch_three_punishment';

export interface BaziRelationAuditSource {
  id: string;
  title: string;
  type: 'classical_text' | 'project_methodology';
  url?: string;
  note: string;
}

export interface BaziRelationAuditMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'evidence_audit';
  label: string;
  policy: {
    layerPolicy: 'natal_luck_annual_segment';
    pairScope: 'cross_layer_only';
    setRule: 'full_members_required';
    transformationPolicy: 'detected_not_transformed';
    scoringPolicy: 'no_numeric_score_no_fortune_weight';
    unknownTimePolicy: 'omit_time_pillar_and_mark_partial';
    crossLuckPolicy: 'audit_each_actual_timeline_segment';
  };
  relationSets: Record<string, string[]>;
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziRelationAuditSource[];
}

export interface BaziRelationParticipant {
  id: string;
  layer: BaziRelationLayer;
  label: string;
  pillarKey: BaziPillarKey | null;
  symbol: string;
  element: BaziElement;
  luckCycleIndex: number | null;
  annualYear: number | null;
}

export interface BaziRelationEvidence {
  id: string;
  domain: BaziRelationDomain;
  type: BaziRelationType;
  scope: BaziRelationScope;
  label: string;
  participants: BaziRelationParticipant[];
  targetElement: BaziElement | null;
  conclusion: 'detected_only' | 'detected_not_transformed';
  ruleId: string;
  detail: string;
}

export interface BaziRelationAuditSegment {
  segmentIndex: number;
  startAt: string | null;
  endAtExclusive: string | null;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
  evidence: BaziRelationEvidence[];
  counts: {
    stem: number;
    branch: number;
    total: number;
  };
}

export interface BaziRelationAuditYear {
  year: number;
  annualGanZhi: string;
  segments: BaziRelationAuditSegment[];
  evidenceCount: number;
  boundary: string;
}

export interface BaziRelationAuditResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziRelationAuditStatus;
  capabilities: {
    relationEvidence: true;
    exactSegmentBoundary: boolean;
    transformationVerdict: false;
    strengthEffectVerdict: false;
    fortuneInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartCompleteness: 'complete' | 'partial_unknown_time';
    luckCycleMethodologyVersion: string;
    annualTimelineMethodologyVersion: string;
    annualTimelineStatus: BaziAnnualTimelineStatus;
  };
  range: {
    startYear: number;
    endYear: number;
    yearCount: number;
  };
  years: BaziRelationAuditYear[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziRelationAuditVersion {
  id: string;
  chartVersionId: string;
  luckCycleVersionId: string;
  annualTimelineVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  luckCycleFingerprint: string;
  annualTimelineFingerprint: string;
  relationAuditFingerprint: string;
  result: BaziRelationAuditResult;
  createdAt: number;
  updatedAt: number;
}
