import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-reminder-foundation-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation } = await import('../lib/db/conversations');
  const { createLifeEvent, deleteLifeEvent } = await import('../lib/db/events');
  const {
    createReminderRule,
    deleteReminderRule,
    getReminderRule,
    listReminderInstances,
    listReminderRules,
    materializeAllActiveReminders,
    materializeReminderRule,
    setReminderInstanceStatus,
    updateReminderRule,
  } = await import('../lib/db/reminders');
  const {
    buildReminderCandidates,
    getDateKeyInTimezone,
    zonedDateTimeToEpoch,
  } = await import('../lib/reminders/engine');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const timezone = 'Asia/Shanghai';
    const now = zonedDateTimeToEpoch('2026-08-22', 12, 0, timezone);
    assert.equal(getDateKeyInTimezone(now, timezone), '2026-08-22');
    assert.equal(new Date(zonedDateTimeToEpoch('2026-08-25', 9, 30, timezone)).toISOString(), '2026-08-25T01:30:00.000Z');

    const leapBirthday = buildReminderCandidates({
      title: '闰日生日回顾', kind: 'birthday_review', timezone,
      config: { kind: 'birthday_review', leadDays: 0, hour: 9, minute: 0 },
      context: { birthDate: { year: 2000, month: 2, day: 29 } },
      windowStart: '2027-01-01', windowEnd: '2027-12-31',
    });
    assert.equal(leapBirthday[0].scheduledFor, '2027-02-28', '非闰年生日提醒应安全落到二月最后一天');

    const monthEnd = buildReminderCandidates({
      title: '月末提醒', kind: 'custom', timezone,
      config: { kind: 'custom', date: '2026-01-31', recurrence: 'monthly', hour: 8, minute: 0 },
      windowStart: '2026-02-01', windowEnd: '2026-03-31',
    });
    assert.deepEqual(monthEnd.map(item => item.scheduledFor), ['2026-02-28', '2026-03-31']);

    const birthInfo = {
      name: '提醒隐私姓名', year: 1990, month: 5, day: 12, hour: 3,
      gender: 'female' as const, province: '测试省', city: '测试市',
    };
    const conversation = createConversation({
      type: 'chart', title: '提醒测试命盘', birthInfo, chartSnapshot: generateChart(birthInfo),
    });
    const confirmedEvent = createLifeEvent(conversation.id, {
      title: '重要职业事件', category: 'career', startDate: '2016-08-20',
      datePrecision: 'day', impactLevel: 4, confirmedByUser: true,
    });
    const yearOnlyEvent = createLifeEvent(conversation.id, {
      title: '年份事件', category: 'career', startDate: '2018',
      datePrecision: 'year', impactLevel: 3, confirmedByUser: true,
    });

    const monthly = createReminderRule({
      title: '每月复盘', kind: 'monthly_review', timezone,
      config: { kind: 'monthly_review', dayOfMonth: 25, hour: 9, minute: 0 },
    }, now);
    const birthday = createReminderRule({
      title: '生日年度回顾', kind: 'birthday_review', conversationId: conversation.id, timezone,
      config: { kind: 'birthday_review', leadDays: 7, hour: 10, minute: 0 },
    }, now);
    const annual = createReminderRule({
      title: '新流年观察', kind: 'transit_change', conversationId: conversation.id, timezone,
      config: { kind: 'transit_change', level: 'annual', leadDays: 10, hour: 8, minute: 30 },
    }, now);
    const eventRule = createReminderRule({
      title: '职业事件周年回顾', kind: 'event_anniversary', eventId: confirmedEvent.id, timezone,
      config: { kind: 'event_anniversary', leadDays: 3, hour: 9, minute: 0 },
    }, now);
    const custom = createReminderRule({
      title: '一次性待办', kind: 'custom', timezone,
      config: { kind: 'custom', date: '2026-08-20', recurrence: 'none', hour: 9, minute: 0 },
    }, now);

    assert.equal(eventRule.conversationId, conversation.id, '事件规则应自动继承所属命盘会话');
    assert.equal(listReminderRules({ status: 'enabled' }).length, 5);
    assert.ok(listReminderInstances({ ruleId: monthly.id, now }).some(item => item.scheduledFor === '2026-08-25'));
    assert.ok(listReminderInstances({ ruleId: birthday.id, now }).some(item => item.scheduledFor === '2027-05-12'));
    assert.ok(listReminderInstances({ ruleId: annual.id, now }).some(item => item.scheduledFor === '2027-01-01'));
    assert.ok(listReminderInstances({ ruleId: eventRule.id, now }).some(item => item.scheduledFor === '2027-08-20'));

    const dueCustom = listReminderInstances({ ruleId: custom.id, dueOnly: true, now });
    assert.equal(dueCustom.length, 1);
    assert.equal(dueCustom[0].displayStatus, 'due');
    const completed = setReminderInstanceStatus(dueCustom[0].id, 'completed', now)!;
    assert.equal(completed.displayStatus, 'completed');
    assert.equal(listReminderInstances({ ruleId: custom.id, dueOnly: true, now }).length, 0);
    assert.equal(setReminderInstanceStatus(dueCustom[0].id, 'pending', now)?.displayStatus, 'due');

    const beforeCount = listReminderInstances({ ruleId: monthly.id, now }).length;
    materializeReminderRule(monthly.id, { now });
    assert.equal(listReminderInstances({ ruleId: monthly.id, now }).length, beforeCount, '重复生成不能创建重复实例');
    updateReminderRule(monthly.id, {
      config: { kind: 'monthly_review', dayOfMonth: 26, hour: 9, minute: 0 },
    }, now + 1);
    assert.ok(listReminderInstances({ ruleId: monthly.id, status: 'pending', now }).every(item => item.scheduledFor.endsWith('-26')));

    updateReminderRule(custom.id, { status: 'disabled' }, now + 2);
    assert.equal(listReminderInstances({ ruleId: custom.id, dueOnly: true, now }).length, 0, '停用规则不能进入到期列表');
    assert.equal(materializeReminderRule(custom.id, { now }), 0);
    const batch = materializeAllActiveReminders({ now });
    assert.equal(batch.ruleCount, 4);
    assert.deepEqual(batch.errors, []);

    assert.throws(() => createReminderRule({
      title: '无命盘生日提醒', kind: 'birthday_review', timezone,
      config: { kind: 'birthday_review', leadDays: 0, hour: 9, minute: 0 },
    }, now), /单人命盘/);
    assert.throws(() => createReminderRule({
      title: '精度不足的周年提醒', kind: 'event_anniversary', eventId: yearOnlyEvent.id, timezone,
      config: { kind: 'event_anniversary', leadDays: 0, hour: 9, minute: 0 },
    }, now), /日期精度/);
    assert.throws(() => createReminderRule({
      title: '错误配置', kind: 'monthly_review', timezone,
      config: { kind: 'monthly_review', dayOfMonth: 0, hour: 9, minute: 0 },
    }, now), /1 到 31/);

    assert.equal(deleteLifeEvent(confirmedEvent.id), true);
    assert.equal(getReminderRule(eventRule.id), null, '删除来源事件应级联删除周年提醒');
    assert.equal(deleteReminderRule(custom.id), true);
    assert.equal(getReminderRule(custom.id), null);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 21').get());

    console.log('M8-0 提醒基础测试通过：v21 迁移、五类规则、时区计算、实例幂等、状态流转、边界校验和级联删除均正常。');
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
