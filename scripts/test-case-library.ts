import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-case-library-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, deleteConversation } = await import('../lib/db/conversations');
  const { createLifeEvent } = await import('../lib/db/events');
  const { createCaseFromConversation, previewCaseFromConversation } = await import('../lib/cases/service');
  const {
    buildAnonymousCaseExport,
    deleteCaseRecord,
    getCaseRecord,
    listCaseRecords,
    setCaseConsent,
    updateCaseRecord,
  } = await import('../lib/db/cases');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const birthInfo = {
      name: '隐私测试姓名', year: 1991, month: 8, day: 23, hour: 6,
      gender: 'female' as const, province: '隐私测试省', city: '隐私测试市', longitude: 118.123456,
    };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({
      type: 'chart',
      title: '隐私测试姓名的完整命盘 · 1991-08-23',
      birthInfo,
      chartSnapshot: chart,
    });
    createLifeEvent(conversation.id, {
      title: '进入隐私测试公司并搬家到详细地址',
      category: 'career',
      startDate: '2016-03-12',
      datePrecision: 'day',
      description: '包含不应进入案例的详细经历和联系方式 13800000000',
      impactLevel: 5,
      confirmedByUser: true,
    });
    createLifeEvent(conversation.id, {
      title: '尚未确认的健康事件',
      category: 'health',
      startDate: '2019',
      datePrecision: 'year',
      impactLevel: 3,
      confirmedByUser: false,
    });

    const preview = previewCaseFromConversation(conversation.id);
    assert.equal(preview.events.length, 1, '只有用户已确认事件可以进入脱敏预览');
    assert.equal(preview.events[0].category, 'career');
    assert.equal(preview.events[0].ageBand, '20-29岁');
    assert.equal(preview.events[0].datePrecision, 'year');
    const previewJson = JSON.stringify(preview);
    for (const sensitive of ['隐私测试姓名', '1991-08-23', '隐私测试省', '隐私测试市', '118.123456', '13800000000', '详细经历']) {
      assert.ok(!previewJson.includes(sensitive), `脱敏预览不能包含：${sensitive}`);
    }
    assert.ok(!('birthInfo' in preview.chartSnapshot), '匿名命盘快照不能存在 birthInfo');
    assert.ok(!('lunarInfo' in preview.chartSnapshot), '匿名命盘快照不能存在 lunarInfo');

    assert.throws(() => createCaseFromConversation({
      conversationId: conversation.id,
      acknowledged: false,
    }), /确认/);
    assert.throws(() => createCaseFromConversation({
      conversationId: conversation.id,
      acknowledged: true,
      title: '隐私测试姓名案例',
    }), /姓名/);

    const record = createCaseFromConversation({
      conversationId: conversation.id,
      acknowledged: true,
      title: '匿名职业变化案例',
      confidence: 'medium',
      scopes: ['teaching'],
    });
    assert.match(record.caseCode, /^CASE-[A-F0-9]{10}$/);
    assert.equal(record.status, 'draft');
    assert.deepEqual(record.consents.map(item => item.scope).sort(), ['local_only', 'teaching']);
    assert.throws(() => buildAnonymousCaseExport(record.id), /复核/);

    setCaseConsent({ caseId: record.id, scope: 'anonymous_export', active: true });
    updateCaseRecord(record.id, { status: 'reviewed' });
    const exported = buildAnonymousCaseExport(record.id);
    const exportJson = JSON.stringify(exported);
    assert.equal(exported.authorization.scope, 'anonymous_export');
    assert.ok(!exportJson.includes(conversation.id), '匿名导出不能包含本地来源会话 ID');
    for (const sensitive of ['隐私测试姓名', '1991-08-23', '隐私测试省', '隐私测试市', '13800000000']) {
      assert.ok(!exportJson.includes(sensitive), `匿名导出不能包含：${sensitive}`);
    }

    setCaseConsent({ caseId: record.id, scope: 'anonymous_export', active: false });
    assert.throws(() => buildAnonymousCaseExport(record.id), /授权/);
    assert.throws(() => setCaseConsent({ caseId: record.id, scope: 'local_only', active: false }), /不能撤销/);
    assert.throws(() => setCaseConsent({ caseId: record.id, scope: 'public_release', active: true }), /暂不开放/);

    assert.equal(listCaseRecords({ status: 'reviewed' }).length, 1);
    assert.equal(deleteConversation(conversation.id), true);
    assert.equal(getCaseRecord(record.id)?.sourceConversationId, null, '删除来源命盘后匿名案例应继续存在，但解除本地来源关联');
    assert.equal(deleteCaseRecord(record.id, 'WRONG-CODE'), false, '编号不匹配时禁止删除');
    assert.equal(deleteCaseRecord(record.id, record.caseCode), true);
    assert.equal(getCaseRecord(record.id), null);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 18').get());

    console.log('M7-0 匿名案例库测试通过：脱敏预览、明确授权、复核导出、撤销授权、来源解绑、审计与 SQLite v18 均正常。');
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
