import type { RectificationSelection } from '@/lib/rectification/types';
import { getDatabase } from './client';

interface RectificationSelectionRow {
  id: string;
  session_id: string;
  candidate_id: string;
  evaluation_id: string;
  evaluation_version: number;
  rank: number;
  relative_evidence_index: number;
  confidence: RectificationSelection['confidence'];
  stable: number;
  acknowledged_limitations: number;
  note: string | null;
  created_at: number;
}

function mapSelection(row: RectificationSelectionRow): RectificationSelection {
  return {
    id: row.id,
    sessionId: row.session_id,
    candidateId: row.candidate_id,
    evaluationId: row.evaluation_id,
    evaluationVersion: row.evaluation_version,
    rank: row.rank,
    relativeEvidenceIndex: row.relative_evidence_index,
    confidence: row.confidence,
    stable: row.stable === 1,
    acknowledgedLimitations: row.acknowledged_limitations === 1,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function insertRectificationSelection(selection: RectificationSelection): RectificationSelection {
  const db = getDatabase();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO rectification_selections (
        id, session_id, candidate_id, evaluation_id, evaluation_version,
        rank, relative_evidence_index, confidence, stable,
        acknowledged_limitations, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      selection.id,
      selection.sessionId,
      selection.candidateId,
      selection.evaluationId,
      selection.evaluationVersion,
      selection.rank,
      selection.relativeEvidenceIndex,
      selection.confidence,
      selection.stable ? 1 : 0,
      selection.acknowledgedLimitations ? 1 : 0,
      selection.note,
      selection.createdAt,
    );
    db.prepare(`
      UPDATE rectification_sessions
      SET selected_candidate_id = ?, status = 'confirmed', updated_at = ?
      WHERE id = ?
    `).run(selection.candidateId, selection.createdAt, selection.sessionId);
  })();
  return selection;
}

export function listRectificationSelections(sessionId: string): RectificationSelection[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM rectification_selections
    WHERE session_id = ? ORDER BY created_at DESC
  `).all(sessionId) as RectificationSelectionRow[];
  return rows.map(mapSelection);
}
