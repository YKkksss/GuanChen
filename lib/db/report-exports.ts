import { randomUUID } from 'node:crypto';
import type {
  ReportExportKind,
  ReportExportRecord,
  ReportExportStatus,
} from '@/lib/report-exports/types';
import { getDatabase } from './client';

interface ReportExportRow {
  id: string;
  source_kind: ReportExportKind;
  source_report_id: string | null;
  source_transit_report_id: string | null;
  source_rectification_report_id: string | null;
  source_version_id: string;
  source_fingerprint: string;
  renderer_version: string;
  file_name: string;
  relative_path: string | null;
  mime_type: 'application/pdf';
  byte_size: number | null;
  sha256: string | null;
  status: ReportExportStatus;
  error_code: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

function mapRow(row: ReportExportRow): ReportExportRecord {
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceReportId: row.source_report_id,
    sourceTransitReportId: row.source_transit_report_id,
    sourceRectificationReportId: row.source_rectification_report_id,
    sourceVersionId: row.source_version_id,
    sourceFingerprint: row.source_fingerprint,
    rendererVersion: row.renderer_version,
    fileName: row.file_name,
    relativePath: row.relative_path,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    status: row.status,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export function getReportExport(id: string): ReportExportRecord | null {
  const row = getDatabase().prepare('SELECT * FROM report_exports WHERE id = ?')
    .get(id) as ReportExportRow | undefined;
  return row ? mapRow(row) : null;
}

export function findReportExport(input: {
  sourceKind: ReportExportKind;
  sourceVersionId: string;
  sourceFingerprint: string;
  rendererVersion: string;
}): ReportExportRecord | null {
  const row = getDatabase().prepare(`
    SELECT * FROM report_exports
    WHERE source_kind = ? AND source_version_id = ?
      AND source_fingerprint = ? AND renderer_version = ?
  `).get(
    input.sourceKind,
    input.sourceVersionId,
    input.sourceFingerprint,
    input.rendererVersion,
  ) as ReportExportRow | undefined;
  return row ? mapRow(row) : null;
}

export function claimReportExport(input: {
  sourceKind: ReportExportKind;
  sourceReportId: string;
  sourceVersionId: string;
  sourceFingerprint: string;
  rendererVersion: string;
  fileName: string;
  staleAfterMs: number;
}): { record: ReportExportRecord; claimed: boolean } {
  const db = getDatabase();
  return db.transaction(() => {
    const existing = findReportExport(input);
    const now = Date.now();
    if (existing?.status === 'completed') return { record: existing, claimed: false };
    if (existing?.status === 'generating' && now - existing.updatedAt < input.staleAfterMs) {
      return { record: existing, claimed: false };
    }

    const refs = sourceReferences(input.sourceKind, input.sourceReportId);
    if (existing) {
      db.prepare(`
        UPDATE report_exports
        SET file_name = ?, relative_path = NULL, byte_size = NULL, sha256 = NULL,
            status = 'generating', error_code = NULL, updated_at = ?, completed_at = NULL
        WHERE id = ?
      `).run(input.fileName, now, existing.id);
      return { record: getReportExport(existing.id)!, claimed: true };
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO report_exports (
        id, source_kind, source_report_id, source_transit_report_id,
        source_rectification_report_id, source_version_id, source_fingerprint,
        renderer_version, file_name, relative_path, mime_type, byte_size, sha256,
        status, error_code, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'application/pdf', NULL, NULL,
        'generating', NULL, ?, ?, NULL)
    `).run(
      id,
      input.sourceKind,
      refs.sourceReportId,
      refs.sourceTransitReportId,
      refs.sourceRectificationReportId,
      input.sourceVersionId,
      input.sourceFingerprint,
      input.rendererVersion,
      input.fileName,
      now,
      now,
    );
    return { record: getReportExport(id)!, claimed: true };
  })();
}

export function completeReportExport(input: {
  id: string;
  relativePath: string;
  byteSize: number;
  sha256: string;
}): ReportExportRecord | null {
  const now = Date.now();
  getDatabase().prepare(`
    UPDATE report_exports
    SET relative_path = ?, byte_size = ?, sha256 = ?, status = 'completed',
        error_code = NULL, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(input.relativePath, input.byteSize, input.sha256, now, now, input.id);
  return getReportExport(input.id);
}

export function failReportExport(id: string, errorCode: string): ReportExportRecord | null {
  getDatabase().prepare(`
    UPDATE report_exports
    SET status = 'failed', error_code = ?, relative_path = NULL,
        byte_size = NULL, sha256 = NULL, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(errorCode.slice(0, 240), Date.now(), Date.now(), id);
  return getReportExport(id);
}

export function listReportExports(input: {
  sourceKind: ReportExportKind;
  reportId: string;
}): ReportExportRecord[] {
  const column = input.sourceKind === 'annual'
    ? 'source_transit_report_id'
    : input.sourceKind === 'rectification'
      ? 'source_rectification_report_id'
      : 'source_report_id';
  const rows = getDatabase().prepare(`
    SELECT * FROM report_exports
    WHERE source_kind = ? AND ${column} = ?
    ORDER BY created_at DESC
  `).all(input.sourceKind, input.reportId) as ReportExportRow[];
  return rows.map(mapRow);
}

export function listCompletedReportExportPaths(): string[] {
  const rows = getDatabase().prepare(`
    SELECT relative_path FROM report_exports
    WHERE status = 'completed' AND relative_path IS NOT NULL
  `).all() as Array<{ relative_path: string }>;
  return rows.map(row => row.relative_path);
}

function sourceReferences(sourceKind: ReportExportKind, reportId: string) {
  return {
    sourceReportId: sourceKind === 'topic' || sourceKind === 'heming' ? reportId : null,
    sourceTransitReportId: sourceKind === 'annual' ? reportId : null,
    sourceRectificationReportId: sourceKind === 'rectification' ? reportId : null,
  };
}
