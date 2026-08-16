import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-rectification-event-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { getDatabase } = await import('../lib/db/client');
  const { createConversation, deleteConversation } = await import('../lib/db/conversations');
  const { deleteLifeEvent } = await import('../lib/db/events');
  const { createLifeEventWithTransits, updateLifeEventWithTransits } = await import('../lib/events/service');
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createRectificationSession, findRectificationSession } = await import('../lib/rectification/service');
  const {
    attachRectificationEvent,
    findRectificationEventMatrix,
    removeRectificationEvent,
    reviseRectificationEventEvidence,
  } = await import('../lib/rectification/event-service');

  try {
    const birthInfo = { year: 1990, month: 6, day: 15, hour: 5, gender: 'male' as const, name: '校时测试者' };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({
      type: 'chart',
      title: '校时来源对话',
      birthInfo,
      chartSnapshot: chart,
    });
    const session = createRectificationSession({
      sourceConversationId: conversation.id,
      title: 'M5-2 事件矩阵测试',
      baseBirthInfo: { year: 1990, month: 6, day: 15, gender: 'male', name: '校时测试者' },
      candidateSlotKeys: ['early_zi', 'si', 'late_zi'],
    });

    const sourceCareer = createLifeEventWithTransits(conversation.id, {
      title: '开始第一份正式工作',
      category: 'career',
      startDate: '2015',
      datePrecision: 'year',
      impactLevel: 4,
      description: '有劳动合同记录',
      confirmedByUser: true,
    });
    const career = attachRectificationEvent(session.id, {
      lifeEventId: sourceCareer.id,
      evidenceQuality: 'documented',
    });
    assert.equal(career.lifeEventId, sourceCareer.id);
    assert.equal(career.scoreEligible, true);
    assert.equal(career.facts.length, 3);
    assert.ok(career.facts.every(fact => fact.eventYear === 2015));
    assert.ok(career.facts.every(fact => fact.snapshot.annualTransit.engineVersion === 'transit-v1-iztro-2.5.8'));
    assert.ok(career.facts.every(fact => fact.snapshot.topicFact.category === 'career'));
    assert.ok(career.facts.every(fact => fact.inputFingerprint.length === 64));

    assert.throws(() => attachRectificationEvent(session.id, {
      event: {
        title: ' 开始第一份正式工作 ',
        category: 'career',
        startDate: '2015',
        datePrecision: 'year',
        impactLevel: 4,
      },
      evidenceQuality: 'single_person_memory',
    }), /已经存在相同事件/);

    const relationship = attachRectificationEvent(session.id, {
      event: {
        title: '登记结婚',
        category: 'relationship',
        startDate: '2018-10',
        datePrecision: 'month',
        impactLevel: 5,
        confirmedByUser: true,
      },
      evidenceQuality: 'corroborated_memory',
    });
    assert.equal(relationship.facts.length, 3);

    const educationRange = attachRectificationEvent(session.id, {
      event: {
        title: '大学阶段',
        category: 'education',
        startDate: '2008-09-01',
        endDate: '2011-06-30',
        datePrecision: 'range',
        impactLevel: 4,
      },
      evidenceQuality: 'single_person_memory',
    });
    assert.equal(educationRange.facts.length, 12);
    assert.deepEqual(
      [...new Set(educationRange.facts.map(fact => fact.relationship))],
      ['starts_in', 'continues_in', 'ends_in'],
    );

    let matrix = findRectificationEventMatrix(session.id);
    assert.equal(matrix.readiness.totalEvents, 3);
    assert.equal(matrix.readiness.confirmedEligibleEvents, 3);
    assert.equal(matrix.readiness.distinctScoreableCategories, 3);
    assert.equal(matrix.readiness.meetsMinimum, true);
    assert.equal(matrix.readiness.meetsRecommended, false);

    const unconfirmed = attachRectificationEvent(session.id, {
      event: {
        title: '一次未确认的财务变化',
        category: 'finance',
        startDate: '2020',
        datePrecision: 'year',
        impactLevel: 3,
        confirmedByUser: false,
      },
      evidenceQuality: 'unconfirmed',
    });
    assert.equal(unconfirmed.scoreEligible, false);
    assert.equal(unconfirmed.facts.length, 3, '未确认事件仍可生成可查看事实，但不得进入评分');

    const unknownDate = attachRectificationEvent(session.id, {
      event: {
        title: '日期不详的家庭事件',
        category: 'family',
        startDate: '',
        datePrecision: 'unknown',
        impactLevel: 3,
      },
      evidenceQuality: 'single_person_memory',
    });
    assert.equal(unknownDate.scoreEligible, false);
    assert.equal(unknownDate.facts.length, 0);
    matrix = findRectificationEventMatrix(session.id);
    assert.ok(matrix.readiness.warnings.some(item => item.includes('未由用户确认')));
    assert.ok(matrix.readiness.warnings.some(item => item.includes('日期不详')));

    assert.equal(reviseRectificationEventEvidence({
      sessionId: session.id,
      eventId: career.id,
      evidenceQuality: 'documented',
      userConfirmed: false,
    })?.scoreEligible, false);
    assert.equal(findRectificationEventMatrix(session.id).readiness.confirmedEligibleEvents, 2);
    assert.equal(reviseRectificationEventEvidence({
      sessionId: session.id,
      eventId: career.id,
      evidenceQuality: 'documented',
      userConfirmed: true,
    })?.scoreEligible, true);

    updateLifeEventWithTransits(conversation.id, sourceCareer.id, {
      title: '来源事件后来被重命名',
      category: 'career',
      startDate: '2015',
      datePrecision: 'year',
      impactLevel: 4,
      confirmedByUser: true,
    });
    assert.equal(findRectificationEventMatrix(session.id).events.find(item => item.id === career.id)?.snapshot.title, '开始第一份正式工作');
    deleteLifeEvent(sourceCareer.id);
    const afterSourceDelete = findRectificationEventMatrix(session.id).events.find(item => item.id === career.id)!;
    assert.equal(afterSourceDelete.lifeEventId, null);
    assert.equal(afterSourceDelete.snapshot.title, '开始第一份正式工作');
    assert.equal(afterSourceDelete.facts.length, 3);

    assert.equal(removeRectificationEvent(session.id, educationRange.id), true);
    const remainingFacts = getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM rectification_candidate_event_facts WHERE session_event_id = ?
    `).get(educationRange.id) as { count: number };
    assert.equal(remainingFacts.count, 0, '移除校时事件时必须级联删除其候选年度事实');

    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 10').get());
    deleteConversation(conversation.id);
    assert.ok(findRectificationSession(session.id), '删除来源对话后校时会话必须继续保留');
    assert.equal(findRectificationSession(session.id)?.sourceConversationId, null);

    console.log('M5-2 校时事件测试通过：证据快照、事件去重、候选年度事实、最低门槛、确认更新及级联策略均正常。');
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
