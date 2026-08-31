import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-monthly-year-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const { resolveLunarYearMonthlyPeriods } = await import('../lib/transits/engine');
  const { getMonthlyTransitYearOverview } = await import('../lib/transits/service');

  try {
    const regularYear = resolveLunarYearMonthlyPeriods(2026);
    assert.equal(regularYear.length, 12, '无闰月的农历流年应包含 12 个流月');
    assert.equal(regularYear[0].label, '正月');
    assert.equal(regularYear[0].startDate, '2026-02-17');
    assert.equal(regularYear.at(-1)?.label, '腊月');
    assert.equal(regularYear.at(-1)?.endDate, '2027-02-05');

    const leapYear = resolveLunarYearMonthlyPeriods(2025);
    assert.equal(leapYear.length, 13, '存在闰月的农历流年必须保留全部 13 个流月');
    assert.deepEqual(
      leapYear.slice(5, 8).map(item => item.label),
      ['六月', '闰六月', '七月'],
      '闰月必须位于对应常规月份之后',
    );
    assert.equal(new Set(leapYear.map(item => item.startDate)).size, 13, '每个流月起始日必须唯一');
    leapYear.slice(1).forEach((period, index) => {
      assert.equal(addDays(leapYear[index].endDate, 1), period.startDate, '全年流月之间不能有空档或重叠');
    });

    const birthInfo = {
      year: 2000,
      month: 4,
      day: 15,
      hour: 4,
      gender: 'male' as const,
      name: '全年流月测试',
    };
    const conversation = createConversation({
      type: 'chart',
      title: '全年流月时间轴测试',
      birthInfo,
      chartSnapshot: generateChart(birthInfo),
    });

    const overview = getMonthlyTransitYearOverview(conversation.id, 2026);
    assert.equal(overview.level, 'month-year');
    assert.equal(overview.boundaryPolicy, 'lunar-year-first-day-to-next-lunar-year-eve');
    assert.equal(overview.comparisonPolicy, 'user-selected-factual-difference');
    assert.equal(overview.monthCount, 12);
    assert.equal(overview.months.length, 12);
    assert.equal(overview.startDate, '2026-02-17');
    assert.equal(overview.endDate, '2027-02-05');
    assert.ok(overview.previousYearStartDate);
    assert.ok(overview.nextYearStartDate);
    overview.months.forEach(item => {
      assert.equal(item.transformations.length, 4, `${item.lunarMonth.label}必须包含完整四化`);
      assert.ok(item.keyPalaces.length >= 4, `${item.lunarMonth.label}必须包含三方四正重点宫位`);
      assert.equal(item.targetDate, item.lunarMonth.startDate);
      assert.equal('score' in item, false, '全年流月不得引入无依据的吉凶评分');
      assert.equal('rank' in item, false, '全年流月不得自动生成最佳月份排名');
    });

    const cached = getMonthlyTransitYearOverview(conversation.id, 2026);
    assert.deepEqual(
      cached.months.map(item => item.snapshotId),
      overview.months.map(item => item.snapshotId),
      '重复打开同一流年必须复用全部流月快照',
    );
    const rowCount = (getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM transit_snapshots
      WHERE conversation_id = ? AND level = 'month'
    `).get(conversation.id) as { count: number }).count;
    assert.equal(rowCount, 12, '同一农历流年只应保存 12 份实际流月快照');
    assert.throws(() => getMonthlyTransitYearOverview(conversation.id, 1999), /农历流年必须在/);

    console.log('全年流月测试通过：农历年界、闰月、连续时间轴、快照复用和无吉凶排名边界均正常。');
  } finally {
    getDatabaseSafeClose();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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
