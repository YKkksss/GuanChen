import { randomUUID } from 'node:crypto';
import type { ReportContent, ReportGenerationReason, ReportVersionStatus } from '@/lib/reports/types';
import type {
  RectificationConversationLink,
  RectificationReport,
  RectificationReportDetail,
  RectificationReportEvidence,
  RectificationReportEvidenceDraft,
  RectificationReportListItem,
  RectificationReportVersion,
} from '@/lib/rectification/report-types';
import { getDatabase } from './client';

interface ReportRow {
  id: string; session_id: string; title: string; active_version_id: string | null;
  created_at: number; updated_at: number;
}
interface VersionRow {
  id: string; report_id: string; session_id: string; evaluation_id: string; selection_id: string | null;
  version: number; input_fingerprint: string; methodology_version: string; evaluation_engine_version: string;
  prompt_version: string; provider: string; model: string; content_json: string | null;
  generation_reason: ReportGenerationReason; base_version_id: string | null;
  status: ReportVersionStatus; error_code: string | null; input_tokens: number | null;
  output_tokens: number | null; created_at: number; completed_at: number | null;
}
interface EvidenceRow {
  id: string; report_version_id: string; section_key: string; evidence_key: string;
  kind: RectificationReportEvidence['kind']; label: string; facts_json: string; created_at: number;
}
interface LinkRow {
  id: string; session_id: string; selection_id: string; conversation_id: string; created_at: number;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

const mapReport = (row: ReportRow): RectificationReport => ({
  id: row.id, sessionId: row.session_id, title: row.title, activeVersionId: row.active_version_id,
  createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapVersion = (row: VersionRow): RectificationReportVersion => ({
  id: row.id, reportId: row.report_id, sessionId: row.session_id, evaluationId: row.evaluation_id,
  selectionId: row.selection_id, version: row.version, inputFingerprint: row.input_fingerprint,
  methodologyVersion: row.methodology_version, evaluationEngineVersion: row.evaluation_engine_version,
  promptVersion: row.prompt_version, provider: row.provider, model: row.model,
  generationReason: row.generation_reason, baseVersionId: row.base_version_id,
  content: parseJson<ReportContent>(row.content_json), status: row.status, errorCode: row.error_code,
  inputTokens: row.input_tokens, outputTokens: row.output_tokens, createdAt: row.created_at,
  completedAt: row.completed_at,
});
const mapEvidence = (row: EvidenceRow): RectificationReportEvidence => ({
  id: row.id, reportVersionId: row.report_version_id, sectionKey: row.section_key,
  evidenceKey: row.evidence_key, kind: row.kind, label: row.label,
  facts: parseJson<Record<string, unknown>>(row.facts_json) ?? {}, createdAt: row.created_at,
});
const mapLink = (row: LinkRow): RectificationConversationLink => ({
  id: row.id, sessionId: row.session_id, selectionId: row.selection_id,
  conversationId: row.conversation_id, createdAt: row.created_at,
});

export function getOrCreateRectificationReport(sessionId: string, title: string): RectificationReport {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM rectification_reports WHERE session_id = ?').get(sessionId) as ReportRow | undefined;
  if (existing) return mapReport(existing);
  const id = randomUUID(); const now = Date.now();
  db.prepare(`INSERT INTO rectification_reports (id, session_id, title, active_version_id, created_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, ?)` ).run(id, sessionId, title, now, now);
  return getRectificationReport(id)!;
}

export function getRectificationReport(id: string): RectificationReport | null {
  const row = getDatabase().prepare('SELECT * FROM rectification_reports WHERE id = ?').get(id) as ReportRow | undefined;
  return row ? mapReport(row) : null;
}

export function listRectificationReports(sessionId: string): RectificationReportListItem[] {
  const rows = getDatabase().prepare(`SELECT r.*, COUNT(v.id) AS version_count FROM rectification_reports r
    LEFT JOIN rectification_report_versions v ON v.report_id = r.id WHERE r.session_id = ?
    GROUP BY r.id ORDER BY r.updated_at DESC`).all(sessionId) as Array<ReportRow & { version_count: number }>;
  return rows.map(row => ({ ...mapReport(row), activeVersion: row.active_version_id ? getRectificationReportVersion(row.active_version_id) : null, versionCount: row.version_count }));
}

export function getRectificationReportVersion(id: string): RectificationReportVersion | null {
  const row = getDatabase().prepare('SELECT * FROM rectification_report_versions WHERE id = ?').get(id) as VersionRow | undefined;
  return row ? mapVersion(row) : null;
}

export function listRectificationReportVersions(reportId: string): RectificationReportVersion[] {
  return (getDatabase().prepare('SELECT * FROM rectification_report_versions WHERE report_id = ? ORDER BY version DESC').all(reportId) as VersionRow[]).map(mapVersion);
}

export function getRectificationReportDetail(reportId: string, versionNumber?: number): RectificationReportDetail | null {
  const report = getRectificationReport(reportId);
  if (!report) return null;
  const versions = listRectificationReportVersions(reportId);
  const version = typeof versionNumber === 'number'
    ? versions.find(item => item.version === versionNumber) ?? null
    : report.activeVersionId ? getRectificationReportVersion(report.activeVersionId) : versions[0] ?? null;
  const evidence = version
    ? (getDatabase().prepare('SELECT * FROM rectification_report_evidence WHERE report_version_id = ? ORDER BY section_key, created_at').all(version.id) as EvidenceRow[]).map(mapEvidence)
    : [];
  return { report, version, versions, evidence };
}

export function claimRectificationReportVersion(input: {
  reportId: string; sessionId: string; evaluationId: string; selectionId: string | null;
  inputFingerprint: string; methodologyVersion: string; evaluationEngineVersion: string;
  promptVersion: string; provider: string; model: string; regenerate: boolean;
  generationReason?: ReportGenerationReason; staleAfterMs: number;
}): { version: RectificationReportVersion; claimed: boolean } {
  const db = getDatabase();
  return db.transaction(() => {
    const report = getRectificationReport(input.reportId);
    if (!report) throw new Error('校时报告不存在');
    const active = report.activeVersionId ? getRectificationReportVersion(report.activeVersionId) : null;
    if (active?.status === 'completed' && active.inputFingerprint === input.inputFingerprint && !input.regenerate) return { version: active, claimed: false };
    const latest = db.prepare('SELECT * FROM rectification_report_versions WHERE report_id = ? ORDER BY version DESC LIMIT 1').get(input.reportId) as VersionRow | undefined;
    const now = Date.now();
    if (latest?.status === 'generating' && latest.input_fingerprint === input.inputFingerprint && now - latest.created_at < input.staleAfterMs) return { version: mapVersion(latest), claimed: false };
    const id = randomUUID(); const version = (latest?.version ?? 0) + 1;
    db.prepare(`INSERT INTO rectification_report_versions (
      id, report_id, session_id, evaluation_id, selection_id, version, input_fingerprint,
      methodology_version, evaluation_engine_version, prompt_version, provider, model,
      generation_reason, base_version_id, content_json, status, error_code,
      input_tokens, output_tokens, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'generating', NULL, NULL, NULL, ?, NULL)`)
      .run(id, input.reportId, input.sessionId, input.evaluationId, input.selectionId, version,
        input.inputFingerprint, input.methodologyVersion, input.evaluationEngineVersion,
        input.promptVersion, input.provider, input.model,
        input.generationReason ?? (input.regenerate ? 'manual_regenerate' : active ? 'source_changed' : 'initial_generation'),
        active?.id ?? null, now);
    db.prepare('UPDATE rectification_reports SET updated_at = ? WHERE id = ?').run(now, input.reportId);
    return { version: getRectificationReportVersion(id)!, claimed: true };
  })();
}

export function completeRectificationReportVersion(input: {
  versionId: string; content: ReportContent;
  evidenceBySection: Array<{ sectionKey: string; evidence: RectificationReportEvidenceDraft[] }>;
  inputTokens: number | null; outputTokens: number | null;
}): RectificationReportVersion | null {
  const db = getDatabase();
  return db.transaction(() => {
    const version = getRectificationReportVersion(input.versionId);
    if (!version) return null;
    const now = Date.now();
    db.prepare(`UPDATE rectification_report_versions SET content_json = ?, status = 'completed', error_code = NULL,
      input_tokens = ?, output_tokens = ?, completed_at = ? WHERE id = ?`)
      .run(JSON.stringify(input.content), input.inputTokens, input.outputTokens, now, input.versionId);
    db.prepare('DELETE FROM rectification_report_evidence WHERE report_version_id = ?').run(input.versionId);
    const insert = db.prepare(`INSERT INTO rectification_report_evidence
      (id, report_version_id, section_key, evidence_key, kind, label, facts_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const group of input.evidenceBySection) for (const item of group.evidence) {
      insert.run(randomUUID(), input.versionId, group.sectionKey, item.evidenceKey, item.kind, item.label, JSON.stringify(item.facts), now);
    }
    db.prepare('UPDATE rectification_reports SET active_version_id = ?, updated_at = ? WHERE id = ?').run(input.versionId, now, version.reportId);
    return getRectificationReportVersion(input.versionId);
  })();
}

export function failRectificationReportVersion(versionId: string, errorCode: string) {
  getDatabase().prepare(`UPDATE rectification_report_versions SET status = 'failed', error_code = ?, completed_at = ? WHERE id = ?`)
    .run(errorCode.slice(0, 200), Date.now(), versionId);
}

export function getRectificationConversationLinkBySelection(selectionId: string): RectificationConversationLink | null {
  const row = getDatabase().prepare('SELECT * FROM rectification_conversation_links WHERE selection_id = ?').get(selectionId) as LinkRow | undefined;
  return row ? mapLink(row) : null;
}

export function insertRectificationConversationLink(input: Omit<RectificationConversationLink, 'id' | 'createdAt'>): RectificationConversationLink {
  const id = randomUUID(); const now = Date.now();
  getDatabase().prepare(`INSERT INTO rectification_conversation_links (id, session_id, selection_id, conversation_id, created_at)
    VALUES (?, ?, ?, ?, ?)` ).run(id, input.sessionId, input.selectionId, input.conversationId, now);
  return mapLink({ id, session_id: input.sessionId, selection_id: input.selectionId, conversation_id: input.conversationId, created_at: now });
}
