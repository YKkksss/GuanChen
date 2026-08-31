import { randomUUID } from 'node:crypto';
import type {
  ReportEditableContent,
  ReportReviewStatus,
  ReportRevisionSourceKind,
  ReportUserRevision,
} from '@/lib/report-revisions/types';
import { getDatabase } from './client';

interface ReportUserRevisionRow {
  id: string;
  source_kind: ReportRevisionSourceKind;
  source_report_id: string;
  source_version_id: string;
  source_version: number;
  review_status: ReportReviewStatus;
  note: string;
  edited_content_json: string | null;
  edit_revision: number;
  created_at: number;
  updated_at: number;
  confirmed_at: number | null;
}

function mapRevision(row: ReportUserRevisionRow): ReportUserRevision {
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceReportId: row.source_report_id,
    sourceVersionId: row.source_version_id,
    sourceVersion: row.source_version,
    reviewStatus: row.review_status,
    note: row.note,
    editedContent: parseEditableContent(row.edited_content_json),
    editRevision: row.edit_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
  };
}

function parseEditableContent(value: string | null): ReportEditableContent | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ReportEditableContent;
  } catch {
    return null;
  }
}

export function getReportUserRevision(
  sourceKind: ReportRevisionSourceKind,
  sourceVersionId: string,
): ReportUserRevision | null {
  const row = getDatabase().prepare(`
    SELECT * FROM report_user_revisions
    WHERE source_kind = ? AND source_version_id = ?
  `).get(sourceKind, sourceVersionId) as ReportUserRevisionRow | undefined;
  return row ? mapRevision(row) : null;
}

export function saveReportUserRevision(input: {
  sourceKind: ReportRevisionSourceKind;
  sourceReportId: string;
  sourceVersionId: string;
  sourceVersion: number;
  reviewStatus: ReportReviewStatus;
  note: string;
  editedContent: ReportEditableContent | null;
}): ReportUserRevision {
  const db = getDatabase();
  return db.transaction(() => {
    const existing = getReportUserRevision(input.sourceKind, input.sourceVersionId);
    const now = Date.now();
    const serializedContent = input.editedContent ? JSON.stringify(input.editedContent) : null;
    const existingSerialized = existing?.editedContent ? JSON.stringify(existing.editedContent) : null;
    const contentChanged = serializedContent !== existingSerialized;
    const confirmedAt = input.reviewStatus === 'confirmed'
      ? existing?.reviewStatus === 'confirmed' && existing.confirmedAt
        ? existing.confirmedAt
        : now
      : null;

    if (!existing) {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO report_user_revisions (
          id, source_kind, source_report_id, source_version_id, source_version,
          review_status, note, edited_content_json, edit_revision,
          created_at, updated_at, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.sourceKind,
        input.sourceReportId,
        input.sourceVersionId,
        input.sourceVersion,
        input.reviewStatus,
        input.note,
        serializedContent,
        serializedContent ? 1 : 0,
        now,
        now,
        confirmedAt,
      );
      return getReportUserRevision(input.sourceKind, input.sourceVersionId)!;
    }

    db.prepare(`
      UPDATE report_user_revisions
      SET source_report_id = ?, source_version = ?, review_status = ?, note = ?,
          edited_content_json = ?, edit_revision = ?, updated_at = ?, confirmed_at = ?
      WHERE id = ?
    `).run(
      input.sourceReportId,
      input.sourceVersion,
      input.reviewStatus,
      input.note,
      serializedContent,
      existing.editRevision + (contentChanged ? 1 : 0),
      now,
      confirmedAt,
      existing.id,
    );
    return getReportUserRevision(input.sourceKind, input.sourceVersionId)!;
  })();
}
