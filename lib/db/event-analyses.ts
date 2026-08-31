import { randomUUID } from 'node:crypto';
import type {
  EventAnalysis,
  EventAnalysisDetail,
  EventAnalysisEvidence,
  EventAnalysisEvidenceDraft,
  EventAnalysisSectionKey,
  EventAnalysisVersion,
} from '@/lib/events/analysis-types';
import type {
  ReportContent,
  ReportGenerationReason,
  ReportVersionStatus,
} from '@/lib/reports/types';
import { getDatabase } from './client';

interface EventAnalysisRow {
  id: string;
  event_id: string;
  conversation_id: string;
  active_version_id: string | null;
  created_at: number;
  updated_at: number;
}

interface EventAnalysisVersionRow {
  id: string;
  analysis_id: string;
  version: number;
  source_fingerprint: string;
  engine_version: string;
  prompt_version: string;
  provider: string;
  model: string;
  generation_reason: ReportGenerationReason;
  base_version_id: string | null;
  content_json: string | null;
  status: ReportVersionStatus;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
  completed_at: number | null;
}

interface EventAnalysisEvidenceRow {
  id: string;
  analysis_version_id: string;
  section_key: EventAnalysisSectionKey;
  evidence_key: string;
  kind: EventAnalysisEvidence['kind'];
  label: string;
  source: EventAnalysisEvidence['source'];
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

function mapAnalysis(row: EventAnalysisRow): EventAnalysis {
  return {
    id: row.id,
    eventId: row.event_id,
    conversationId: row.conversation_id,
    activeVersionId: row.active_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: EventAnalysisVersionRow): EventAnalysisVersion {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    version: row.version,
    sourceFingerprint: row.source_fingerprint,
    engineVersion: row.engine_version,
    promptVersion: row.prompt_version,
    provider: row.provider,
    model: row.model,
    generationReason: row.generation_reason,
    baseVersionId: row.base_version_id,
    content: parseJson<ReportContent>(row.content_json),
    status: row.status,
    errorCode: row.error_code,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapEvidence(row: EventAnalysisEvidenceRow): EventAnalysisEvidence {
  return {
    id: row.id,
    analysisVersionId: row.analysis_version_id,
    sectionKey: row.section_key,
    evidenceKey: row.evidence_key,
    kind: row.kind,
    label: row.label,
    source: row.source,
    facts: parseJson<Record<string, unknown>>(row.facts_json) ?? {},
    createdAt: row.created_at,
  };
}

export function getOrCreateEventAnalysis(eventId: string, conversationId: string): EventAnalysis {
  const existing = getEventAnalysisByEventId(eventId);
  if (existing) return existing;
  const id = randomUUID();
  const now = Date.now();
  getDatabase().prepare(`
    INSERT INTO event_ai_analyses (
      id, event_id, conversation_id, active_version_id, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?)
  `).run(id, eventId, conversationId, now, now);
  return getEventAnalysis(id)!;
}

export function getEventAnalysis(id: string): EventAnalysis | null {
  const row = getDatabase().prepare('SELECT * FROM event_ai_analyses WHERE id = ?')
    .get(id) as EventAnalysisRow | undefined;
  return row ? mapAnalysis(row) : null;
}

export function getEventAnalysisByEventId(eventId: string): EventAnalysis | null {
  const row = getDatabase().prepare('SELECT * FROM event_ai_analyses WHERE event_id = ?')
    .get(eventId) as EventAnalysisRow | undefined;
  return row ? mapAnalysis(row) : null;
}

export function listEventAnalyses(conversationId: string): EventAnalysis[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM event_ai_analyses WHERE conversation_id = ? ORDER BY updated_at DESC
  `).all(conversationId) as EventAnalysisRow[];
  return rows.map(mapAnalysis);
}

export function getEventAnalysisVersion(id: string): EventAnalysisVersion | null {
  const row = getDatabase().prepare('SELECT * FROM event_ai_analysis_versions WHERE id = ?')
    .get(id) as EventAnalysisVersionRow | undefined;
  return row ? mapVersion(row) : null;
}

export function getEventAnalysisVersionByNumber(
  analysisId: string,
  version: number,
): EventAnalysisVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM event_ai_analysis_versions WHERE analysis_id = ? AND version = ?
  `).get(analysisId, version) as EventAnalysisVersionRow | undefined;
  return row ? mapVersion(row) : null;
}

export function listEventAnalysisVersions(analysisId: string): EventAnalysisVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM event_ai_analysis_versions WHERE analysis_id = ? ORDER BY version DESC
  `).all(analysisId) as EventAnalysisVersionRow[];
  return rows.map(mapVersion);
}

export function getEventAnalysisDetail(
  eventId: string,
  currentSourceFingerprint: string,
  versionNumber?: number,
): EventAnalysisDetail | null {
  const analysis = getEventAnalysisByEventId(eventId);
  if (!analysis) return null;
  const versions = listEventAnalysisVersions(analysis.id);
  const version = typeof versionNumber === 'number'
    ? getEventAnalysisVersionByNumber(analysis.id, versionNumber)
    : analysis.activeVersionId
      ? getEventAnalysisVersion(analysis.activeVersionId)
      : versions[0] ?? null;
  return {
    analysis,
    version,
    versions,
    evidence: version ? listEventAnalysisEvidence(version.id) : [],
    currentSourceFingerprint,
    isStale: Boolean(version?.status === 'completed' && version.sourceFingerprint !== currentSourceFingerprint),
  };
}

export function claimEventAnalysisVersion(input: {
  analysisId: string;
  sourceFingerprint: string;
  engineVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  regenerate: boolean;
  staleAfterMs: number;
}): { version: EventAnalysisVersion; claimed: boolean } {
  const db = getDatabase();
  return db.transaction(() => {
    const analysis = getEventAnalysis(input.analysisId);
    if (!analysis) throw new Error('事件回溯分析不存在');
    const active = analysis.activeVersionId
      ? getEventAnalysisVersion(analysis.activeVersionId)
      : null;
    const sourceMatches = active?.sourceFingerprint === input.sourceFingerprint;
    const templateMatches = active?.engineVersion === input.engineVersion
      && active?.promptVersion === input.promptVersion;
    if (active?.status === 'completed' && sourceMatches && templateMatches && !input.regenerate) {
      return { version: active, claimed: false };
    }

    const latest = db.prepare(`
      SELECT * FROM event_ai_analysis_versions
      WHERE analysis_id = ? ORDER BY version DESC LIMIT 1
    `).get(input.analysisId) as EventAnalysisVersionRow | undefined;
    const now = Date.now();
    if (latest?.status === 'generating' && now - latest.created_at < input.staleAfterMs) {
      return { version: mapVersion(latest), claimed: false };
    }

    const generationReason: ReportGenerationReason = input.regenerate
      ? 'manual_regenerate'
      : active && !sourceMatches
        ? 'source_changed'
        : active && !templateMatches
          ? 'template_upgraded'
          : 'initial_generation';
    const id = randomUUID();
    db.prepare(`
      INSERT INTO event_ai_analysis_versions (
        id, analysis_id, version, source_fingerprint, engine_version,
        prompt_version, provider, model, generation_reason, base_version_id,
        content_json, status, error_code, input_tokens, output_tokens,
        created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'generating', NULL, NULL, NULL, ?, NULL)
    `).run(
      id,
      input.analysisId,
      (latest?.version ?? 0) + 1,
      input.sourceFingerprint,
      input.engineVersion,
      input.promptVersion,
      input.provider,
      input.model,
      generationReason,
      active?.id ?? null,
      now,
    );
    db.prepare('UPDATE event_ai_analyses SET updated_at = ? WHERE id = ?')
      .run(now, input.analysisId);
    return { version: getEventAnalysisVersion(id)!, claimed: true };
  })();
}

export function completeEventAnalysisVersion(input: {
  versionId: string;
  content: ReportContent;
  evidenceBySection: Array<{
    sectionKey: EventAnalysisSectionKey;
    evidence: EventAnalysisEvidenceDraft[];
  }>;
  inputTokens: number | null;
  outputTokens: number | null;
}): EventAnalysisVersion | null {
  const db = getDatabase();
  return db.transaction(() => {
    const version = getEventAnalysisVersion(input.versionId);
    if (!version) return null;
    const now = Date.now();
    db.prepare(`
      UPDATE event_ai_analysis_versions
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
    db.prepare('DELETE FROM event_ai_analysis_evidence WHERE analysis_version_id = ?')
      .run(input.versionId);
    const insert = db.prepare(`
      INSERT INTO event_ai_analysis_evidence (
        id, analysis_version_id, section_key, evidence_key, kind,
        label, source, facts_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    input.evidenceBySection.forEach(group => group.evidence.forEach(evidence => {
      insert.run(
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
    }));
    db.prepare(`
      UPDATE event_ai_analyses SET active_version_id = ?, updated_at = ? WHERE id = ?
    `).run(input.versionId, now, version.analysisId);
    return getEventAnalysisVersion(input.versionId);
  })();
}

export function failEventAnalysisVersion(
  versionId: string,
  errorCode: string,
): EventAnalysisVersion | null {
  getDatabase().prepare(`
    UPDATE event_ai_analysis_versions
    SET status = 'failed', error_code = ?, completed_at = ? WHERE id = ?
  `).run(errorCode.slice(0, 200), Date.now(), versionId);
  return getEventAnalysisVersion(versionId);
}

export function listEventAnalysisEvidence(versionId: string): EventAnalysisEvidence[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM event_ai_analysis_evidence
    WHERE analysis_version_id = ?
    ORDER BY section_key, created_at, evidence_key
  `).all(versionId) as EventAnalysisEvidenceRow[];
  return rows.map(mapEvidence);
}
