import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles, convertMinutesToStartOffset } from '../lib/bazi/luck-cycle-engine';
import { BAZI_LUCK_CYCLE_METHODOLOGY } from '../lib/bazi/luck-cycle-methodology';
import {
  assertValidBaziLuckCycleMethodology,
  validateBaziLuckCycleMethodology,
} from '../lib/bazi/luck-cycle-validator';
import type { BaziLuckCycleMethodology } from '../lib/bazi/luck-cycle-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-luck-cycles-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

async function main() {
  assert.deepEqual(validateBaziLuckCycleMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziLuckCycleMethodology());
  assert.deepEqual(convertMinutesToStartOffset(37_829), {
    years: 8, months: 9, days: 2, hours: 10, label: '8年9个月2天10小时',
  });

  // 6tail 官方 Yun 流派 2 测试案例：男命顺排，2030-12-12 起运。
  const forwardChart = calculateBazi({
    birthDate: '2022-03-09', birthTime: '20:51', gender: 'male',
    timeZoneId: 'Asia/Shanghai', timeStandard: 'civil_time',
  });
  const forward = calculateBaziLuckCycles(forwardChart);
  assert.equal(forward.status, 'complete');
  assert.equal(forward.direction.value, 'forward');
  assert.equal(forward.referenceJie?.name, '清明');
  assert.equal(forward.referenceJie?.at, '2022-04-05 03:20:14');
  assert.equal(forward.referenceJie?.elapsedMinutes, 37_829);
  assert.deepEqual(forward.startOffset, {
    years: 8, months: 9, days: 2, hours: 10, label: '8年9个月2天10小时',
  });
  assert.equal(forward.startAt, '2030-12-12 06:51:00');
  assert.deepEqual(forward.cycles.slice(0, 4).map(item => item.ganZhi), ['甲辰', '乙巳', '丙午', '丁未']);
  assert.equal(forward.cycles[0].nominalStartAge, 9);
  assert.equal(forward.cycles[0].endAtExclusive, '2040-12-12 06:51:00');

  // 6tail 官方 Yun 流派 2 测试案例：女命逆排，2020-03-21 起运。
  const backward = calculateBaziLuckCycles(calculateBazi({
    birthDate: '2018-06-11', birthTime: '09:30', gender: 'female',
    timeZoneId: 'Asia/Shanghai', timeStandard: 'civil_time',
  }));
  assert.equal(backward.status, 'complete');
  assert.equal(backward.direction.value, 'backward');
  assert.equal(backward.referenceJie?.name, '芒种');
  assert.deepEqual(backward.startOffset, {
    years: 1, months: 9, days: 10, hours: 2, label: '1年9个月10天2小时',
  });
  assert.equal(backward.startAt, '2020-03-21 11:30:00');
  assert.deepEqual(backward.cycles.slice(0, 4).map(item => item.ganZhi), ['丁巳', '丙辰', '乙卯', '甲寅']);

  const unknown = calculateBaziLuckCycles(calculateBazi({
    birthDate: '1999-06-07', gender: 'male', unknownTime: true,
  }));
  assert.equal(unknown.status, 'withheld_unknown_time');
  assert.equal(unknown.startAt, null);
  assert.equal(unknown.cycles.length, 8);
  assert.ok(unknown.cycles.every(item => item.startAt === null && item.scheduleStatus === 'provisional_sequence_only'));

  const unsupportedTimezone = calculateBaziLuckCycles(calculateBazi({
    birthDate: '2022-03-09', birthTime: '20:51', gender: 'male',
    timeZoneId: 'America/New_York', timeStandard: 'civil_time',
  }));
  assert.equal(unsupportedTimezone.status, 'withheld_unsupported_timezone');
  assert.equal(unsupportedTimezone.capabilities.exactStartBoundary, false);

  const invalid = structuredClone(BAZI_LUCK_CYCLE_METHODOLOGY) as BaziLuckCycleMethodology;
  invalid.policy.boundaryScope = 'all_terms' as never;
  assert.ok(validateBaziLuckCycleMethodology(invalid).some(item => item.includes('中气')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const luckCyclesRoute = await import('../app/api/bazi/charts/[id]/luck-cycles/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-4 大运排期测试', birthDate: '2022-03-09', birthTime: '20:51',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await luckCyclesRoute.POST(new Request('http://local/luck-cycles', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ luckCycles: { id: string; result: { startAt: string } } }>(firstResponse)).luckCycles;
    assert.equal(first.result.startAt, '2030-12-12 06:51:00');
    const second = (await json<{ luckCycles: { id: string } }>(await luckCyclesRoute.POST(
      new Request('http://local/luck-cycles', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).luckCycles;
    assert.equal(second.id, first.id, '相同命盘和方法版本应复用大运排期版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; luckCycleVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.luckCycleVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-transparency-root-v9');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '为什么顺排，什么时候交运？' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.luckCycleVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字大运排期快照')));
    assert.ok(built.messages.some(message => message.content.includes('2030-12-12 06:51:00')));
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 26').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_luck_cycle_versions').get() as { count: number }).count, 1);

    console.log('M9-4 大运测试通过：顺逆、节界、分钟折算、交运时刻、八步大运、降级、v26 持久化与上下文绑定均正常。');
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
