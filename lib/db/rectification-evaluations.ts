import type { RectificationEvaluation } from '@/lib/rectification/types';
import { getDatabase } from './client';

interface RectificationEvaluationRow {
  id: string;
  session_id: string;
  version: number;
  input_fingerprint: string;
  methodology_version: string;
  evaluation_engine_version: string;
  evaluation_json: string;
  stable: number;
  top_margin_ratio: number | null;
  created_at: number;
}

function mapEvaluation(row: RectificationEvaluationRow): RectificationEvaluation {
  return JSON.parse(row.evaluation_json) as RectificationEvaluation;
}

export function getRectificationEvaluationByInput(input: {
  sessionId: string;
  inputFingerprint: string;
  methodologyVersion: string;
}): RectificationEvaluation | null {
  const row = getDatabase().prepare(`
    SELECT * FROM rectification_evaluations
    WHERE session_id = ? AND input_fingerprint = ? AND methodology_version = ?
  `).get(input.sessionId, input.inputFingerprint, input.methodologyVersion) as RectificationEvaluationRow | undefined;
  return row ? mapEvaluation(row) : null;
}

export function getLatestRectificationEvaluation(sessionId: string): RectificationEvaluation | null {
  const row = getDatabase().prepare(`
    SELECT * FROM rectification_evaluations
    WHERE session_id = ? ORDER BY version DESC LIMIT 1
  `).get(sessionId) as RectificationEvaluationRow | undefined;
  return row ? mapEvaluation(row) : null;
}

export function getRectificationEvaluation(id: string): RectificationEvaluation | null {
  const row = getDatabase().prepare(`
    SELECT * FROM rectification_evaluations WHERE id = ?
  `).get(id) as RectificationEvaluationRow | undefined;
  return row ? mapEvaluation(row) : null;
}

export function listRectificationEvaluations(sessionId: string): RectificationEvaluation[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM rectification_evaluations
    WHERE session_id = ? ORDER BY version DESC
  `).all(sessionId) as RectificationEvaluationRow[];
  return rows.map(mapEvaluation);
}

export function getNextRectificationEvaluationVersion(sessionId: string): number {
  const row = getDatabase().prepare(`
    SELECT COALESCE(MAX(version), 0) + 1 AS version
    FROM rectification_evaluations WHERE session_id = ?
  `).get(sessionId) as { version: number };
  return row.version;
}

export function insertRectificationEvaluation(evaluation: RectificationEvaluation): RectificationEvaluation {
  const db = getDatabase();
  const insertEvaluation = db.prepare(`
    INSERT INTO rectification_evaluations (
      id, session_id, version, input_fingerprint, methodology_version,
      evaluation_engine_version, evaluation_json, stable, top_margin_ratio, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertHit = db.prepare(`
    INSERT INTO rectification_rule_hits (
      id, evaluation_id, session_id, candidate_id, session_event_id,
      life_event_id, category, rule_id, rule_version, outcome,
      raw_weight, adjusted_weight, discriminating, evidence_json,
      methodology_version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateCandidate = db.prepare(`
    UPDATE rectification_candidates
    SET relative_evidence_index = ?, rank = ?, confidence = ?, updated_at = ?
    WHERE id = ? AND session_id = ?
  `);
  db.transaction(() => {
    insertEvaluation.run(
      evaluation.id,
      evaluation.sessionId,
      evaluation.version,
      evaluation.inputFingerprint,
      evaluation.methodologyVersion,
      evaluation.evaluationEngineVersion,
      JSON.stringify(evaluation),
      evaluation.stable ? 1 : 0,
      evaluation.topMarginRatio,
      evaluation.evaluatedAt,
    );
    for (const candidate of evaluation.candidates) {
      updateCandidate.run(
        candidate.relativeEvidenceIndex,
        candidate.rank,
        candidate.confidence,
        evaluation.evaluatedAt,
        candidate.candidateId,
        evaluation.sessionId,
      );
      for (const hit of candidate.ruleHits) {
        insertHit.run(
          hit.id,
          evaluation.id,
          evaluation.sessionId,
          hit.candidateId,
          hit.sessionEventId,
          hit.lifeEventId,
          hit.category,
          hit.ruleId,
          hit.ruleVersion,
          hit.outcome,
          hit.rawWeight,
          hit.adjustedWeight,
          hit.discriminating ? 1 : 0,
          JSON.stringify(hit.evidence),
          hit.methodologyVersion,
          hit.createdAt,
        );
      }
    }
    db.prepare(`
      UPDATE rectification_sessions SET status = 'evaluated', updated_at = ? WHERE id = ?
    `).run(evaluation.evaluatedAt, evaluation.sessionId);
  })();
  return getLatestRectificationEvaluation(evaluation.sessionId)!;
}
