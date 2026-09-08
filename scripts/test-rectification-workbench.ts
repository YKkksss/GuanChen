import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-rectification-workbench-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { getDatabase } = await import('../lib/db/client');
  const { createRectificationSession, findRectificationSession } = await import('../lib/rectification/service');
  const { attachRectificationEvent, reviseRectificationEventEvidence } = await import('../lib/rectification/event-service');
  const { evaluateRectificationSession, findRectificationEvaluationState, findRectificationEvaluationHistory } = await import('../lib/rectification/evaluation-service');
  const {
    findRectificationSelections,
    selectRectificationCandidate,
  } = await import('../lib/rectification/selection-service');

  try {
    const session = createRectificationSession({
      title: 'M5-4 工作台测试',
      baseBirthInfo: { year: 1990, month: 6, day: 15, gender: 'male', longitude: 116.4074 },
      candidateSlotKeys: ['early_zi', 'si', 'late_zi'],
      reportedTimeEvidence: {
        source: 'birth_certificate',
        precision: 'exact',
        reportedStartLocal: '12:00',
        timezoneId: 'Asia/Shanghai',
        longitude: 116.4074,
      },
    });
    const event = attachRectificationEvent(session.id, {
      evidenceQuality: 'documented',
      event: {
        title: '开始工作', category: 'career', startDate: '2015',
        datePrecision: 'year', impactLevel: 4,
      },
    });
    attachRectificationEvent(session.id, {
      evidenceQuality: 'corroborated_memory',
      event: {
        title: '登记结婚', category: 'relationship', startDate: '2018-10',
        datePrecision: 'month', impactLevel: 5,
      },
    });
    const evaluation = evaluateRectificationSession(session.id);
    const candidate = evaluation.candidates.find(item => !(
      session.candidates.find(candidateItem => candidateItem.id === item.candidateId)?.duplicateOfCandidateId
    ))!;

    assert.throws(() => selectRectificationCandidate(session.id, {
      candidateId: candidate.candidateId,
      evaluationId: evaluation.id,
    }), /确认已阅读限制说明/);

    const first = selectRectificationCandidate(session.id, {
      candidateId: candidate.candidateId,
      evaluationId: evaluation.id,
      acknowledgedLimitations: true,
      note: '结合证件时间，暂定为当前工作命盘。',
    });
    assert.equal(first.evaluationVersion, evaluation.version);
    assert.equal(findRectificationSession(session.id)?.selectedCandidateId, candidate.candidateId);
    assert.equal(findRectificationSession(session.id)?.status, 'confirmed');
    assert.equal(findRectificationSelections(session.id).length, 1);

    reviseRectificationEventEvidence({
      sessionId: session.id,
      eventId: event.id,
      evidenceQuality: 'documented',
      userConfirmed: false,
    });
    assert.throws(() => selectRectificationCandidate(session.id, {
      candidateId: candidate.candidateId,
      evaluationId: evaluation.id,
      acknowledgedLimitations: true,
    }), /重新评估/);
    assert.equal(findRectificationSelections(session.id).length, 1, '旧选定记录必须保留');
    const changedEvaluation = evaluateRectificationSession(session.id);
    assert.notEqual(changedEvaluation.id, evaluation.id);
    reviseRectificationEventEvidence({ sessionId: session.id, eventId: event.id, evidenceQuality: 'documented', userConfirmed: true });
    const restored = evaluateRectificationSession(session.id);
    assert.equal(restored.id, evaluation.id, '相同证据复用原评估');
    const state = findRectificationEvaluationState(session.id);
    assert.equal(state.isCurrent, true, '证据恢复后不能永远提示评估过期');
    assert.equal(state.evaluation?.id, restored.id, '读取端与评估端采用同一个输入版本');
    assert.equal(findRectificationEvaluationHistory(session.id).length, 2, '保留两个输入的历史评估');
    selectRectificationCandidate(session.id, { candidateId: candidate.candidateId, evaluationId: restored.id, acknowledgedLimitations: true });
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 12').get());

    console.log('M5-4 工作台后端测试通过：评估版本绑定、限制确认、选定状态、证据失效保护和选择历史均正常。');
  } finally {
    getDatabase().close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
