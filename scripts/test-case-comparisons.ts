import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-case-comparison-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation } = await import('../lib/db/conversations');
  const { createLifeEvent } = await import('../lib/db/events');
  const { createCaseFromConversation } = await import('../lib/cases/service');
  const { deleteCaseRecord, setCaseConsent, updateCaseRecord } = await import('../lib/db/cases');
  const {
    createOrRefreshCaseComparison,
    getCaseComparison,
    listCaseComparisons,
    setCaseComparisonStatus,
  } = await import('../lib/db/case-comparisons');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const createSource = (name: string, year: number, month: number, day: number, hour: number) => {
      const birthInfo = { name, year, month, day, hour, gender: 'male' as const, province: '隐私测试省', city: '隐私测试市' };
      const chart = generateChart(birthInfo);
      return createConversation({ type: 'chart', title: `${name}完整命盘`, birthInfo, chartSnapshot: chart });
    };
    const sourceA = createSource('对比隐私姓名甲', 1990, 5, 12, 3);
    const sourceB = createSource('对比隐私姓名乙', 1988, 9, 2, 7);
    createLifeEvent(sourceA.id, {
      title: '完整职业事件', category: 'career', startDate: '2015', datePrecision: 'year',
      description: '具体公司信息不能进入对比结果', impactLevel: 4, confirmedByUser: true,
    });
    createLifeEvent(sourceB.id, {
      title: '完整迁移事件', category: 'relocation', startDate: '2018', datePrecision: 'year',
      description: '具体地址不能进入对比结果', impactLevel: 3, confirmedByUser: true,
    });

    const caseA = createCaseFromConversation({
      conversationId: sourceA.id, acknowledged: true, title: '匿名事业观察甲', scopes: ['teaching'],
    });
    const caseB = createCaseFromConversation({
      conversationId: sourceB.id, acknowledged: true, title: '匿名迁移观察乙', scopes: ['teaching'],
    });
    updateCaseRecord(caseA.id, { status: 'reviewed' });
    updateCaseRecord(caseB.id, { status: 'reviewed' });

    const chartComparison = createOrRefreshCaseComparison({
      mode: 'chart_to_chart', leftCaseId: caseA.id, rightCaseId: caseB.id,
    });
    assert.match(chartComparison.comparisonCode, /^CMP-[A-F0-9]{10}$/);
    assert.equal(chartComparison.result.dimensions.length, 10);
    assert.equal(
      chartComparison.result.dimensions.length,
      chartComparison.result.counts.common + chartComparison.result.counts.different + chartComparison.result.counts.unavailable,
      '共同、差异、资料不足三个状态需要覆盖全部维度',
    );
    const repeated = createOrRefreshCaseComparison({
      mode: 'chart_to_chart', leftCaseId: caseA.id, rightCaseId: caseB.id,
    });
    assert.equal(repeated.id, chartComparison.id, '同一对比组合需要复用原记录');
    assert.throws(() => createOrRefreshCaseComparison({
      mode: 'chart_to_chart', leftCaseId: caseA.id, rightCaseId: caseA.id,
    }), /不同案例/);

    const daXianComparison = createOrRefreshCaseComparison({
      mode: 'daxian_to_daxian', leftCaseId: caseA.id,
      leftStageKey: 'daxian:0', rightStageKey: 'daxian:1',
    });
    assert.equal(daXianComparison.leftCaseId, daXianComparison.rightCaseId);
    assert.equal(daXianComparison.result.dimensions.length, 7);
    assert.throws(() => createOrRefreshCaseComparison({
      mode: 'daxian_to_daxian', leftCaseId: caseA.id,
      leftStageKey: 'daxian:0', rightStageKey: 'daxian:0',
    }), /不同的大限/);

    const serialized = JSON.stringify([chartComparison.result, daXianComparison.result]);
    for (const sensitive of [sourceA.id, sourceB.id, '对比隐私姓名甲', '对比隐私姓名乙', '隐私测试省', '具体公司', '具体地址']) {
      assert.ok(!serialized.includes(sensitive), `对比结果不能包含：${sensitive}`);
    }

    getDatabase().prepare(`
      UPDATE case_records SET title = ?, updated_at = updated_at + 1 WHERE id = ?
    `).run('匿名事业观察甲（修订）', caseA.id);
    const refreshed = getCaseComparison(chartComparison.id)!;
    assert.equal(refreshed.result.left.title, '匿名事业观察甲（修订）', '案例更新时间变化后需要自动重算缓存结果');

    setCaseComparisonStatus(daXianComparison.id, 'archived');
    assert.equal(listCaseComparisons().some(item => item.id === daXianComparison.id), false);
    assert.equal(listCaseComparisons({ status: 'archived' }).some(item => item.id === daXianComparison.id), true);

    setCaseConsent({ caseId: caseA.id, scope: 'teaching', active: false });
    assert.throws(() => getCaseComparison(chartComparison.id), /授权/);
    assert.equal(listCaseComparisons().length, 0, '撤销任一来源案例教学授权后，相关对比需要立即隐藏');
    setCaseConsent({ caseId: caseA.id, scope: 'teaching', active: true });
    assert.equal(listCaseComparisons().length, 1);

    assert.equal(deleteCaseRecord(caseB.id, caseB.caseCode), true);
    assert.equal(getDatabase().prepare('SELECT 1 FROM case_comparisons WHERE id = ?').get(chartComparison.id), undefined, '删除来源案例应级联删除对比');
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 20').get());

    console.log('M7-2 案例对比测试通过：v20 持久化、两命盘与大限对比、自动刷新、授权闸门、归档和级联删除均正常。');
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
