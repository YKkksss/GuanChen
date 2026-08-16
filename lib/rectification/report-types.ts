import type { ReportContent, ReportVersionStatus } from '@/lib/reports/types';
import type {
  RectificationCandidateEvaluation,
  RectificationConfidence,
  RectificationEvidenceReadiness,
  RectificationTimeSlotKey,
} from './types';

export const RECTIFICATION_REPORT_SECTIONS = [
  { key: 'conclusion', title: '核心候选结论' },
  { key: 'discriminating_evidence', title: '主要区分证据' },
  { key: 'conflicts_and_limits', title: '冲突证据与结论边界' },
  { key: 'candidate_comparison', title: '候选比较' },
  { key: 'next_observation', title: '后续验证建议' },
] as const;

export type RectificationReportEvidenceKind =
  | 'evaluation_summary'
  | 'candidate_summary'
  | 'rule_hit'
  | 'confirmed_event'
  | 'selection'
  | 'stability';

export interface RectificationReport {
  id: string;
  sessionId: string;
  title: string;
  activeVersionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RectificationReportVersion {
  id: string;
  reportId: string;
  sessionId: string;
  evaluationId: string;
  selectionId: string | null;
  version: number;
  inputFingerprint: string;
  methodologyVersion: string;
  evaluationEngineVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  content: ReportContent | null;
  status: ReportVersionStatus;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
  completedAt: number | null;
}

export interface RectificationReportEvidenceDraft {
  evidenceKey: string;
  kind: RectificationReportEvidenceKind;
  label: string;
  facts: Record<string, unknown>;
}

export interface RectificationReportEvidence extends RectificationReportEvidenceDraft {
  id: string;
  reportVersionId: string;
  sectionKey: string;
  createdAt: number;
}

export interface RectificationReportDetail {
  report: RectificationReport;
  version: RectificationReportVersion | null;
  versions: RectificationReportVersion[];
  evidence: RectificationReportEvidence[];
}

export interface RectificationReportListItem extends RectificationReport {
  activeVersion: RectificationReportVersion | null;
  versionCount: number;
}

export interface RectificationReportCandidateFact {
  candidateId: string;
  slotKey: RectificationTimeSlotKey;
  slotLabel: string;
  rank: number;
  tiedForRank: boolean;
  relativeEvidenceIndex: number;
  confidence: RectificationConfidence;
  supportCount: number;
  conflictCount: number;
  leaveOneEventOutTopRate: number | null;
  chartFingerprint: string;
  chartDate: string;
  mingGong: string;
  shenGong: string;
  wuxingJu: string;
  mingGongMajorStars: string[];
}

export interface RectificationConclusionFactPack {
  schemaVersion: 1;
  sessionId: string;
  sessionTitle: string;
  evaluationId: string;
  evaluationVersion: number;
  methodologyVersion: string;
  evaluationEngineVersion: string;
  evaluatedAt: number;
  stable: boolean;
  topMarginRatio: number | null;
  readiness: RectificationEvidenceReadiness;
  readinessChecks: {
    minimumEventCountSatisfied: boolean;
    recommendedEventCountSatisfied: boolean;
    minimumCategoryCountSatisfied: boolean;
    recommendedCategoryCountSatisfied: boolean;
  };
  selectedCandidateId: string | null;
  selectionId: string | null;
  selectionNote: string | null;
  candidates: RectificationReportCandidateFact[];
  warnings: string[];
  disclaimer: string;
}

export interface RectificationConversationLink {
  id: string;
  sessionId: string;
  selectionId: string;
  conversationId: string;
  createdAt: number;
}

export interface RectificationReportBuildResult {
  factPack: RectificationConclusionFactPack;
  evidence: RectificationReportEvidenceDraft[];
  candidateEvaluations: RectificationCandidateEvaluation[];
}
