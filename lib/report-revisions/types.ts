import type { ReportContent } from '@/lib/reports/types';
import { REPORT_EXPORT_KINDS, type ReportExportKind } from '@/lib/report-exports/types';

export const REPORT_REVIEW_STATUSES = ['draft', 'confirmed', 'needs_revision'] as const;

export type ReportReviewStatus = typeof REPORT_REVIEW_STATUSES[number];
export type ReportRevisionSourceKind = ReportExportKind;

export type ReportEditableContent =
  | { format: 'structured'; content: ReportContent }
  | { format: 'plain_text'; content: string };

export interface ReportUserRevision {
  id: string;
  sourceKind: ReportRevisionSourceKind;
  sourceReportId: string;
  sourceVersionId: string;
  sourceVersion: number;
  reviewStatus: ReportReviewStatus;
  note: string;
  editedContent: ReportEditableContent | null;
  editRevision: number;
  createdAt: number;
  updatedAt: number;
  confirmedAt: number | null;
}

export interface ResolvedReportRevisionSource {
  sourceKind: ReportRevisionSourceKind;
  reportId: string;
  versionId: string;
  version: number;
  originalContent: ReportEditableContent;
}

export function isReportRevisionSourceKind(value: unknown): value is ReportRevisionSourceKind {
  return typeof value === 'string' && (REPORT_EXPORT_KINDS as readonly string[]).includes(value);
}

export function isReportReviewStatus(value: unknown): value is ReportReviewStatus {
  return typeof value === 'string' && (REPORT_REVIEW_STATUSES as readonly string[]).includes(value);
}
