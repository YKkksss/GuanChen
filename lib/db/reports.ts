import { randomUUID } from 'node:crypto';
import type {
  Report,
  ReportContent,
  ReportDetail,
  ReportEvidence,
  ReportEvidenceDraft,
  ReportListItem,
  ReportType,
  ReportVersion,
  ReportVersionStatus,
} from '@/lib/reports/types';
import { REPORT_TYPE_DEFINITIONS } from '@/lib/reports/types';
import { getDatabase } from './client';

interface ReportRow {
  id: string;
  conversation_id: string;
  type: ReportType;
  title: string;
  active_version_id: string | null;
  created_at: number;
  updated_at: number;
}

interface ReportVersionRow {
  id: string;
  report_id: string;
  version: number;
  engine_version: string;
  prompt_version: string;
  provider: string;
  model: string;
  content_json: string | null;
  status: ReportVersionStatus;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
  completed_at: number | null;
}

interface ReportEvidenceRow {
  id: string;
  report_version_id: string;
  section_key: string;
  evidence_key: string;
  kind: ReportEvidence['kind'];
  label: string;
  source: ReportEvidence['source'];
  facts_json: string;
  created_at: number;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapReport(row: ReportRow): Report {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    type: row.type,
    title: row.title,
    activeVersionId: row.active_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: ReportVersionRow): ReportVersion {
  return {
    id: row.id,
    reportId: row.report_id,
    version: row.version,
    engineVersion: row.engine_version,
    promptVersion: row.prompt_version,
    provider: row.provider,
    model: row.model,
    content: parseJson<ReportContent>(row.content_json),
    status: row.status,
    errorCode: row.error_code,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapEvidence(row: ReportEvidenceRow): ReportEvidence {
  return {
    id: row.id,
    reportVersionId: row.report_version_id,
    sectionKey: row.section_key,
    evidenceKey: row.evidence_key,
    kind: row.kind,
    label: row.label,
    source: row.source,
    facts: parseJson<Record<string, unknown>>(row.facts_json) ?? {},
    createdAt: row.created_at,
  };
}

export function getOrCreateReport(
  conversationId: string,
  type: ReportType,
  title = REPORT_TYPE_DEFINITIONS[type].label,
): Report {
  const db = getDatabase();
  const existing = db.prepare(
    'SELECT * FROM reports WHERE conversation_id = ? AND type = ?',
  ).get(conversationId, type) as ReportRow | undefined;
  if (existing) {
    if (existing.title !== title) {
      db.prepare('UPDATE reports SET title = ?, updated_at = ? WHERE id = ?')
        .run(title, Date.now(), existing.id);
      return getReport(existing.id)!;
    }
    return mapReport(existing);
  }

  const id = randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO reports (
      id, conversation_id, type, title, active_version_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, ?, ?)
  `).run(id, conversationId, type, title, now, now);
  return getReport(id)!;
}

export function getReport(id: string): Report | null {
  const row = getDatabase().prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow | undefined;
  return row ? mapReport(row) : null;
}

export function listReports(conversationId: string): ReportListItem[] {
  const rows = getDatabase().prepare(`
    SELECT r.*, COUNT(rv.id) AS version_count
    FROM reports r
    LEFT JOIN report_versions rv ON rv.report_id = r.id
    WHERE r.conversation_id = ?
    GROUP BY r.id
    ORDER BY r.updated_at DESC
  `).all(conversationId) as Array<ReportRow & { version_count: number }>;
  return rows.map(row => ({
    ...mapReport(row),
    activeVersion: row.active_version_id ? getReportVersion(row.active_version_id) : null,
    versionCount: row.version_count,
  }));
}

export function listReportVersions(reportId: string): ReportVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM report_versions WHERE report_id = ? ORDER BY version DESC
  `).all(reportId) as ReportVersionRow[];
  return rows.map(mapVersion);
}

export function getReportVersion(id: string): ReportVersion | null {
  const row = getDatabase().prepare('SELECT * FROM report_versions WHERE id = ?').get(id) as ReportVersionRow | undefined;
  return row ? mapVersion(row) : null;
}

export function getReportVersionByNumber(reportId: string, version: number): ReportVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM report_versions WHERE report_id = ? AND version = ?
  `).get(reportId, version) as ReportVersionRow | undefined;
  return row ? mapVersion(row) : null;
}

export function getReportDetail(reportId: string, versionNumber?: number): ReportDetail | null {
  const report = getReport(reportId);
  if (!report) return null;
  const versions = listReportVersions(reportId);
  const version = typeof versionNumber === 'number'
    ? getReportVersionByNumber(reportId, versionNumber)
    : report.activeVersionId
      ? getReportVersion(report.activeVersionId)
      : versions[0] ?? null;
  return {
    report,
    version,
    versions,
    evidence: version ? listReportEvidence(version.id) : [],
  };
}

export function claimReportVersion(input: {
  reportId: string;
  engineVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  regenerate: boolean;
  staleAfterMs: number;
}): { version: ReportVersion; claimed: boolean } {
  const db = getDatabase();
  return db.transaction(() => {
    const report = getReport(input.reportId);
    if (!report) throw new Error('报告不存在');
    const active = report.activeVersionId ? getReportVersion(report.activeVersionId) : null;
    if (active?.status === 'completed' && !input.regenerate) {
      return { version: active, claimed: false };
    }

    const latest = db.prepare(`
      SELECT * FROM report_versions WHERE report_id = ? ORDER BY version DESC LIMIT 1
    `).get(input.reportId) as ReportVersionRow | undefined;
    const now = Date.now();
    if (latest?.status === 'generating' && now - latest.created_at < input.staleAfterMs) {
      return { version: mapVersion(latest), claimed: false };
    }

    const nextVersion = (latest?.version ?? 0) + 1;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO report_versions (
        id, report_id, version, engine_version, prompt_version, provider, model,
        content_json, status, error_code, input_tokens, output_tokens, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'generating', NULL, NULL, NULL, ?, NULL)
    `).run(
      id,
      input.reportId,
      nextVersion,
      input.engineVersion,
      input.promptVersion,
      input.provider,
      input.model,
      now,
    );
    db.prepare('UPDATE reports SET updated_at = ? WHERE id = ?').run(now, input.reportId);
    return { version: getReportVersion(id)!, claimed: true };
  })();
}

