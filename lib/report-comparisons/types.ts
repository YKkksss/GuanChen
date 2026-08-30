import type { ReportExportKind } from '@/lib/report-exports/types';
import type { ReportGenerationReason } from '@/lib/reports/types';

export type ReportComparisonSourceKind = ReportExportKind;
export type ReportDifferenceKind =
  | 'unchanged'
  | 'expression_changed'
  | 'evidence_changed'
  | 'evidence_and_expression_changed'
  | 'added'
  | 'removed';

export interface ReportComparisonVersion {
  id: string;
  version: number;
  status: 'completed';
  generationReason: ReportGenerationReason;
  baseVersionId: string | null;
  completedAt: number | null;
}

export interface ReportMetadataDifference {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

export interface ReportSectionDifference {
  key: string;
  title: string;
  kind: ReportDifferenceKind;
  before: string | null;
  after: string | null;
  textChanged: boolean;
  evidenceChanged: boolean;
}

export interface ReportEvidenceDifference {
  identity: string;
  sectionKey: string;
  evidenceKey: string;
  label: string;
  kind: 'added' | 'removed' | 'changed' | 'unchanged';
  beforeFacts: Record<string, unknown> | null;
  afterFacts: Record<string, unknown> | null;
}

export interface ReportListDifference {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface ReportVersionComparison {
  sourceKind: ReportComparisonSourceKind;
  reportId: string;
  reportTitle: string;
  base: ReportComparisonVersion;
  target: ReportComparisonVersion;
  summary: {
    classification: 'no_change' | 'expression_only' | 'evidence_changed' | 'generation_metadata_only';
    changedSections: number;
    expressionChangedSections: number;
    evidenceChangedSections: number;
    addedEvidence: number;
    removedEvidence: number;
    changedEvidence: number;
    changedMetadata: number;
  };
  metadata: ReportMetadataDifference[];
  summaryText: { before: string; after: string; changed: boolean };
  sections: ReportSectionDifference[];
  evidence: ReportEvidenceDifference[];
  actionItems: ReportListDifference;
  openQuestions: ReportListDifference;
}

export function isReportComparisonSourceKind(value: unknown): value is ReportComparisonSourceKind {
  return value === 'topic' || value === 'heming' || value === 'annual' || value === 'rectification';
}
