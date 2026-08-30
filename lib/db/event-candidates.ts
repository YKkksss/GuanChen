import { randomUUID } from 'node:crypto';
import type {
  LifeEventCandidate,
  LifeEventCandidateDraft,
  LifeEventCandidateStatus,
  LifeEventExtractionRun,
  LifeEventExtractionStatus,
} from '@/lib/events/types';
import { getDatabase } from './client';

interface ExtractionRunRow {
  id: string;
  conversation_id: string;
  source_message_id: string;
  extractor_version: string;
  status: LifeEventExtractionStatus;
  candidate_count: number;
  error_code: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

interface CandidateRow {
  id: string;
  run_id: string;
  conversation_id: string;
  source_message_id: string;
  candidate_key: string;
  extraction_version: string;
  title: string;
  category: LifeEventCandidate['category'];
  custom_category: string | null;
  start_date: string;
  end_date: string | null;
  date_precision: LifeEventCandidate['datePrecision'];
  description: string | null;
  impact_level: LifeEventCandidate['impactLevel'];
  confidence: number;
  source_excerpt: string;
  review_notes_json: string;
  status: LifeEventCandidateStatus;
  confirmed_event_id: string | null;
  created_at: number;
  updated_at: number;
  confirmed_at: number | null;
  dismissed_at: number | null;
}

export function getLifeEventExtractionRun(
  sourceMessageId: string,
  extractorVersion: string,
): LifeEventExtractionRun | null {
  const row = getDatabase().prepare(`
    SELECT * FROM life_event_extraction_runs
    WHERE source_message_id = ? AND extractor_version = ?
  `).get(sourceMessageId, extractorVersion) as ExtractionRunRow | undefined;
  return row ? mapRun(row) : null;
}

export function createLifeEventExtractionRun(input: {
  conversationId: string;
  sourceMessageId: string;
  extractorVersion: string;
}): LifeEventExtractionRun {
  const existing = getLifeEventExtractionRun(input.sourceMessageId, input.extractorVersion);
  if (existing) {
    if (existing.status === 'failed') {
      getDatabase().prepare(`
        UPDATE life_event_extraction_runs
        SET status = 'running', candidate_count = 0, error_code = NULL,
          updated_at = ?, completed_at = NULL
        WHERE id = ?
      `).run(Date.now(), existing.id);
      return getLifeEventExtractionRun(input.sourceMessageId, input.extractorVersion)!;
    }
    return existing;
  }
  const id = randomUUID();
  const now = Date.now();
  getDatabase().prepare(`
    INSERT INTO life_event_extraction_runs (
      id, conversation_id, source_message_id, extractor_version, status,
      candidate_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'running', 0, ?, ?)
  `).run(id, input.conversationId, input.sourceMessageId, input.extractorVersion, now, now);
  return getLifeEventExtractionRun(input.sourceMessageId, input.extractorVersion)!;
}

export function completeLifeEventExtractionRun(input: {
  id: string;
  status: Exclude<LifeEventExtractionStatus, 'running'>;
  candidateCount?: number;
  errorCode?: string | null;
}): LifeEventExtractionRun | null {
  const now = Date.now();
  getDatabase().prepare(`
    UPDATE life_event_extraction_runs
    SET status = ?, candidate_count = ?, error_code = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(input.status, input.candidateCount ?? 0, input.errorCode ?? null, now, now, input.id);
  const row = getDatabase().prepare('SELECT * FROM life_event_extraction_runs WHERE id = ?')
    .get(input.id) as ExtractionRunRow | undefined;
  return row ? mapRun(row) : null;
}

export function insertLifeEventCandidate(input: {
  runId: string;
  conversationId: string;
  sourceMessageId: string;
  candidateKey: string;
  extractionVersion: string;
  draft: LifeEventCandidateDraft;
}): LifeEventCandidate {
  const existing = getDatabase().prepare(`
    SELECT * FROM life_event_candidates
    WHERE source_message_id = ? AND candidate_key = ? AND extraction_version = ?
  `).get(input.sourceMessageId, input.candidateKey, input.extractionVersion) as CandidateRow | undefined;
  if (existing) return mapCandidate(existing);
  const id = randomUUID();
  const now = Date.now();
  getDatabase().prepare(`
    INSERT INTO life_event_candidates (
      id, run_id, conversation_id, source_message_id, candidate_key, extraction_version,
      title, category, custom_category, start_date, end_date, date_precision,
      description, impact_level, confidence, source_excerpt, review_notes_json,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    id, input.runId, input.conversationId, input.sourceMessageId, input.candidateKey, input.extractionVersion,
    input.draft.title, input.draft.category, input.draft.customCategory, input.draft.startDate,
    input.draft.endDate, input.draft.datePrecision, input.draft.description, input.draft.impactLevel,
    input.draft.confidence, input.draft.sourceExcerpt, JSON.stringify(input.draft.reviewNotes), now, now,
  );
  return getLifeEventCandidate(id)!;
}

export function getLifeEventCandidate(id: string): LifeEventCandidate | null {
  const row = getDatabase().prepare('SELECT * FROM life_event_candidates WHERE id = ?')
    .get(id) as CandidateRow | undefined;
  return row ? mapCandidate(row) : null;
}

export function listLifeEventCandidates(input: {
  conversationId: string;
  status?: LifeEventCandidateStatus;
  sourceMessageId?: string;
  limit?: number;
}): LifeEventCandidate[] {
  const clauses = ['conversation_id = ?'];
  const params: Array<string | number> = [input.conversationId];
  if (input.status) {
    clauses.push('status = ?');
    params.push(input.status);
  }
  if (input.sourceMessageId) {
    clauses.push('source_message_id = ?');
    params.push(input.sourceMessageId);
  }
  params.push(Math.min(Math.max(input.limit ?? 50, 1), 200));
  const rows = getDatabase().prepare(`
    SELECT * FROM life_event_candidates
    WHERE ${clauses.join(' AND ')}
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,
      created_at DESC, id ASC
    LIMIT ?
  `).all(...params) as CandidateRow[];
  return rows.map(mapCandidate);
}

export function markLifeEventCandidateConfirmed(
  candidateId: string,
  confirmedEventId: string,
): LifeEventCandidate | null {
  const now = Date.now();
  getDatabase().prepare(`
    UPDATE life_event_candidates
    SET status = 'confirmed', confirmed_event_id = ?, confirmed_at = ?, dismissed_at = NULL, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `).run(confirmedEventId, now, now, candidateId);
  return getLifeEventCandidate(candidateId);
}

export function dismissLifeEventCandidate(
  candidateId: string,
  conversationId: string,
): LifeEventCandidate | null {
  const now = Date.now();
  getDatabase().prepare(`
    UPDATE life_event_candidates
    SET status = 'dismissed', dismissed_at = ?, updated_at = ?
    WHERE id = ? AND conversation_id = ? AND status = 'pending'
  `).run(now, now, candidateId, conversationId);
  return getLifeEventCandidate(candidateId);
}

function mapRun(row: ExtractionRunRow): LifeEventExtractionRun {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sourceMessageId: row.source_message_id,
    extractorVersion: row.extractor_version,
    status: row.status,
    candidateCount: row.candidate_count,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function mapCandidate(row: CandidateRow): LifeEventCandidate {
  let reviewNotes: string[] = [];
  try {
    const parsed = JSON.parse(row.review_notes_json) as unknown;
    if (Array.isArray(parsed)) reviewNotes = parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    reviewNotes = ['候选备注读取失败，请重新核对全部字段'];
  }
  return {
    id: row.id,
    runId: row.run_id,
    conversationId: row.conversation_id,
    sourceMessageId: row.source_message_id,
    candidateKey: row.candidate_key,
    extractionVersion: row.extraction_version,
    title: row.title,
    category: row.category,
    customCategory: row.custom_category,
    startDate: row.start_date,
    endDate: row.end_date,
    datePrecision: row.date_precision,
    description: row.description,
    impactLevel: row.impact_level,
    confidence: row.confidence,
    sourceExcerpt: row.source_excerpt,
    reviewNotes,
    status: row.status,
    confirmedEventId: row.confirmed_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
    dismissedAt: row.dismissed_at,
  };
}
