export const REPORT_EXPORT_KINDS = ['topic', 'heming', 'annual', 'rectification'] as const;

export type ReportExportKind = typeof REPORT_EXPORT_KINDS[number];
export type ReportExportStatus = 'generating' | 'completed' | 'failed';

export interface ReportExportRecord {
  id: string;
  sourceKind: ReportExportKind;
  sourceReportId: string | null;
  sourceTransitReportId: string | null;
  sourceRectificationReportId: string | null;
  sourceVersionId: string;
  sourceFingerprint: string;
  rendererVersion: string;
  fileName: string;
  relativePath: string | null;
  mimeType: 'application/pdf';
  byteSize: number | null;
  sha256: string | null;
  status: ReportExportStatus;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface ReportExportEvidenceLine {
  label: string;
  detail: string;
}

export interface ReportExportSection {
  key: string;
  title: string;
  content: string;
  basisLabel: string;
  evidence: ReportExportEvidenceLine[];
}

export interface ReportExportDocument {
  sourceKind: ReportExportKind;
  sourceReportId: string;
  sourceVersionId: string;
  sourceFingerprint: string;
  title: string;
  categoryLabel: string;
  versionLabel: string;
  generatedAt: number;
  sourceCompletedAt: number | null;
  metadata: Array<{ label: string; value: string }>;
  summary: string;
  sections: ReportExportSection[];
  actionItems: string[];
  openQuestions: string[];
  disclaimer: string;
}

export interface EnsureReportExportInput {
  sourceKind: ReportExportKind;
  reportId: string;
  version?: number;
}

export function isReportExportKind(value: unknown): value is ReportExportKind {
  return typeof value === 'string' && (REPORT_EXPORT_KINDS as readonly string[]).includes(value);
}
