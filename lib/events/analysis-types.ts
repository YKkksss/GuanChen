import type {
  ReportContent,
  ReportGenerationReason,
  ReportVersionStatus,
} from '@/lib/reports/types';

export const EVENT_ANALYSIS_SECTIONS = [
  { key: 'confirmed_facts', title: '已确认的现实事实', basis: 'evidence' },
  { key: 'timing_structure', title: '当时的运限结构', basis: 'evidence' },
  { key: 'cautious_interpretation', title: '谨慎回溯解释', basis: 'synthesis' },
  { key: 'open_verification', title: '仍待验证与继续观察', basis: 'synthesis' },
] as const;

export type EventAnalysisSectionKey = typeof EVENT_ANALYSIS_SECTIONS[number]['key'];
export type EventAnalysisEvidenceKind =
  | 'confirmed_event'
  | 'annual_transit'
  | 'monthly_transit'
  | 'daily_transit'
  | 'transit_range_summary';
export type EventAnalysisEvidenceSource = 'user_confirmed' | 'rule_engine';

export interface EventAnalysis {
  id: string;
  eventId: string;
  conversationId: string;
  activeVersionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface EventAnalysisVersion {
  id: string;
  analysisId: string;
  version: number;
  sourceFingerprint: string;
  engineVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  generationReason: ReportGenerationReason;
  baseVersionId: string | null;
  content: ReportContent | null;
  status: ReportVersionStatus;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
  completedAt: number | null;
}

export interface EventAnalysisEvidence {
  id: string;
  analysisVersionId: string;
  sectionKey: EventAnalysisSectionKey;
  evidenceKey: string;
  kind: EventAnalysisEvidenceKind;
  label: string;
  source: EventAnalysisEvidenceSource;
  facts: Record<string, unknown>;
  createdAt: number;
}

export interface EventAnalysisEvidenceDraft {
  evidenceKey: string;
  kind: EventAnalysisEvidenceKind;
  label: string;
  source: EventAnalysisEvidenceSource;
  facts: Record<string, unknown>;
}

export interface EventAnalysisDetail {
  analysis: EventAnalysis;
  version: EventAnalysisVersion | null;
  versions: EventAnalysisVersion[];
  evidence: EventAnalysisEvidence[];
  currentSourceFingerprint: string;
  isStale: boolean;
}

export interface EventAnalysisSummary {
  analysisId: string;
  eventId: string;
  activeVersionId: string | null;
  version: number | null;
  versionCount: number;
  status: ReportVersionStatus | null;
  generationReason: ReportGenerationReason | null;
  completedAt: number | null;
  updatedAt: number;
  isStale: boolean;
}
