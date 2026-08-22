import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-reminder-center-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

function shiftDate(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

async function json<T>(response: Response) {
  return await response.json() as T;
}

async function main() {
  const remindersRoute = await import('../app/api/reminders/route');
  const reminderRoute = await import('../app/api/reminders/[id]/route');
  const instancesRoute = await import('../app/api/reminder-instances/route');
  const instanceRoute = await import('../app/api/reminder-instances/[id]/route');
  const materializeRoute = await import('../app/api/reminders/materialize/route');
  const { getDateKeyInTimezone } = await import('../lib/reminders/engine');

  try {
    const today = getDateKeyInTimezone(Date.now(), 'Asia/Shanghai');
    const tomorrow = shiftDate(today, 1);

    const dueCreateResponse = await remindersRoute.POST(new Request('http://local/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '页面契约到期提醒',
        kind: 'custom',
        timezone: 'Asia/Shanghai',
        config: { kind: 'custom', date: today, recurrence: 'none', hour: 0, minute: 0 },
      }),
    }));
    assert.equal(dueCreateResponse.status, 201);
    const dueRule = (await json<{ rule: { id: string } }>(dueCreateResponse)).rule;

    const futureCreateResponse = await remindersRoute.POST(new Request('http://local/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '页面契约未来提醒',
        kind: 'custom',
        timezone: 'Asia/Shanghai',
        config: { kind: 'custom', date: tomorrow, recurrence: 'none', hour: 23, minute: 59 },
      }),
    }));
    assert.equal(futureCreateResponse.status, 201);

    const invalidResponse = await remindersRoute.POST(new Request('http://local/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '错误提醒', kind: 'unknown', config: {} }),
    }));
    assert.equal(invalidResponse.status, 400, '非法类型应返回可展示的表单错误');

    const materializeResponse = await materializeRoute.POST();
    assert.equal(materializeResponse.status, 200);

    const enabledResponse = await remindersRoute.GET(new Request('http://local/api/reminders?status=enabled&limit=100'));
    const enabledData = await json<{ rules: Array<{ id: string }> }>(enabledResponse);
    assert.equal(enabledData.rules.length, 2, '规则管理页应能筛选启用规则');

    const allInstancesResponse = await instancesRoute.GET(new Request('http://local/api/reminder-instances?limit=100'));
    const allInstances = (await json<{ instances: Array<{ id: string; ruleId: string; displayStatus: string }> }>(allInstancesResponse)).instances;
    assert.equal(allInstances.length, 2);
    assert.ok(allInstances.some(item => item.displayStatus === 'upcoming'), '未来计划分区应存在数据');
    const dueInstance = allInstances.find(item => item.ruleId === dueRule.id)!;
    assert.equal(dueInstance.displayStatus, 'due');

    const dueOnlyResponse = await instancesRoute.GET(new Request('http://local/api/reminder-instances?dueOnly=true&limit=100'));
    assert.equal((await json<{ instances: unknown[] }>(dueOnlyResponse)).instances.length, 1, '首页徽标只统计到期提醒');

    const completeResponse = await instanceRoute.PATCH(new Request(`http://local/api/reminder-instances/${dueInstance.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }),
    }), { params: Promise.resolve({ id: dueInstance.id }) });
    assert.equal((await json<{ instance: { displayStatus: string } }>(completeResponse)).instance.displayStatus, 'completed');

    const reopenResponse = await instanceRoute.PATCH(new Request(`http://local/api/reminder-instances/${dueInstance.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'pending' }),
    }), { params: Promise.resolve({ id: dueInstance.id }) });
    assert.equal((await json<{ instance: { displayStatus: string } }>(reopenResponse)).instance.displayStatus, 'due', '历史提醒应能重新打开');

    const disableResponse = await reminderRoute.PATCH(new Request(`http://local/api/reminders/${dueRule.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'disabled' }),
    }), { params: Promise.resolve({ id: dueRule.id }) });
    assert.equal((await json<{ rule: { status: string } }>(disableResponse)).rule.status, 'disabled');
    const noDueResponse = await instancesRoute.GET(new Request('http://local/api/reminder-instances?dueOnly=true&limit=100'));
    assert.equal((await json<{ instances: unknown[] }>(noDueResponse)).instances.length, 0, '停用规则后首页不应继续显示到期徽标');

    const deleteResponse = await reminderRoute.DELETE(new Request(`http://local/api/reminders/${dueRule.id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: dueRule.id }),
    });
    assert.equal(deleteResponse.status, 204);
    const afterDeleteResponse = await instanceRoute.GET(new Request(`http://local/api/reminder-instances/${dueInstance.id}`), {
      params: Promise.resolve({ id: dueInstance.id }),
    });
    assert.equal(afterDeleteResponse.status, 404, '删除规则后相关实例应同步清理');

    console.log('M8-1 提醒中心契约测试通过：创建、分区查询、首页徽标、完成/重开、停用和级联删除均正常。');
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