export function completeReportVersion(input: {
  versionId: string;
  content: ReportContent;
  evidenceBySection: Array<{ sectionKey: string; evidence: ReportEvidenceDraft[] }>;
  inputTokens: number | null;
  outputTokens: number | null;
}): ReportVersion | null {
  const db = getDatabase();
  return db.transaction(() => {
    const version = getReportVersion(input.versionId);
    if (!version) return null;
    const now = Date.now();
    db.prepare(`
      UPDATE report_versions
      SET content_json = ?, status = 'completed', error_code = NULL,
          input_tokens = ?, output_tokens = ?, completed_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(input.content),
      input.inputTokens,
      input.outputTokens,
      now,
      input.versionId,
    );
    db.prepare('DELETE FROM report_evidence WHERE report_version_id = ?').run(input.versionId);
    const insertEvidence = db.prepare(`
      INSERT INTO report_evidence (
        id, report_version_id, section_key, evidence_key, kind,
        label, source, facts_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const group of input.evidenceBySection) {
      for (const evidence of group.evidence) {
        insertEvidence.run(
          randomUUID(),
          input.versionId,
          group.sectionKey,
          evidence.evidenceKey,
          evidence.kind,
          evidence.label,
          evidence.source,
          JSON.stringify(evidence.facts),
          now,
        );
      }
    }
    db.prepare(`
      UPDATE reports SET active_version_id = ?, updated_at = ? WHERE id = ?
    `).run(input.versionId, now, version.reportId);
    return getReportVersion(input.versionId);
  })();
}

export function failReportVersion(versionId: string, errorCode: string): ReportVersion | null {
  getDatabase().prepare(`
    UPDATE report_versions SET status = 'failed', error_code = ?, completed_at = ? WHERE id = ?
  `).run(errorCode.slice(0, 200), Date.now(), versionId);
  return getReportVersion(versionId);
}

export function listReportEvidence(versionId: string): ReportEvidence[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM report_evidence
    WHERE report_version_id = ?
    ORDER BY section_key, created_at, evidence_key
  `).all(versionId) as ReportEvidenceRow[];
  return rows.map(mapEvidence);
}
