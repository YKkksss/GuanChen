import type {
  RectificationCandidateEventFact,
  RectificationEventEvidence,
  RectificationEventSnapshot,
  RectificationEventWithFacts,
  RectificationEventYearRelationship,
} from '@/lib/rectification/types';
import { getDatabase } from './client';

interface RectificationEventRow {
  id: string;
  session_id: string;
  life_event_id: string | null;
  deduplication_key: string;
  event_snapshot_json: string;
  evidence_quality: RectificationEventEvidence['evidenceQuality'];
  user_confirmed: number;
  score_eligible: number;
  methodology_version: string;
  source_event_updated_at: number | null;
  created_at: number;
  updated_at: number;
}

interface RectificationCandidateEventFactRow {
  id: string;
  session_event_id: string;
  candidate_id: string;
  event_year: number;
  relationship: RectificationEventYearRelationship;
  candidate_chart_fingerprint: string;
  transit_engine_version: string;
  methodology_version: string;
  input_fingerprint: string;
  snapshot_json: string;
  created_at: number;
  updated_at: number;
}

function mapEvent(row: RectificationEventRow): RectificationEventEvidence {
  return {
    id: row.id,
    sessionId: row.session_id,
    lifeEventId: row.life_event_id,
    deduplicationKey: row.deduplication_key,
    snapshot: JSON.parse(row.event_snapshot_json) as RectificationEventSnapshot,
    evidenceQuality: row.evidence_quality,
    userConfirmed: Boolean(row.user_confirmed),
    scoreEligible: Boolean(row.score_eligible),
    methodologyVersion: row.methodology_version,
    sourceEventUpdatedAt: row.source_event_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFact(row: RectificationCandidateEventFactRow): RectificationCandidateEventFact {
  return {
    id: row.id,
    sessionEventId: row.session_event_id,
    candidateId: row.candidate_id,
    eventYear: row.event_year,
    relationship: row.relationship,
    candidateChartFingerprint: row.candidate_chart_fingerprint,
    transitEngineVersion: row.transit_engine_version,
    methodologyVersion: row.methodology_version,
    inputFingerprint: row.input_fingerprint,
    snapshot: JSON.parse(row.snapshot_json) as RectificationCandidateEventFact['snapshot'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertRectificationEventWithFacts(input: {
  event: RectificationEventEvidence;
  facts: RectificationCandidateEventFact[];
}): RectificationEventWithFacts {
  const db = getDatabase();
  const insertEvent = db.prepare(`
    INSERT INTO rectification_event_evidence (
      id, session_id, life_event_id, deduplication_key, event_snapshot_json,
      evidence_quality, user_confirmed, score_eligible, methodology_version,
      source_event_updated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFact = db.prepare(`
    INSERT INTO rectification_candidate_event_facts (
      id, session_event_id, candidate_id, event_year, relationship,
      candidate_chart_fingerprint, transit_engine_version, methodology_version,
      input_fingerprint, snapshot_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    const event = input.event;
    insertEvent.run(
      event.id, event.sessionId, event.lifeEventId, event.deduplicationKey,
      JSON.stringify(event.snapshot), event.evidenceQuality, event.userConfirmed ? 1 : 0,
      event.scoreEligible ? 1 : 0, event.methodologyVersion, event.sourceEventUpdatedAt,
      event.createdAt, event.updatedAt,
    );
    for (const fact of input.facts) {
      insertFact.run(
        fact.id, fact.sessionEventId, fact.candidateId, fact.eventYear, fact.relationship,
        fact.candidateChartFingerprint, fact.transitEngineVersion, fact.methodologyVersion,
        fact.inputFingerprint, JSON.stringify(fact.snapshot), fact.createdAt, fact.updatedAt,
      );
    }
    db.prepare('UPDATE rectification_sessions SET updated_at = ? WHERE id = ?')
      .run(event.updatedAt, event.sessionId);
  })();
  return getRectificationEvent(input.event.sessionId, input.event.id)!;
}

export function getRectificationEvent(sessionId: string, eventId: string): RectificationEventWithFacts | null {
  const row = getDatabase().prepare(`
    SELECT * FROM rectification_event_evidence WHERE id = ? AND session_id = ?
  `).get(eventId, sessionId) as RectificationEventRow | undefined;
  if (!row) return null;
  return { ...mapEvent(row), facts: listFacts(eventId) };
}

export function findRectificationEventByDeduplicationKey(
  sessionId: string,
  deduplicationKey: string,
): RectificationEventEvidence | null {
  const row = getDatabase().prepare(`
    SELECT * FROM rectification_event_evidence
    WHERE session_id = ? AND deduplication_key = ?
  `).get(sessionId, deduplicationKey) as RectificationEventRow | undefined;
  return row ? mapEvent(row) : null;
}

export function listRectificationEvents(sessionId: string): RectificationEventWithFacts[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM rectification_event_evidence
    WHERE session_id = ? ORDER BY created_at ASC
  `).all(sessionId) as RectificationEventRow[];
  return rows.map(row => ({ ...mapEvent(row), facts: listFacts(row.id) }));
}

export function updateRectificationEventEvidence(input: {
  sessionId: string;
  eventId: string;
  evidenceQuality: RectificationEventEvidence['evidenceQuality'];
  userConfirmed: boolean;
  scoreEligible: boolean;
}): RectificationEventWithFacts | null {
  const db = getDatabase();
  const now = Date.now();
  const result = db.prepare(`
    UPDATE rectification_event_evidence
    SET evidence_quality = ?, user_confirmed = ?, score_eligible = ?, updated_at = ?
    WHERE id = ? AND session_id = ?
  `).run(
    input.evidenceQuality,
    input.userConfirmed ? 1 : 0,
    input.scoreEligible ? 1 : 0,
    now,
    input.eventId,
    input.sessionId,
  );
  if (!result.changes) return null;
  db.prepare('UPDATE rectification_sessions SET updated_at = ? WHERE id = ?').run(now, input.sessionId);
  return getRectificationEvent(input.sessionId, input.eventId);
}

export function deleteRectificationEvent(sessionId: string, eventId: string): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    DELETE FROM rectification_event_evidence WHERE id = ? AND session_id = ?
  `).run(eventId, sessionId);
  if (result.changes) {
    db.prepare('UPDATE rectification_sessions SET updated_at = ? WHERE id = ?')
      .run(Date.now(), sessionId);
  }
  return result.changes > 0;
}

function listFacts(sessionEventId: string): RectificationCandidateEventFact[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM rectification_candidate_event_facts
    WHERE session_event_id = ? ORDER BY event_year ASC, candidate_id ASC
  `).all(sessionEventId) as RectificationCandidateEventFactRow[];
  return rows.map(mapFact);
}
