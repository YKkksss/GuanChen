import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-rectification-evaluation-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { getDatabase } = await import('../lib/db/client');
  const { createRectificationSession, findRectificationSession, removeRectificationSession } = await import('../lib/rectification/service');
  const { attachRectificationEvent, reviseRectificationEventEvidence } = await import('../lib/rectification/event-service');
  const {
    evaluateRectificationSession,
    findRectificationEvaluationState,
    findLatestRectificationEvaluation,
    findRectificationEvaluationHistory,
  } = await import('../lib/rectification/evaluation-service');
  const { RECTIFICATION_METHODOLOGY } = await import('../lib/rectification/methodology');

  try {
    const session = createRectificationSession({
      title: 'M5-3 评分测试',
      baseBirthInfo: {
        year: 1990,
        month: 6,
        day: 15,
        gender: 'male',
        name: '评分测试者',
        longitude: 116.4074,
      },
      candidateSlotKeys: ['early_zi', 'si', 'late_zi'],
      reportedTimeEvidence: {
        source: 'birth_certificate',
        precision: 'exact',
        reportedStartLocal: '12:00',
        reportedEndLocal: '12:00',
        timezoneId: 'Asia/Shanghai',
        longitude: 116.4074,
      },
    });
    assert.equal(session.timeConversion?.slotKey, 'si');

    const career = attachRectificationEvent(session.id, {
      evidenceQuality: 'documented',
      event: {
        title: '开始第一份正式工作',
        category: 'career',
        startDate: '2015',
        datePrecision: 'year',
        impactLevel: 4,
      },
    });
    attachRectificationEvent(session.id, {
      evidenceQuality: 'corroborated_memory',
      event: {
        title: '登记结婚',
        category: 'relationship',
        startDate: '2018-10',
        datePrecision: 'month',
        impactLevel: 5,
      },
    });

    const insufficient = evaluateRectificationSession(session.id);
    assert.equal(insufficient.version, 1);
    assert.equal(insufficient.readiness.meetsMinimum, false);
    assert.equal(insufficient.stable, false);
    assert.ok(insufficient.warnings.some(item => item.includes('留一事件')));
    assert.ok(insufficient.candidates.every(candidate => candidate.confidence === 'low'));
    assert.ok(insufficient.candidates.every(candidate => candidate.leaveOneEventOutTopRate === null));
    assert.ok(insufficient.candidates.every(candidate => candidate.ruleHits.some(hit => (
      hit.ruleId === 'insufficient-event-guard' && hit.outcome === 'insufficient'
    ))));

    const cached = evaluateRectificationSession(session.id);
    assert.equal(cached.id, insufficient.id, '输入未变化时必须复用确定性评估快照');
    assert.equal(cached.version, 1);

    attachRectificationEvent(session.id, {
      evidenceQuality: 'single_person_memory',
      event: {
        title: '大学阶段',
        category: 'education',
        startDate: '2008-09-01',
        endDate: '2011-06-30',
        datePrecision: 'range',
        impactLevel: 4,
      },
    });
    attachRectificationEvent(session.id, {
      evidenceQuality: 'corroborated_memory',
      event: {
        title: '跨城市定居',
        category: 'relocation',
        startDate: '2020-03',
        datePrecision: 'month',
        impactLevel: 4,
      },
    });

    const evaluation = evaluateRectificationSession(session.id);
    assert.equal(evaluation.version, 2);
    assert.notEqual(evaluation.id, insufficient.id);
    assert.equal(evaluation.readiness.meetsMinimum, true);
    assert.equal(evaluation.candidates.length, 3);
    assert.equal(evaluation.evaluationEngineVersion, 'rectification-evaluation-v1');
    assert.equal(evaluation.methodologyVersion, 'rectification-method-v1');
    assert.equal(evaluation.inputFingerprint.length, 64);
    assert.ok(evaluation.discriminatingRuleCount > 0);
    assert.ok(evaluation.topMarginRatio !== null && evaluation.topMarginRatio >= 0);
    assert.ok(evaluation.candidates.every(candidate => candidate.leaveOneEventOutTopRate !== null));
    assert.ok(evaluation.candidates.every(candidate => candidate.confidence !== 'high'));

    const indices = evaluation.candidates.map(candidate => candidate.relativeEvidenceIndex);
    assert.equal(Math.max(...indices), 100);
    assert.equal(Math.min(...indices), 0);
    for (const candidate of evaluation.candidates) {
      assert.ok(Object.values(candidate.eventContributions).every(value => (
        Math.abs(value) <= RECTIFICATION_METHODOLOGY.scorePolicy.perEventAbsoluteCap + 1e-6
      )));
      assert.ok(candidate.ruleHits.every(hit => hit.discriminating || hit.adjustedWeight === 0));
      assert.ok(candidate.ruleHits.every(hit => hit.ruleVersion === 1));
      assert.ok(candidate.ruleHits.every(hit => hit.methodologyVersion === evaluation.methodologyVersion));
    }

    const siCandidateId = session.candidates.find(candidate => candidate.slotKey === 'si')!.id;
    const siEvaluation = evaluation.candidates.find(candidate => candidate.candidateId === siCandidateId)!;
    const siTimeHit = siEvaluation.ruleHits.find(hit => hit.ruleId === 'reported-window-contains')!;
    assert.equal(siTimeHit.outcome, 'support');
    assert.equal(siTimeHit.discriminating, true);
    const otherTimeHits = evaluation.candidates
      .filter(candidate => candidate.candidateId !== siCandidateId)
      .map(candidate => candidate.ruleHits.find(hit => hit.ruleId === 'reported-window-contains')!);
    assert.ok(otherTimeHits.every(hit => hit.outcome === 'conflict'));
    assert.ok(evaluation.candidates.some(candidate => candidate.ruleHits.some(hit => (
      hit.evidence.datePrecision === 'range' && typeof hit.evidence.rangeDecay === 'number'
        && hit.evidence.rangeDecay < 1
    ))));

    const persistedHitCount = getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM rectification_rule_hits WHERE evaluation_id = ?
    `).get(evaluation.id) as { count: number };
    assert.equal(
      persistedHitCount.count,
      evaluation.candidates.reduce((count, candidate) => count + candidate.ruleHits.length, 0),
    );
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 11').get());
    assert.equal(findLatestRectificationEvaluation(session.id)?.id, evaluation.id);
    assert.equal(findRectificationEvaluationState(session.id).isCurrent, true);
    assert.equal(findRectificationSession(session.id)?.status, 'evaluated');
    assert.ok(findRectificationSession(session.id)?.candidates.every(candidate => candidate.rank !== null));

    reviseRectificationEventEvidence({
      sessionId: session.id,
      eventId: career.id,
      evidenceQuality: 'documented',
      userConfirmed: false,
    });
    assert.equal(findRectificationSession(session.id)?.status, 'ready');
    assert.ok(findRectificationSession(session.id)?.candidates.every(candidate => candidate.rank === null));
    assert.equal(findRectificationEvaluationState(session.id).isCurrent, false);
    const changed = evaluateRectificationSession(session.id);
    assert.equal(changed.version, 3);
    assert.notEqual(changed.inputFingerprint, evaluation.inputFingerprint);
    assert.equal(changed.readiness.confirmedEligibleEvents, 3);
    assert.equal(changed.stable, false, '不足四个可评分事件时不能标记稳定');
    assert.equal(findRectificationEvaluationHistory(session.id).length, 3);

    const evaluationId = evaluation.id;
    assert.equal(removeRectificationSession(session.id), true);
    assert.equal((getDatabase().prepare(
      'SELECT COUNT(*) AS count FROM rectification_evaluations WHERE session_id = ?',
    ).get(session.id) as { count: number }).count, 0);
    assert.equal((getDatabase().prepare(
      'SELECT COUNT(*) AS count FROM rectification_rule_hits WHERE evaluation_id = ?',
    ).get(evaluationId) as { count: number }).count, 0);

    const rangeSession = createRectificationSession({
      title: '真太阳时时间范围测试',
      baseBirthInfo: { year: 1990, month: 6, day: 15, gender: 'female', longitude: 116.4074 },
      candidateSlotKeys: ['si', 'wu', 'wei'],
      reportedTimeEvidence: {
        source: 'hospital_record',
        precision: 'range',
        reportedStartLocal: '11:30',
        reportedEndLocal: '12:30',
        timezoneId: 'Asia/Shanghai',
        longitude: 116.4074,
      },
    });
    const rangeEvaluation = evaluateRectificationSession(rangeSession.id);
    const rangeOutcomes = new Map(rangeEvaluation.candidates.map(candidate => [
      rangeSession.candidates.find(item => item.id === candidate.candidateId)!.slotKey,
      candidate.ruleHits.find(hit => hit.ruleId === 'reported-window-contains')!.outcome,
    ]));
    assert.equal(rangeOutcomes.get('si'), 'support');
    assert.equal(rangeOutcomes.get('wu'), 'support');
    assert.equal(rangeOutcomes.get('wei'), 'conflict');
    removeRectificationSession(rangeSession.id);

    console.log('M5-3 校时评估测试通过：规则审计、区分度归零、事件封顶、相对指数、缓存版本、留一稳定性和级联删除均正常。');
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
