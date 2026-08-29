import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { calculateBazi } from '../lib/bazi/engine';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import {
  calculateBaziAnnualTimeline,
  getBaziAnnualBoundaryForTest,
} from '../lib/bazi/annual-timeline-engine';
import { BAZI_ANNUAL_TIMELINE_METHODOLOGY } from '../lib/bazi/annual-timeline-methodology';
import {
  assertValidBaziAnnualTimelineMethodology,
  validateBaziAnnualTimelineMethodology,
} from '../lib/bazi/annual-timeline-validator';
import type { BaziAnnualTimelineMethodology } from '../lib/bazi/annual-timeline-types';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-annual-timeline-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

async function main() {
  assert.deepEqual(validateBaziAnnualTimelineMethodology(), []);
  assert.doesNotThrow(() => assertValidBaziAnnualTimelineMethodology());
  assert.deepEqual(getBaziAnnualBoundaryForTest(2022), {
    year: 2022, ganZhi: '壬寅', liChunAt: '2022-02-04 04:50:47',
  });
  assert.deepEqual(getBaziAnnualBoundaryForTest(2023), {
    year: 2023, ganZhi: '癸卯', liChunAt: '2023-02-04 10:42:33',
  });

  const chart = calculateBazi({
    birthDate: '2022-03-09', birthTime: '20:51', gender: 'male',
    timeZoneId: 'Asia/Shanghai', timeStandard: 'civil_time',
  });
  const luckCycles = calculateBaziLuckCycles(chart);
  const annual = calculateBaziAnnualTimeline(chart, luckCycles);
  assert.equal(annual.status, 'complete');
  assert.equal(annual.range.startYear, 2022);
  assert.equal(annual.capabilities.annualInterpretation, false);
  const birthYear = annual.years.find(item => item.year === 2022)!;
  assert.equal(birthYear.activeFrom, '2022-03-09 20:51:00');
  assert.equal(birthYear.startsBeforeBirth, true);

  const firstEntryYear = annual.years.find(item => item.year === 2030)!;
  assert.equal(firstEntryYear.crossesLuckCycleBoundary, true);
  assert.deepEqual(firstEntryYear.segments.map(segment => [segment.kind, segment.luckCycleIndex, segment.startAt, segment.endAtExclusive]), [
    ['pre_luck', null, '2030-02-04 03:08:28', '2030-12-12 06:51:00'],
    ['luck_cycle', 1, '2030-12-12 06:51:00', '2031-02-04 08:58:19'],
  ]);
  const secondEntryYear = annual.years.find(item => item.year === 2040)!;
  assert.equal(secondEntryYear.crossesLuckCycleBoundary, true);
  assert.deepEqual(secondEntryYear.segments.map(segment => [segment.luckCycleIndex, segment.luckCycleGanZhi]), [[1, '甲辰'], [2, '乙巳']]);

  const unknownChart = calculateBazi({ birthDate: '1999-06-07', gender: 'male', unknownTime: true });
  const unknown = calculateBaziAnnualTimeline(unknownChart, calculateBaziLuckCycles(unknownChart));
  assert.equal(unknown.status, 'annual_schedule_only');
  assert.ok(unknown.years.every(item => item.liChunAt && item.segments.length === 0));

  const unsupportedChart = calculateBazi({
    birthDate: '2022-03-09', birthTime: '20:51', gender: 'male',
    timeZoneId: 'America/New_York', timeStandard: 'civil_time',
  });
  const unsupported = calculateBaziAnnualTimeline(unsupportedChart, calculateBaziLuckCycles(unsupportedChart));
  assert.equal(unsupported.status, 'sequence_only_unsupported_timezone');
  assert.ok(unsupported.years.every(item => item.liChunAt === null && item.scheduleStatus === 'provisional_sequence_only'));

  const invalid = structuredClone(BAZI_ANNUAL_TIMELINE_METHODOLOGY) as BaziAnnualTimelineMethodology;
  invalid.policy.crossCycleRule = 'whole_year_assignment' as never;
  assert.ok(validateBaziAnnualTimelineMethodology(invalid).some(item => item.includes('拆段')));

  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const annualRoute = await import('../app/api/bazi/charts/[id]/annual-timeline/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const { appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-5 流年时间轴测试', birthDate: '2022-03-09', birthTime: '20:51',
        gender: 'male', timeZoneId: 'Asia/Shanghai',
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;
    const firstResponse = await annualRoute.POST(new Request('http://local/annual-timeline', { method: 'POST' }), {
      params: Promise.resolve({ id: chartId }),
    });
    assert.equal(firstResponse.status, 201);
    const first = (await json<{ annualTimeline: { id: string; luckCycleVersionId: string; result: typeof annual } }>(firstResponse)).annualTimeline;
    assert.equal(first.result.years.find(item => item.year === 2030)?.segments.length, 2);
    const second = (await json<{ annualTimeline: { id: string } }>(await annualRoute.POST(
      new Request('http://local/annual-timeline', { method: 'POST' }),
      { params: Promise.resolve({ id: chartId }) },
    ))).annualTimeline;
    assert.equal(second.id, first.id, '相同命盘、大运和方法版本应复用流年时间轴版本');

    const conversationResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const conversation = (await json<{ conversation: { id: string; annualTimelineVersionId: string; promptVersion: string } }>(conversationResponse)).conversation;
    assert.equal(conversation.annualTimelineVersionId, first.id);
    assert.equal(conversation.promptVersion, 'bazi-chat-ten-god-repeat-v8');
    const question = appendBaziMessage({ conversationId: conversation.id, role: 'user', content: '请解释2030年流年的时间归属' });
    const built = buildBaziConversationContext({
      conversationId: conversation.id, currentMessageId: question.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.annualTimelineVersionId, first.id);
    assert.ok(built.messages.some(message => message.content.includes('权威八字流年时间轴快照')));
    assert.ok(built.messages.some(message => message.content.includes('2030-12-12 06:51:00')));
    assert.ok((built.manifest.allowedCapabilities as string[]).includes('annual_timeline_schedule'));
    assert.deepEqual(findBaziOutputViolations('2030年流年会发财'), ['越权解释流年吉凶']);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 27').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM bazi_annual_timeline_versions').get() as { count: number }).count, 1);

    console.log('M9-5 流年时间轴测试通过：立春切年、出生裁剪、跨运拆段、降级、v27 持久化与上下文绑定均正常。');
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
