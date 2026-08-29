import type { BaziElement } from './types';

export type BaziRelationRole = 'peer' | 'resource' | 'output' | 'wealth' | 'officer';
export type BaziEvidenceSide = 'support' | 'drain_or_control' | 'context';
export type BaziEvidenceImportance = 'primary' | 'secondary' | 'caution';
export type BaziStrengthAssessment =
  | 'supporting_evidence_established'
  | 'draining_evidence_established'
  | 'mixed_evidence'
  | 'insufficient_due_to_unknown_time';
export type BaziPatternStatus = 'supported_candidate' | 'candidate' | 'review_required';
export type BaziMethodStatus = 'candidate_direction' | 'reference_pending' | 'withheld';

export interface BaziInterpretationSource {
  id: string;
  title: string;
  author: string;
  period: string;
  url: string;
  scope: 'strength' | 'pattern' | 'climate' | 'general';
  note: string;
}

export interface BaziInterpretationMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'evidence_audit';
  label: string;
  strengthPolicy: {
    outputMode: 'evidence_balance_without_numeric_score';
    monthCommandPriority: 'primary_not_exclusive';
    rootPolicy: 'hidden_stem_actual_root';
    unknownTimePolicy: 'downgrade_to_insufficient';
    allowedAssessments: BaziStrengthAssessment[];
  };
  patternPolicy: {
    primaryBasis: 'month_branch_main_qi';
    transparencyPolicy: 'record_only_no_auto_transformation';
    storageMonthPolicy: 'multi_candidate_manual_review';
    interactionPolicy: 'detect_without_assuming_transformation';
    allowedStatuses: BaziPatternStatus[];
  };
  usefulGodPolicy: {
    separateMethods: Array<'month_command_pattern' | 'balancing' | 'climate' | 'flow'>;
    terminologyPolicy: 'never_merge_pattern_and_balancing_meanings';
    outputMode: 'candidate_direction_only';
  };
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziInterpretationSource[];
}

export interface BaziInterpretationEvidence {
  id: string;
  label: string;
  detail: string;
  side: BaziEvidenceSide;
  importance: BaziEvidenceImportance;
  pillar?: string;
  branch?: string;
  stem?: string;
  relation?: BaziRelationRole;
}

export interface BaziRootEvidence {
  pillar: string;
  branch: string;
  hiddenStem: string;
  grade: 'main_qi' | 'secondary_qi' | 'residual_qi';
}

export interface BaziBranchInteraction {
  type: 'clash' | 'six_combine' | 'three_harmony' | 'three_meeting';
  branches: string[];
  involvesMonthBranch: boolean;
  transformedElement: BaziElement | null;
  conclusion: 'detected_not_transformed';
}

export interface BaziStrengthAudit {
  assessment: BaziStrengthAssessment;
  label: string;
  confidence: 'low' | 'medium';
  monthBranch: string;
  monthMainQiStem: string;
  monthRelation: BaziRelationRole;
  roots: BaziRootEvidence[];
  evidence: BaziInterpretationEvidence[];
  rationale: string[];
  boundary: string;
}

export interface BaziPatternCandidate {
  label: string;
  tenGod: string;
  sourceStem: string;
  sourceQi: 'main_qi' | 'secondary_qi' | 'residual_qi';
  transparentAt: string[];
  status: BaziPatternStatus;
  reasons: string[];
}

export interface BaziPatternAudit {
  monthBranch: string;
  isStorageMonth: boolean;
  candidates: BaziPatternCandidate[];
  interactions: BaziBranchInteraction[];
  requiresManualReview: boolean;
  boundary: string;
}

export interface BaziUsefulGodMethodAudit {
  method: 'month_command_pattern' | 'balancing' | 'climate' | 'flow';
  label: string;
  status: BaziMethodStatus;
  candidateElements: BaziElement[];
  candidateRoles: string[];
  rationale: string[];
  boundary: string;
}

export interface BaziUsefulGodAudit {
  terminologyWarning: string;
  methods: BaziUsefulGodMethodAudit[];
  finalSelection: null;
}

export interface BaziInterpretationResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  capabilities: {
    strengthEvidenceAudit: true;
    patternCandidates: true;
    usefulGodMethodSeparation: true;
    finalStrengthVerdict: false;
    patternSuccessFailure: false;
    finalUsefulGod: false;
    luckCycles: false;
    predictions: false;
  };
  strength: BaziStrengthAudit;
  pattern: BaziPatternAudit;
  usefulGod: BaziUsefulGodAudit;
  warnings: string[];
}

export interface BaziAnalysisVersion {
  id: string;
  chartVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  analysisFingerprint: string;
  result: BaziInterpretationResult;
  createdAt: number;
  updatedAt: number;
}
