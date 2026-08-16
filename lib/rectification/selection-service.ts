import { randomUUID } from 'node:crypto';
import { getRectificationEvaluation } from '@/lib/db/rectification-evaluations';
import {
  insertRectificationSelection,
  listRectificationSelections,
} from '@/lib/db/rectification-selections';
import { getRectificationSession } from '@/lib/db/rectifications';
import { buildEvaluationInputFingerprint } from './evaluation-service';
import { findRectificationEventMatrix } from './event-service';
import type {
  RectificationSelection,
  SelectRectificationCandidateInput,
} from './types';

export function selectRectificationCandidate(
  sessionId: string,
  input: SelectRectificationCandidateInput,
): RectificationSelection {
  const session = getRectificationSession(sessionId);
  if (!session) throw new Error('校时会话不存在');
  const candidate = session.candidates.find(item => item.id === input.candidateId);
  if (!candidate) throw new Error('候选命盘不属于该校时会话');
  if (candidate.duplicateOfCandidateId) {
    throw new Error('该时段与另一候选命盘完全相同，请选择对应的主候选');
  }
  const evaluation = getRectificationEvaluation(input.evaluationId);
  if (!evaluation || evaluation.sessionId !== sessionId) throw new Error('评估版本不属于该校时会话');
  const currentFingerprint = buildEvaluationInputFingerprint(
    session,
    findRectificationEventMatrix(sessionId),
  );
  if (evaluation.inputFingerprint !== currentFingerprint) {
    throw new Error('事件证据已经变化，请重新评估后再选定工作命盘');
  }
  const candidateEvaluation = evaluation.candidates.find(item => item.candidateId === candidate.id);
  if (!candidateEvaluation) throw new Error('评估版本中缺少该候选命盘');
  const limitationsExist = candidateEvaluation.confidence === 'low'
    || !evaluation.stable
    || candidateEvaluation.tiedForRank
    || !evaluation.readiness.meetsRecommended;
  if (limitationsExist && input.acknowledgedLimitations !== true) {
    throw new Error('当前结论存在证据限制，选定前必须确认已阅读限制说明');
  }
  const note = cleanOptionalNote(input.note);
  return insertRectificationSelection({
    id: randomUUID(),
    sessionId,
    candidateId: candidate.id,
    evaluationId: evaluation.id,
    evaluationVersion: evaluation.version,
    rank: candidateEvaluation.rank,
    relativeEvidenceIndex: candidateEvaluation.relativeEvidenceIndex,
    confidence: candidateEvaluation.confidence,
    stable: evaluation.stable,
    acknowledgedLimitations: input.acknowledgedLimitations === true,
    note,
    createdAt: Date.now(),
  });
}

export function findRectificationSelections(sessionId: string): RectificationSelection[] {
  if (!getRectificationSession(sessionId)) throw new Error('校时会话不存在');
  return listRectificationSelections(sessionId);
}

function cleanOptionalNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const cleaned = value.trim();
  if (cleaned.length > 500) throw new Error('选定说明不能超过 500 个字符');
  return cleaned;
}
