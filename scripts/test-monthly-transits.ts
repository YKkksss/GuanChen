import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-monthly-transit-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.AI_CONTEXT_LIMIT = '12000';
process.env.AI_INPUT_TOKEN_TARGET = '6000';

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { appendMessage, createConversation } = await import('../lib/db/conversations');
  const { buildConversationContext } = await import('../lib/context/builder');
  const { getDatabase } = await import('../lib/db/client');
  const {
    buildMonthlyTransitSnapshot,
    resolveMonthlyTransitPeriod,
  } = await import('../lib/transits/engine');
  const { getOrCreateMonthlyTransit } = await import('../lib/transits/service');

  try {
    const birthInfo = {
      year: 2000,
      month: 4,
      day: 15,
      hour: 4,
      gender: 'male' as const,
      name: '流月测试',
    };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({
      type: 'chart',
      title: '流月分析测试',
      birthInfo,
      chartSnapshot: chart,
    });

    const lunarNewYearEve = resolveMonthlyTransitPeriod('2026-02-16');
    const lunarNewYear = resolveMonthlyTransitPeriod('2026-02-17');
    assert.equal(lunarNewYearEve.label, '腊月');
    assert.equal(lunarNewYearEve.endDate, '2026-02-16');
    assert.equal(lunarNewYear.label, '正月');
    assert.equal(lunarNewYear.startDate, '2026-02-17');
    const leapMonth = resolveMonthlyTransitPeriod('2025-07-25');
    assert.equal(leapMonth.label, '闰六月');
    assert.equal(leapMonth.isLeap, true);

    const first = buildMonthlyTransitSnapshot(chart, '2026-02-17');
    const sameMonth = buildMonthlyTransitSnapshot(chart, '2026-03-18');
    const nextMonth = buildMonthlyTransitSnapshot(chart, '2026-03-19');
    assert.deepEqual(first, sameMonth, '同一农历月内的不同观察日必须归一为完全相同的快照');
    assert.notEqual(first.targetDate, nextMonth.targetDate, '农历初一必须切换到下一份流月快照');
    assert.equal(first.targetDate, '2026-02-17');
    assert.equal(first.lunarMonth.endDate, '2026-03-18');
    assert.equal(first.lunarMonth.dayCount, 30);
    assert.equal(first.year.ganZhi, '丙午');
    assert.equal(first.flowMonth.ganZhi, '庚寅');
    assert.deepEqual(
      first.transformations.map(item => `${item.starName}化${item.type}`),
      ['太阳化禄', '武曲化权', '太阴化科', '天同化忌'],
    );
    assert.equal(first.palaceMappings.length, 12, '流月十二宫必须完整映射');
    assert.equal(new Set(first.relatedPalaceBranches).size, 4, '流月三方四正应包含四个不同宫位');
    assert.ok(first.palaceMappings.some(item => item.transitStars.length > 0), '流月流曜必须写入宫位映射');

    const cachedFirst = getOrCreateMonthlyTransit(conversation.id, '2026-02-17');
    const cachedSameMonth = getOrCreateMonthlyTransit(conversation.id, '2026-03-18');
    const cachedNextMonth = getOrCreateMonthlyTransit(conversation.id, '2026-03-19');
    assert.equal(cachedFirst.id, cachedSameMonth.id, '同一流月必须命中同一缓存记录');
    assert.notEqual(cachedFirst.id, cachedNextMonth.id, '不同流月必须保存不同缓存记录');
    assert.equal(cachedFirst.targetDate, first.lunarMonth.startDate);

    const userMessage = appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '这个流月的事业和财运重点是什么？',
      metadata: { transit: { level: 'month', targetDate: '2026-03-18' } },
    });
    const context = buildConversationContext({
      conversationId: conversation.id,
      currentMessageId: userMessage.id,
      provider: 'test',
      model: 'test-model',
    });
    const contextText = context.messages.map(message => message.content).join('\n');
    assert.match(contextText, /2026 年正月确定性运势事实/);
    assert.match(contextText, /流月：庚寅/);
    assert.match(contextText, /流月四化：太阳化禄/);
    assert.match(contextText, /大限背景—流年主题—流月触发/);
    const transitLayer = (context.manifest.layers as Record<string, { included?: boolean; level?: string; targetDate?: string }>).transit;
    assert.equal(transitLayer.included, true);
    assert.equal(transitLayer.level, 'month');
    assert.equal(transitLayer.targetDate, '2026-02-17');

    const rowCount = (getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM transit_snapshots
      WHERE conversation_id = ? AND level = 'month'
    `).get(conversation.id) as { count: number }).count;
    assert.equal(rowCount, 2, '三个观察日分属两个农历月，因此数据库只应保存两份快照');
    assert.throws(() => getOrCreateMonthlyTransit(conversation.id, '2026-02-30'), /日期不存在/);

    console.log('流月运势测试通过：农历月界、确定性快照、流曜四化、缓存复用和 AI 上下文注入均正常。');
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
