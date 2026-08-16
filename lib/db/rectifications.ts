import type {
  RectificationCandidate,
  RectificationSession,
  RectificationSessionDetail,
  RectificationSessionListItem,
  RectificationStatus,
  RectificationTimeConversionSnapshot,
  RectificationReportedTimeEvidence,
} from '@/lib/rectification/types';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import { getDatabase } from './client';

interface RectificationSessionRow {
  id: string;
  source_conversation_id: string | null;
  title: string;
  status: RectificationStatus;
  base_birth_info_json: string;
  reported_time_evidence_json: string;
  time_conversion_json: string | null;
  methodology_version: string;
  time_policy_version: string;
  chart_engine_version: string;
  transit_engine_version: string;
  selected_candidate_id: string | null;
  created_at: number;
  updated_at: number;
  candidate_count?: number;
}

interface RectificationCandidateRow {
  id: string;
  session_id: string;
  slot_key: RectificationCandidate['slotKey'];
  branch_index: number;
  engine_time_index: number;
  chart_date: string;
  day_offset: number;
  chart_fingerprint: string;
  chart_snapshot_json: string;
  duplicate_of_candidate_id: string | null;
  relative_evidence_index: number | null;
  rank: number | null;
  confidence: RectificationCandidate['confidence'];
  created_at: number;
  updated_at: number;
}

export interface NewRectificationSessionRecord {
  session: RectificationSession;
  candidates: RectificationCandidate[];
}

function mapSession(row: RectificationSessionRow): RectificationSession {
  return {
    id: row.id,
    sourceConversationId: row.source_conversation_id,
    title: row.title,
    status: row.status,
    baseBirthInfo: JSON.parse(row.base_birth_info_json) as Omit<BirthInfo, 'hour' | 'unknownTime'>,
    reportedTimeEvidence: JSON.parse(row.reported_time_evidence_json) as RectificationReportedTimeEvidence,
    timeConversion: row.time_conversion_json
      ? JSON.parse(row.time_conversion_json) as RectificationTimeConversionSnapshot
      : null,
    methodologyVersion: row.methodology_version,
    timePolicyVersion: row.time_policy_version,
    chartEngineVersion: row.chart_engine_version,
    transitEngineVersion: row.transit_engine_version,
    selectedCandidateId: row.selected_candidate_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCandidate(row: RectificationCandidateRow): RectificationCandidate {
  return {
    id: row.id,
    sessionId: row.session_id,
    slotKey: row.slot_key,
    branchIndex: row.branch_index,
    engineTimeIndex: row.engine_time_index,
    chartDate: row.chart_date,
    dayOffset: row.day_offset,
    chartFingerprint: row.chart_fingerprint,
    chartSnapshot: JSON.parse(row.chart_snapshot_json) as ZiweiChart,
    duplicateOfCandidateId: row.duplicate_of_candidate_id,
    relativeEvidenceIndex: row.relative_evidence_index,
    rank: row.rank,
    confidence: row.confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertRectificationSession(record: NewRectificationSessionRecord): RectificationSessionDetail {
  const db = getDatabase();
  const insertSession = db.prepare(`
    INSERT INTO rectification_sessions (
      id, source_conversation_id, title, status, base_birth_info_json,
      reported_time_evidence_json, time_conversion_json, methodology_version,
      time_policy_version, chart_engine_version, transit_engine_version,
      selected_candidate_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCandidate = db.prepare(`
    INSERT INTO rectification_candidates (
      id, session_id, slot_key, branch_index, engine_time_index,
      chart_date, day_offset, chart_fingerprint, chart_snapshot_json, duplicate_of_candidate_id,
      relative_evidence_index, rank, confidence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const transaction = db.transaction(() => {
    const session = record.session;
    insertSession.run(
      session.id, session.sourceConversationId, session.title, session.status,
      JSON.stringify(session.baseBirthInfo), JSON.stringify(session.reportedTimeEvidence),
      session.timeConversion ? JSON.stringify(session.timeConversion) : null,
      session.methodologyVersion, session.timePolicyVersion, session.chartEngineVersion,
      session.transitEngineVersion, session.selectedCandidateId, session.createdAt, session.updatedAt,
    );
    for (const candidate of record.candidates) {
      insertCandidate.run(
        candidate.id, candidate.sessionId, candidate.slotKey, candidate.branchIndex,
        candidate.engineTimeIndex, candidate.chartDate, candidate.dayOffset,
        candidate.chartFingerprint, JSON.stringify(candidate.chartSnapshot),
        candidate.duplicateOfCandidateId, candidate.relativeEvidenceIndex, candidate.rank,
        candidate.confidence, candidate.createdAt, candidate.updatedAt,
      );
    }
  });
  transaction();
  return getRectificationSession(record.session.id)!;
}

export function getRectificationSession(id: string): RectificationSessionDetail | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM rectification_sessions WHERE id = ?')
    .get(id) as RectificationSessionRow | undefined;
  if (!row) return null;
  const candidateRows = db.prepare(`
    SELECT * FROM rectification_candidates
    WHERE session_id = ? ORDER BY engine_time_index ASC
  `).all(id) as RectificationCandidateRow[];
  return { ...mapSession(row), candidates: candidateRows.map(mapCandidate) };
}

export function listRectificationSessions(input: {
  status?: RectificationStatus;
  sourceConversationId?: string;
  limit?: number;
} = {}): RectificationSessionListItem[] {
  const where: string[] = [];
  const values: Array<string | number> = [];
  if (input.status) {
    where.push('s.status = ?');
    values.push(input.status);
  }
  if (input.sourceConversationId) {
    where.push('s.source_conversation_id = ?');
    values.push(input.sourceConversationId);
  }
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  values.push(limit);
  const rows = getDatabase().prepare(`
    SELECT s.*, COUNT(c.id) AS candidate_count
    FROM rectification_sessions s
    LEFT JOIN rectification_candidates c ON c.session_id = s.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY s.id
    ORDER BY s.updated_at DESC
    LIMIT ?
  `).all(...values) as RectificationSessionRow[];
  return rows.map(row => ({ ...mapSession(row), candidateCount: row.candidate_count ?? 0 }));
}

export function deleteRectificationSession(id: string): boolean {
  return getDatabase().prepare('DELETE FROM rectification_sessions WHERE id = ?').run(id).changes > 0;
}
