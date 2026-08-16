import { createHash, randomUUID } from 'node:crypto';
import {
  getLatestRectificationEvaluation,
  getNextRectificationEvaluationVersion,
  getRectificationEvaluationByInput,
  insertRectificationEvaluation,
  listRectificationEvaluations,
} from '@/lib/db/rectification-evaluations';
import { getRectificationSession } from '@/lib/db/rectifications';
import { findRectificationEventMatrix } from './event-service';
import {
  buildRectificationEvaluation,
  RECTIFICATION_EVALUATION_ENGINE_VERSION,
} from './evaluation-engine';
import { RECTIFICATION_METHODOLOGY_VERSION } from './methodology';
import type {
  RectificationEvaluation,
  RectificationEvaluationState,
  RectificationEventMatrix,
  RectificationSessionDetail,
} from './types';

export function evaluateRectificationSession(sessionId: string): RectificationEvaluation {
  const session = getRectificationSession(sessionId);
  if (!session) throw new Error('校时会话不存在');
  if (session.candidates.length < 2) throw new Error('校时评估至少需要两个候选');
  const matrix = findRectificationEventMatrix(sessionId);
  const inputFingerprint = buildEvaluationInputFingerprint(session, matrix);
  const cached = getRectificationEvaluationByInput({
    sessionId,
    inputFingerprint,
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
  });
  if (cached) return cached;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const evaluation = buildRectificationEvaluation({
      id: randomUUID(),
      version: getNextRectificationEvaluationVersion(sessionId),
      inputFingerprint,
      evaluatedAt: Date.now(),
      session,
      matrix,
    });
    try {
      return insertRectificationEvaluation(evaluation);
    } catch (error) {
      const concurrent = getRectificationEvaluationByInput({
        sessionId,
        inputFingerprint,
        methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
      });
      if (concurrent) return concurrent;
      const code = (error as { code?: string }).code ?? '';
      if (!code.startsWith('SQLITE_CONSTRAINT') || attempt === 1) throw error;
    }
  }
  throw new Error('校时评估并发写入失败');
}

export function findLatestRectificationEvaluation(sessionId: string): RectificationEvaluation | null {
  if (!getRectificationSession(sessionId)) throw new Error('校时会话不存在');
  return getLatestRectificationEvaluation(sessionId);
}

export function findRectificationEvaluationState(sessionId: string): RectificationEvaluationState {
  const session = getRectificationSession(sessionId);
  if (!session) throw new Error('校时会话不存在');
  const evaluation = getLatestRectificationEvaluation(sessionId);
  if (!evaluation) return { evaluation: null, isCurrent: false };
  const currentFingerprint = buildEvaluationInputFingerprint(session, findRectificationEventMatrix(sessionId));
  return { evaluation, isCurrent: evaluation.inputFingerprint === currentFingerprint };
}

export function findRectificationEvaluationHistory(sessionId: string): RectificationEvaluation[] {
  if (!getRectificationSession(sessionId)) throw new Error('校时会话不存在');
  return listRectificationEvaluations(sessionId);
}

export function buildEvaluationInputFingerprint(
  session: RectificationSessionDetail,
  matrix: RectificationEventMatrix,
): string {
  const payload = {
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
    evaluationEngineVersion: RECTIFICATION_EVALUATION_ENGINE_VERSION,
    timePolicyVersion: session.timePolicyVersion,
    reportedTimeEvidence: session.reportedTimeEvidence,
    timeConversion: session.timeConversion,
    candidates: [...session.candidates]
      .sort((a, b) => a.engineTimeIndex - b.engineTimeIndex)
      .map(candidate => ({
        id: candidate.id,
        slotKey: candidate.slotKey,
        chartFingerprint: candidate.chartFingerprint,
        duplicateOfCandidateId: candidate.duplicateOfCandidateId,
      })),
    events: [...matrix.events]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(event => ({
        id: event.id,
        deduplicationKey: event.deduplicationKey,
        evidenceQuality: event.evidenceQuality,
        userConfirmed: event.userConfirmed,
        scoreEligible: event.scoreEligible,
        snapshot: event.snapshot,
        factFingerprints: event.facts.map(fact => fact.inputFingerprint).sort(),
      })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
