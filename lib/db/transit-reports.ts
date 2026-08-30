import { randomUUID } from 'node:crypto';
import type { ReportGenerationReason } from '@/lib/reports/types';
import type {
  AnnualTransitReport,
  AnnualTransitReportDetail,
  AnnualTransitReportVersion,
  TransitReportStatus,
} from '@/lib/transits/types';
import { getDatabase } from './client';

interface TransitReportRow {
  id: string;
  conversation_id: string;
  snapshot_id: string;
  level: 'year';
  target_date: string;
  engine_version: string;
  prompt_version: string;
  provider: string;
  model: string;
  active_version_id: string | null;
  content: string;
  status: TransitReportStatus;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

interface TransitReportVersionRow {
  id: string;
  report_id: string;
  version: number;
  snapshot_id: string;
  engine_version: string;
  prompt_version: string;
  provider: string;
  model: string;
  generation_reason: ReportGenerationReason;
  base_version_id: string | null;
  content: string;
  status: TransitReportStatus;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
  completed_at: number | null;
}

function mapVersion(row: TransitReportVersionRow): AnnualTransitReportVersion {
  return {
    id: row.id,
    reportId: row.report_id,
    version: row.version,
    snapshotId: row.snapshot_id,
    engineVersion: row.engine_version,
    promptVersion: row.prompt_version,
    provider: row.provider,
    model: row.model,
    generationReason: row.generation_reason,
    baseVersionId: row.base_version_id,
    content: row.content,
    status: row.status,
    errorCode: row.error_code,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapReport(
  row: TransitReportRow,
  version: AnnualTransitReportVersion | null,
  versionCount: number,
): AnnualTransitReport {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    snapshotId: version?.snapshotId ?? row.snapshot_id,
    level: row.level,
    targetDate: row.target_date,
    engineVersion: version?.engineVersion ?? row.engine_version,
    promptVersion: version?.promptVersion ?? row.prompt_version,
    provider: version?.provider ?? row.provider,
    model: version?.model ?? row.model,
    activeVersionId: row.active_version_id,
    versionId: version?.id ?? null,
    version: version?.version ?? null,
    versionCount,
    generationReason: version?.generationReason ?? 'legacy_migration',
    baseVersionId: version?.baseVersionId ?? null,
    content: version?.content ?? row.content,
    status: version?.status ?? row.status,
    errorCode: version?.errorCode ?? row.error_code,
    inputTokens: version?.inputTokens ?? row.input_tokens,
    outputTokens: version?.outputTokens ?? row.output_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: version?.completedAt ?? row.completed_at,
  };
}

function getReportRowByIdentity(input: {
  conversationId: string;
  targetDate: string;
  engineVersion: string;
  promptVersion: string;
}): TransitReportRow | null {
  const row = getDatabase().prepare(`
    SELECT * FROM transit_reports
    WHERE conversation_id = ? AND level = 'year' AND target_date = ?
      AND engine_version = ? AND prompt_version = ?
  `).get(
    input.conversationId,
    input.targetDate,
    input.engineVersion,
    input.promptVersion,
  ) as TransitReportRow | undefined;
  return row ?? null;
}

function getReportRowById(id: string): TransitReportRow | null {
  const row = getDatabase().prepare('SELECT * FROM transit_reports WHERE id = ?')
    .get(id) as TransitReportRow | undefined;
  return row ?? null;
}

function getLatestReportRowBySeries(input: {
  conversationId: string;
  targetDate: string;
}): TransitReportRow | null {
  const row = getDatabase().prepare(`
    SELECT * FROM transit_reports
    WHERE conversation_id = ? AND level = 'year' AND target_date = ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(input.conversationId, input.targetDate) as TransitReportRow | undefined;
  return row ?? null;
}

export function getAnnualTransitReport(input: {
  conversationId: string;
  targetDate: string;
  engineVersion: string;
  promptVersion: string;
  version?: number;
}): AnnualTransitReport | null {
  const row = getReportRowByIdentity(input);
  if (!row) return null;
  const report = mapAnnualReportRow(row, input.version);
  return typeof input.version === 'number' && report.version !== input.version ? null : report;
}

export function getAnnualTransitReportById(id: string, version?: number): AnnualTransitReport | null {
  const row = getReportRowById(id);
  if (!row) return null;
  const report = mapAnnualReportRow(row, version);
  return typeof version === 'number' && report.version !== version ? null : report;
}

export function getAnnualTransitReportDetail(id: string, version?: number): AnnualTransitReportDetail | null {
  const report = getAnnualTransitReportById(id, version);
  if (!report) return null;
  return { report, versions: listAnnualTransitReportVersions(id) };
}

export function listAnnualTransitReportVersions(reportId: string): AnnualTransitReportVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM transit_report_versions WHERE report_id = ? ORDER BY version DESC
  `).all(reportId) as TransitReportVersionRow[];
  return rows.map(mapVersion);
}

export function getAnnualTransitReportVersion(
  reportId: string,
  version: number,
): AnnualTransitReportVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM transit_report_versions WHERE report_id = ? AND version = ?
  `).get(reportId, version) as TransitReportVersionRow | undefined;
  return row ? mapVersion(row) : null;
}

export function claimAnnualTransitReport(input: {
  conversationId: string;
  snapshotId: string;
  targetDate: string;
  engineVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  regenerate: boolean;
  generationReason?: ReportGenerationReason;
  staleAfterMs: number;
}): { report: AnnualTransitReport; version: AnnualTransitReportVersion; claimed: boolean } {
  const db = getDatabase();
  return db.transaction(() => {
    const exactReportRow = getReportRowByIdentity(input);
    let reportRow = exactReportRow ?? getLatestReportRowBySeries(input);
    const now = Date.now();
    if (!reportRow) {
      const reportId = randomUUID();
      db.prepare(`
        INSERT INTO transit_reports (
          id, conversation_id, snapshot_id, level, target_date, engine_version,
          prompt_version, provider, model, active_version_id, content, status,
          error_code, input_tokens, output_tokens, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, 'year', ?, ?, ?, ?, ?, NULL, '', 'generating',
          NULL, NULL, NULL, ?, ?, NULL)
      `).run(
        reportId,
        input.conversationId,
        input.snapshotId,
        input.targetDate,
        input.engineVersion,
        input.promptVersion,
        input.provider,
        input.model,
        now,
        now,
      );
      reportRow = getReportRowById(reportId)!;
    }

    const active = reportRow.active_version_id
      ? getAnnualTransitReportVersionById(reportRow.active_version_id)
      : null;
    const sourceMatches = active?.snapshotId === input.snapshotId
      && active.engineVersion === input.engineVersion
      && active.promptVersion === input.promptVersion;
    if (active?.status === 'completed' && sourceMatches && !input.regenerate) {
      return {
        report: mapAnnualReportRow(reportRow, active.version),
        version: active,
        claimed: false,
      };
    }

    const latestRow = db.prepare(`
      SELECT * FROM transit_report_versions WHERE report_id = ? ORDER BY version DESC LIMIT 1
    `).get(reportRow.id) as TransitReportVersionRow | undefined;
    if (latestRow?.status === 'generating' && now - latestRow.created_at < input.staleAfterMs) {
      const latest = mapVersion(latestRow);
      return {
        report: mapReport(reportRow, latest, countAnnualVersions(reportRow.id)),
        version: latest,
        claimed: false,
      };
    }

    const versionId = randomUUID();
    const nextVersion = (latestRow?.version ?? 0) + 1;
    const generationReason = input.generationReason
      ?? (input.regenerate
        ? 'manual_regenerate'
        : active?.promptVersion !== input.promptVersion
          ? 'template_upgraded'
          : active
            ? 'source_changed'
            : 'initial_generation');
    db.prepare(`
      INSERT INTO transit_report_versions (
        id, report_id, version, snapshot_id, engine_version, prompt_version,
        provider, model, generation_reason, base_version_id, content, status,
        error_code, input_tokens, output_tokens, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'generating',
        NULL, NULL, NULL, ?, NULL)
    `).run(
      versionId,
      reportRow.id,
      nextVersion,
      input.snapshotId,
      input.engineVersion,
      input.promptVersion,
      input.provider,
      input.model,
      generationReason,
      active?.id ?? null,
      now,
    );
    db.prepare(`
      UPDATE transit_reports
      SET snapshot_id = ?, provider = ?, model = ?, status = 'generating',
          error_code = NULL, updated_at = ?
      WHERE id = ?
    `).run(input.snapshotId, input.provider, input.model, now, reportRow.id);

    reportRow = getReportRowById(reportRow.id)!;
    const version = getAnnualTransitReportVersionById(versionId)!;
    const generatingReport = mapReport(reportRow, version, countAnnualVersions(reportRow.id));
    return {
      report: {
        ...generatingReport,
        content: active?.content ?? reportRow.content,
      },
      version,
      claimed: true,
    };
  })();
}

export function completeAnnualTransitReportVersion(
  versionId: string,
  input: { content: string; inputTokens: number | null; outputTokens: number | null },
): AnnualTransitReport | null {
  const db = getDatabase();
  return db.transaction(() => {
    const version = getAnnualTransitReportVersionById(versionId);
    if (!version) return null;
    const now = Date.now();
    db.prepare(`
      UPDATE transit_report_versions
      SET content = ?, status = 'completed', error_code = NULL,
          input_tokens = ?, output_tokens = ?, completed_at = ?
      WHERE id = ?
    `).run(input.content, input.inputTokens, input.outputTokens, now, versionId);
    db.prepare(`
      UPDATE transit_reports
      SET snapshot_id = ?, engine_version = ?, prompt_version = ?, provider = ?, model = ?,
          active_version_id = ?, content = ?, status = 'completed', error_code = NULL,
          input_tokens = ?, output_tokens = ?, updated_at = ?, completed_at = ?
      WHERE id = ?
    `).run(
      version.snapshotId,
      version.engineVersion,
      version.promptVersion,
      version.provider,
      version.model,
      versionId,
      input.content,
      input.inputTokens,
      input.outputTokens,
      now,
      now,
      version.reportId,
    );
    return getAnnualTransitReportById(version.reportId);
  })();
}

export function failAnnualTransitReportVersion(
  versionId: string,
  errorCode: string,
): AnnualTransitReport | null {
  const db = getDatabase();
  return db.transaction(() => {
    const version = getAnnualTransitReportVersionById(versionId);
    if (!version) return null;
    const now = Date.now();
    const safeError = errorCode.slice(0, 120);
    db.prepare(`
      UPDATE transit_report_versions
      SET status = 'failed', error_code = ?, completed_at = ? WHERE id = ?
    `).run(safeError, now, versionId);
    const row = getReportRowById(version.reportId)!;
    const active = row.active_version_id
      ? getAnnualTransitReportVersionById(row.active_version_id)
      : null;
    if (active?.status === 'completed') {
      db.prepare(`
        UPDATE transit_reports
        SET status = 'completed', error_code = NULL, updated_at = ? WHERE id = ?
      `).run(now, version.reportId);
    } else {
      db.prepare(`
        UPDATE transit_reports
        SET status = 'failed', error_code = ?, updated_at = ? WHERE id = ?
      `).run(safeError, now, version.reportId);
    }
    return getAnnualTransitReportById(version.reportId);
  })();
}

/** 兼容旧调用：完成当前报告最新的生成中版本。 */
export function completeAnnualTransitReport(
  reportId: string,
  input: { content: string; inputTokens: number | null; outputTokens: number | null },
): AnnualTransitReport | null {
  const row = getDatabase().prepare(`
    SELECT id FROM transit_report_versions
    WHERE report_id = ? AND status = 'generating'
    ORDER BY version DESC LIMIT 1
  `).get(reportId) as { id: string } | undefined;
  return row ? completeAnnualTransitReportVersion(row.id, input) : null;
}

/** 兼容旧调用：标记当前报告最新的生成中版本失败。 */
export function failAnnualTransitReport(
  reportId: string,
  errorCode: string,
): AnnualTransitReport | null {
  const row = getDatabase().prepare(`
    SELECT id FROM transit_report_versions
    WHERE report_id = ? AND status = 'generating'
    ORDER BY version DESC LIMIT 1
  `).get(reportId) as { id: string } | undefined;
  return row ? failAnnualTransitReportVersion(row.id, errorCode) : null;
}

function getAnnualTransitReportVersionById(id: string): AnnualTransitReportVersion | null {
  const row = getDatabase().prepare('SELECT * FROM transit_report_versions WHERE id = ?')
    .get(id) as TransitReportVersionRow | undefined;
  return row ? mapVersion(row) : null;
}

function mapAnnualReportRow(row: TransitReportRow, versionNumber?: number): AnnualTransitReport {
  const versions = listAnnualTransitReportVersions(row.id);
  const selected = typeof versionNumber === 'number'
    ? versions.find(item => item.version === versionNumber) ?? null
    : row.active_version_id
      ? versions.find(item => item.id === row.active_version_id) ?? null
      : versions[0] ?? null;
  return mapReport(row, selected, versions.length);
}

function countAnnualVersions(reportId: string): number {
  const row = getDatabase().prepare(`
    SELECT COUNT(*) AS count FROM transit_report_versions WHERE report_id = ?
  `).get(reportId) as { count: number };
  return row.count;
}
