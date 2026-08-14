import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-events-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, deleteConversation } = await import('../lib/db/conversations');
  const { createLifeEventWithTransits, getEventYears, updateLifeEventWithTransits } = await import('../lib/events/service');
  const { deleteLifeEvent, getLifeEvent, listLifeEvents } = await import('../lib/db/events');
  const { parseLifeEventInput } = await import('../lib/events/validation');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const birthInfo = { year: 1990, month: 6, day: 15, hour: 4, gender: 'male' as const };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({ type: 'chart', title: '人生事件测试', birthInfo, chartSnapshot: chart });

    const yearInput = parseLifeEventInput({
      title: '第一次正式工作',
      category: 'career',
      datePrecision: 'year',
      startDate: '2012',
      impactLevel: 4,
      description: '进入第一家公司',
    });
    const workEvent = createLifeEventWithTransits(conversation.id, yearInput);
    assert.equal(workEvent.confirmedByUser, true);
    assert.equal(workEvent.transitLinks.length, 1);
    assert.equal(workEvent.transitLinks[0].targetDate, '2012');
    assert.equal(workEvent.transitLinks[0].snapshot.selectedYear, 2012);
    assert.equal(workEvent.transitLinks[0].relationship, 'occurs_in');

    const rangeInput = parseLifeEventInput({
      title: '长期异地工作',
      category: 'relocation',
      datePrecision: 'range',
      startDate: '2018-03-12',
      endDate: '2020-08-20',
      impactLevel: 5,
    });
    const rangeEvent = createLifeEventWithTransits(conversation.id, rangeInput);
    assert.deepEqual(getEventYears(rangeEvent), [2018, 2019, 2020]);
    assert.deepEqual(
      rangeEvent.transitLinks.map(link => link.relationship),
      ['starts_in', 'continues_in', 'ends_in'],
    );

    const unknownInput = parseLifeEventInput({
      title: '童年重要经历',
      category: 'family',
      datePrecision: 'unknown',
      startDate: '',
      impactLevel: 3,
    });
    const unknownEvent = createLifeEventWithTransits(conversation.id, unknownInput);
    assert.equal(unknownEvent.transitLinks.length, 0);

    const updated = updateLifeEventWithTransits(conversation.id, workEvent.id, parseLifeEventInput({
      title: '第一次正式工作（修正）',
      category: 'career',
      datePrecision: 'month',
      startDate: '2013-07',
      impactLevel: 4,
    }));
    assert.equal(updated?.startDate, '2013-07');
    assert.equal(updated?.transitLinks[0].targetDate, '2013');
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM event_transit_links WHERE event_id = ?').get(workEvent.id) as { count: number }).count,
      1,
      '修改日期后旧关联必须被替换',
    );

    assert.equal(listLifeEvents({ conversationId: conversation.id }).length, 3);
    assert.equal(listLifeEvents({ conversationId: conversation.id, category: 'career' }).length, 1);
    assert.equal(listLifeEvents({ conversationId: conversation.id, year: 2019 }).length, 1);

    assert.throws(() => parseLifeEventInput({
      title: '错误日期',
      category: 'health',
      datePrecision: 'day',
      startDate: '2020-02-30',
      impactLevel: 2,
    }), /日期/);
    assert.throws(() => parseLifeEventInput({
      title: '未命名自定义类型',
      category: 'custom',
      datePrecision: 'year',
      startDate: '2020',
      impactLevel: 2,
    }), /自定义事件类型/);
    const countBeforeInvalidYear = listLifeEvents({ conversationId: conversation.id }).length;
    assert.throws(() => createLifeEventWithTransits(conversation.id, parseLifeEventInput({
      title: '出生前事件',
      category: 'family',
      datePrecision: 'year',
      startDate: '1980',
      impactLevel: 2,
    })), /事件年份必须/);
    assert.equal(
      listLifeEvents({ conversationId: conversation.id }).length,
      countBeforeInvalidYear,
      '年份越界时不能先写入事件再报错',
    );

    assert.equal(deleteLifeEvent(rangeEvent.id), true);
    assert.equal(getLifeEvent(rangeEvent.id), null);
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM event_transit_links WHERE event_id = ?').get(rangeEvent.id) as { count: number }).count,
      0,
      '删除事件后关联必须级联删除',
    );

    const migration = getDatabase().prepare('SELECT version FROM schema_migrations WHERE version = 5').get();
    assert.ok(migration, '数据库第 5 版迁移必须存在');
    assert.equal(deleteConversation(conversation.id), true);
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM life_events WHERE conversation_id = ?').get(conversation.id) as { count: number }).count,
      0,
      '删除会话后事件必须级联删除',
    );

    console.log('人生事件测试通过：日期精度、CRUD、年度关联、范围关系、筛选及级联删除均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
