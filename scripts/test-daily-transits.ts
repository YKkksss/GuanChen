import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-daily-transit-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.AI_CONTEXT_LIMIT = '12000';
process.env.AI_INPUT_TOKEN_TARGET = '6000';

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { appendMessage, createConversation } = await import('../lib/db/conversations');
  const { buildConversationContext } = await import('../lib/context/builder');
  const { getDatabase } = await import('../lib/db/client');
  const { buildDailyTransitSnapshot } = await import('../lib/transits/engine');
  const { getOrCreateDailyTransit } = await import('../lib/transits/service');

  try {
    const birthInfo = {
      year: 2000,
      month: 4,
      day: 15,
      hour: 4,
      gender: 'male' as const,
      name: '流日测试',
    };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({
      type: 'chart',
      title: '流日分析测试',
      birthInfo,
      chartSnapshot: chart,
    });

    const directA = buildDailyTransitSnapshot(chart, '2026-03-18');
    const directB = buildDailyTransitSnapshot(chart, '2026-03-18');
    const nextDay = buildDailyTransitSnapshot(chart, '2026-03-19');
    assert.deepEqual(directA, directB, '同一命盘同一日期必须得到完全相同的流日快照');
    assert.equal(directA.boundaryPolicy, 'civil-date-early-rat-hour-representative');
    assert.equal(directA.representativeTimeIndex, 0);
    assert.equal(directA.lunarDay.monthLabel, '正月');
    assert.equal(directA.lunarDay.dayLabel, '三十');
    assert.equal(directA.flowDay.ganZhi, '辛卯');
    assert.equal(nextDay.lunarDay.monthLabel, '二月');
    assert.equal(nextDay.lunarDay.dayLabel, '初一');
    assert.equal(nextDay.flowDay.ganZhi, '壬辰');
    assert.notEqual(directA.flowMonth.ganZhi, nextDay.flowMonth.ganZhi, '农历初一应同时切换流月背景');
    assert.deepEqual(
      directA.transformations.map(item => `${item.starName}化${item.type}`),
      ['巨门化禄', '太阳化权', '文曲化科', '文昌化忌'],
    );
    assert.equal(directA.palaceMappings.length, 12, '流日十二宫必须完整映射');
    assert.equal(new Set(directA.relatedPalaceBranches).size, 4, '流日三方四正应包含四个不同宫位');
    assert.ok(directA.palaceMappings.some(item => item.transitStars.length > 0), '流日流曜必须写入宫位映射');
    assert.match(directA.evidence.find(item => item.id === 'daily-boundary')?.details ?? '', /晚子时跨日/);

    const cachedA = getOrCreateDailyTransit(conversation.id, '2026-03-18');
    const cachedB = getOrCreateDailyTransit(conversation.id, '2026-03-18');
    const cachedNextDay = getOrCreateDailyTransit(conversation.id, '2026-03-19');
    assert.equal(cachedA.id, cachedB.id, '同一日期必须命中同一缓存记录');
    assert.notEqual(cachedA.id, cachedNextDay.id, '不同日期必须保存不同缓存记录');
    assert.equal(cachedA.targetDate, '2026-03-18');

    const userMessage = appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '这一天适合重点安排什么事情？',
      metadata: { transit: { level: 'day', targetDate: '2026-03-18' } },
    });
    const context = buildConversationContext({
      conversationId: conversation.id,
      currentMessageId: userMessage.id,
      provider: 'test',
      model: 'test-model',
    });
    const contextText = context.messages.map(message => message.content).join('\n');
    assert.match(contextText, /2026-03-18 流日确定性运势事实/);
    assert.match(contextText, /流日：辛卯/);
    assert.match(contextText, /流日四化：巨门化禄/);
    assert.match(contextText, /大限背景—流年主题—流月触发—流日观察/);
    assert.match(contextText, /涉及晚子时必须提示需要具体时辰/);
    const transitLayer = (context.manifest.layers as Record<string, { included?: boolean; level?: string; targetDate?: string }>).transit;
    assert.equal(transitLayer.included, true);
    assert.equal(transitLayer.level, 'day');
    assert.equal(transitLayer.targetDate, '2026-03-18');

    const rowCount = (getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM transit_snapshots
      WHERE conversation_id = ? AND level = 'day'
    `).get(conversation.id) as { count: number }).count;
    assert.equal(rowCount, 2, '两个不同日期应保存两份流日快照');
    assert.throws(() => getOrCreateDailyTransit(conversation.id, '2026-02-30'), /日期不存在/);
    assert.throws(() => getOrCreateDailyTransit(conversation.id, '1999-12-31'), /日期必须在/);

    console.log('流日运势测试通过：早子时口径、日期与农历月界、确定性快照、缓存复用和 AI 上下文注入均正常。');
  } finally {
    getDatabaseSafeClose();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function getDatabaseSafeClose() {
  const database = globalThis.__ziweiSqlite;
  if (database?.open) database.close();
  globalThis.__ziweiSqlite = undefined;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
