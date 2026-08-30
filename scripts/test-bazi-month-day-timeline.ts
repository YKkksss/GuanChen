import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBaziAnnualTimeline } from '../lib/bazi/annual-timeline-engine';
import {
  calculateBaziMonthDayTimeline,
  getBaziJieAtForTest,
} from '../lib/bazi/month-day-timeline-engine';
import { BAZI_MONTH_DAY_TIMELINE_METHODOLOGY } from '../lib/bazi/month-day-timeline-methodology';
import {
  assertValidBaziMonthDayTimelineMethodology,
  validateBaziMonthDayTimelineMethodology,
} from '../lib/bazi/month-day-timeline-validator';
import type { BaziMonthDayTimelineMethodology } from '../lib/bazi/month-day-timeline-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-month-day-timeline-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

function buildTimeline(lateZiPolicy: 'same_day' | 'next_day', targetYear = 2030) {
  const chart = calculateBazi({
    birthDate: '2022-03-09', birthTime: '20:51', gender: 'male',
    timeZoneId: 'Asia/Shanghai', timeStandard: 'civil_time', lateZiPolicy,
  });
  const luckCycles = calculateBaziLuckCycles(chart);
  const annualTimeline = calculateBaziAnnualTimeline(chart, luckCycles);
  return { chart, annualTimeline, result: calculateBaziMonthDayTimeline(chart, annualTimeline, targetYear) };
}

async function main() {
  assert.deepEqual(validateBaziMonthDayTimelineMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziMonthDayTimelineMethodology());
  assert.equal(getBaziJieAtForTest(2030, '立春'), '2030-02-04 03:08:28');
  assert.equal(getBaziJieAtForTest(2030, '惊蛰'), '2030-03-05 21:03:18');

  const sameDay = buildTimeline('same_day').result;
  assert.equal(sameDay.status, 'complete');
  assert.equal(sameDay.months.length, 12);
  assert.equal(sameDay.months[0].ganZhi, '戊寅');
  assert.equal(sameDay.months[0].startAt, '2030-02-04 03:08:28');
  assert.equal(sameDay.months[11].jieName, '小寒');
  assert.equal(sameDay.months[11].startAt, '2031-01-05 21:23:09');
  assert.ok(sameDay.counts.days >= 365 && sameDay.counts.days <= 367);
  assert.equal(sameDay.counts.monthBoundaryDays, 11);
  const jieDay = sameDay.days.find(item => item.effectiveDate === '2030-03-05')!;
  assert.equal(jieDay.crossesMonthBoundary, true);
  assert.deepEqual(jieDay.segments.map(item => [item.monthGanZhi, item.startAt, item.endAtExclusive]), [
    ['戊寅', '2030-03-05 00:00:00', '2030-03-05 21:03:18'],
    ['己卯', '2030-03-05 21:03:18', '2030-03-06 00:00:00'],
  ]);
  const luckDay = sameDay.days.find(item => item.effectiveDate === '2030-12-12')!;
  assert.equal(luckDay.crossesLuckCycleBoundary, true);
  assert.deepEqual(luckDay.segments.map(item => [item.luckCycleIndex, item.startAt, item.endAtExclusive]), [
    [null, '2030-12-12 00:00:00', '2030-12-12 06:51:00'],
    [1, '2030-12-12 06:51:00', '2030-12-13 00:00:00'],
  ]);

  const nextDay = buildTimeline('next_day').result;
  const shifted = nextDay.days.find(item => item.effectiveDate === '2030-12-12')!;
  assert.equal(shifted.startAt, '2030-12-11 23:00:00');
  assert.equal(shifted.endAtExclusive, '2030-12-12 23:00:00');
  assert.equal(shifted.ganZhi, luckDay.ganZhi, '正午取样的有效日期干支在两种晚子时口径下应一致');

  const unsupportedChart = calculateBazi({
    birthDate: '2022-03-09', birthTime: '20:51', gender: 'male',
    timeZoneId: 'America/New_York', timeStandard: 'civil_time',
  });
  const unsupportedAnnual = calculateBaziAnnualTimeline(unsupportedChart, calculateBaziLuckCycles(unsupportedChart));
  const unsupported = calculateBaziMonthDayTimeline(unsupportedChart, unsupportedAnnual, 2030);
  assert.equal(unsupported.status, 'sequence_only_unsupported_timezone');
  assert.equal(unsupported.months.length, 12);
  assert.equal(unsupported.days.length, 0);
  assert.ok(unsupported.months.every(item => item.startAt === null && item.scheduleStatus === 'provisional_sequence_only'));

  const invalid = structuredClone(BAZI_MONTH_DAY_TIMELINE_METHODOLOGY) as BaziMonthDayTimelineMethodology;
  invalid.policy.monthBoundaryRule = 'calendar_month_start' as never;
  assert.ok(validateBaziMonthDayTimelineMethodology(invalid).some(item => item.includes('精确节')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const timelineRoute = await import('../app/api/bazi/charts/[id]/month-day-timeline/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-14 流月流日测试', birthDate: '2022-03-09', birthTime: '20:51',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await timelineRoute.POST(new Request('http://local/month-day-timeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetYear: 2030 }),
    }), { params: Promise.resolve({ id: chartId }) });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ monthDayTimeline: { id: string; targetYear: number; monthDayTimelineFingerprint: string; result: typeof sameDay } }>(firstResponse)).monthDayTimeline;
    assert.equal(first.targetYear, 2030);
    assert.equal(first.monthDayTimelineFingerprint.length, 64);
    const second = (await json<{ monthDayTimeline: { id: string } }>(await timelineRoute.POST(
      new Request('http://local/month-day-timeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetYear: 2030 }),
      }),
      { params: Promise.resolve({ id: chartId }) },
    ))).monthDayTimeline;
    assert.equal(second.id, first.id, '相同命盘、流年和方法版本应复用流月流日版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; monthDayTimelineVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.ok(conversation.monthDayTimelineVersionId);
    assert.equal(conversation.promptVersion, 'bazi-chat-month-day-relation-v14');
    const question = appendBaziMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '请解释2030年12月12日的流日时间归属',
    });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.monthDayTimelineVersionId, first.id);
    assert.equal(built.manifest.monthDayTimelineTargetYear, 2030);
    assert.ok(built.messages.some(message => message.content.includes('权威八字流月流日确定性时间轴快照')));
    assert.ok(built.messages.some(message => message.content.includes('2030-12-12 06:51:00')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('month_day_timeline_schedule'));
    assert.ok((built.manifest.prohibitedCapabilities as string[]).includes('month_day_interpretation'));
    assert.deepEqual(findBaziOutputViolations('这个流日会发财'), ['越权解释流月流日吉凶']);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 36').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_month_day_timeline_versions').get() as { count: number }).count, 2);

    console.log('M9-14 流月流日时间轴测试通过：精确节界、晚子时换日、跨节跨运拆段、按年缓存、v36 持久化与上下文路由均正常。');
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
