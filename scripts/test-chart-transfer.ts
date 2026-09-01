import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-chart-transfer-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(tempDirectory, 'report-exports');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { appendMessage, createConversation } = await import('../lib/db/conversations');
  const { upsertMemoryItem } = await import('../lib/db/context');
  const { createLifeEvent } = await import('../lib/db/events');
  const { closeDatabaseConnection, getDatabase } = await import('../lib/db/client');
  const { getOrCreateAnnualTransit } = await import('../lib/transits/service');
  const { claimReportVersion, completeReportVersion, getOrCreateReport } = await import('../lib/db/reports');
  const { REPORT_TYPE_DEFINITIONS } = await import('../lib/reports/types');
  const {
    ChartPackageValidationError,
    createChartPackage,
    importChartPackage,
    inspectChartPackage,
  } = await import('../lib/chart-transfer/service');
  const { CHART_IMPORT_CONFIRMATION } = await import('../lib/chart-transfer/types');
  const exportRoute = await import('../app/api/chart-packages/export/route');
  const inspectRoute = await import('../app/api/chart-packages/inspect/route');
  const importRoute = await import('../app/api/chart-packages/import/route');

  try {
    const birthInfo = { year: 1992, month: 7, day: 9, hour: 8, gender: 'female' as const };
    const conversation = createConversation({
      type: 'chart',
      title: '单命盘迁移测试档案',
      birthInfo,
      chartSnapshot: generateChart(birthInfo),
    });
    const userMessage = appendMessage({ conversationId: conversation.id, role: 'user', content: '我在 2020 年完成了一次重要转岗。' });
    const assistantMessage = appendMessage({ conversationId: conversation.id, role: 'assistant', content: '已记录这次转岗，后续可以结合年度结构回看。', metadata: { sourceMessageId: userMessage.id } });
    const memory = upsertMemoryItem({ conversationId: conversation.id, category: 'confirmed_event', content: '2020 年完成重要转岗', normalizedKey: 'career:2020-transfer', sourceMessageId: userMessage.id });
    const lifeEvent = createLifeEvent(conversation.id, { title: '完成重要转岗', category: 'career', startDate: '2020-06-15', datePrecision: 'day', impactLevel: 4, sourceMessageId: userMessage.id, confirmedByUser: true });
    const transit = getOrCreateAnnualTransit(conversation.id, 2020);

    const report = getOrCreateReport(conversation.id, 'career');
    const claim = claimReportVersion({ reportId: report.id, engineVersion: 'transfer-test-v1', promptVersion: 'transfer-test-v1', provider: 'test', model: 'fixture', regenerate: false, staleAfterMs: 60_000 });
    const sections = REPORT_TYPE_DEFINITIONS.career.sectionKeys.map(section => ({ key: section.key, title: section.title, content: `${section.title}测试内容。`, basis: 'evidence' as const, evidenceIds: [] }));
    completeReportVersion({ versionId: claim.version.id, content: { schemaVersion: 1, title: '事业发展报告', summary: '用于验证报告版本迁移。', sections, actionItems: ['保留现实反馈'], openQuestions: ['后续体验如何？'], disclaimer: '仅供传统文化学习参考。' }, evidenceBySection: [], inputTokens: 10, outputTokens: 20 });

    getDatabase().prepare(`
      INSERT INTO context_runs (
        id, conversation_id, trigger_message_id, assistant_message_id,
        provider, model, context_limit, output_reserve, input_budget,
        estimated_input_tokens, summary_version, recent_message_start_seq,
        recent_message_count, retrieved_message_ids_json, context_manifest_json,
        status, created_at, completed_at
      ) VALUES (?, ?, ?, ?, 'test', 'fixture', 10000, 1000, 9000, 500, 1, 1, 2, ?, ?, 'completed', ?, ?)
    `).run(
      'context-run-transfer-fixture',
      conversation.id,
      userMessage.id,
      assistantMessage.id,
      JSON.stringify([userMessage.id]),
      JSON.stringify({ triggerMessageId: userMessage.id, assistantMessageId: assistantMessage.id }),
      Date.now(),
      Date.now(),
    );

    const exported = createChartPackage(conversation.id);
    assert.ok(exported.fileName.endsWith('.ziweichart.json'));
    assert.ok(exported.buffer.length > 1_000);
    const preview = inspectChartPackage(exported.buffer, exported.fileName);
    assert.equal(preview.compatible, true);
    assert.equal(preview.sourceConversationId, conversation.id);
    assert.ok(preview.totalRows >= 9);
    assert.ok(preview.idConflictCount >= 9, '在同一数据库预检时应识别原记录编号冲突');
    assert.equal(preview.content.memories, 1);
    assert.equal(preview.content.events, 1);
    assert.ok(preview.content.transitRecords >= 1);
    assert.ok(preview.content.reports >= 2);

    const exportResponse = await exportRoute.GET(new Request(`http://localhost/api/chart-packages/export?conversationId=${conversation.id}`));
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-disposition') ?? '', /\.ziweichart\.json/);
    const apiBuffer = Buffer.from(await exportResponse.arrayBuffer());

    const inspectForm = new FormData();
    inspectForm.set('chartPackage', new File([new Uint8Array(apiBuffer)], exported.fileName, { type: 'application/json' }));
    const inspectResponse = await inspectRoute.POST(new Request('http://localhost/api/chart-packages/inspect', { method: 'POST', body: inspectForm }));
    assert.equal(inspectResponse.status, 200);

    await assert.rejects(
      Promise.resolve().then(() => importChartPackage({ buffer: exported.buffer, confirmation: '确认' })),
      (error: unknown) => error instanceof ChartPackageValidationError && error.code === 'CONFIRMATION_REQUIRED',
    );

    const importForm = new FormData();
    importForm.set('chartPackage', new File([new Uint8Array(apiBuffer)], exported.fileName, { type: 'application/json' }));
    importForm.set('title', '单命盘迁移测试档案（副本）');
    importForm.set('confirmation', CHART_IMPORT_CONFIRMATION);
    const importResponse = await importRoute.POST(new Request('http://localhost/api/chart-packages/import', { method: 'POST', body: importForm }));
    assert.equal(importResponse.status, 200);
    const importData = await importResponse.json() as { result: { conversationId: string; importedRows: number; remappedIds: number } };
    const importedConversationId = importData.result.conversationId;
    assert.notEqual(importedConversationId, conversation.id);
    assert.equal(importData.result.importedRows, preview.totalRows);

    const importedMessages = getDatabase().prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq').all(importedConversationId) as Array<{ id: string; content: string }>;
    assert.equal(importedMessages.length, 2);
    assert.notEqual(importedMessages[0].id, userMessage.id);
    const importedMemory = getDatabase().prepare('SELECT * FROM memory_items WHERE conversation_id = ?').get(importedConversationId) as { id: string; source_message_id: string };
    assert.notEqual(importedMemory.id, memory.id);
    assert.equal(importedMemory.source_message_id, importedMessages[0].id);
    const importedEvent = getDatabase().prepare('SELECT * FROM life_events WHERE conversation_id = ?').get(importedConversationId) as { id: string; source_message_id: string };
    assert.notEqual(importedEvent.id, lifeEvent.id);
    assert.equal(importedEvent.source_message_id, importedMessages[0].id);
    const importedTransit = getDatabase().prepare('SELECT * FROM transit_snapshots WHERE conversation_id = ? AND target_date = ?').get(importedConversationId, '2020') as { id: string };
    assert.notEqual(importedTransit.id, transit.id);

    const importedReport = getDatabase().prepare('SELECT * FROM reports WHERE conversation_id = ?').get(importedConversationId) as { id: string; active_version_id: string };
    const importedVersion = getDatabase().prepare('SELECT * FROM report_versions WHERE report_id = ?').get(importedReport.id) as { id: string };
    assert.equal(importedReport.active_version_id, importedVersion.id, '未声明为外键的 active_version_id 也必须重新映射');
    assert.notEqual(importedVersion.id, claim.version.id);
    const importedContext = getDatabase().prepare('SELECT * FROM context_runs WHERE conversation_id = ?').get(importedConversationId) as { trigger_message_id: string; retrieved_message_ids_json: string; context_manifest_json: string };
    assert.equal(importedContext.trigger_message_id, importedMessages[0].id);
    assert.deepEqual(JSON.parse(importedContext.retrieved_message_ids_json), [importedMessages[0].id]);
    assert.equal(JSON.parse(importedContext.context_manifest_json).assistantMessageId, importedMessages[1].id, 'JSON 内嵌编号必须同步重映射');

    const beforeBrokenImport = (getDatabase().prepare('SELECT COUNT(*) AS total FROM conversations').get() as { total: number }).total;
    const broken = JSON.parse(exported.buffer.toString('utf8')) as { source: unknown; inventory: unknown; boundaries: unknown; payload: { tables: Record<string, Array<Record<string, unknown>>> }; contentSha256: string };
    broken.payload.tables.messages[1].seq = broken.payload.tables.messages[0].seq;
    broken.contentSha256 = createHash('sha256').update(JSON.stringify({ source: broken.source, inventory: broken.inventory, boundaries: broken.boundaries, payload: broken.payload })).digest('hex');
    assert.throws(
      () => importChartPackage({ buffer: Buffer.from(JSON.stringify(broken)), confirmation: CHART_IMPORT_CONFIRMATION, title: '事务回滚测试' }),
      (error: unknown) => error instanceof ChartPackageValidationError && error.code === 'IMPORT_TRANSACTION_FAILED',
    );
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS total FROM conversations').get() as { total: number }).total, beforeBrokenImport, '任意记录写入失败时必须回滚整份命盘');

    const tampered = JSON.parse(exported.buffer.toString('utf8')) as { source: { title: string } };
    tampered.source.title = '被篡改标题';
    assert.throws(
      () => inspectChartPackage(Buffer.from(JSON.stringify(tampered))),
      (error: unknown) => error instanceof ChartPackageValidationError && error.code === 'CONTENT_DIGEST_MISMATCH',
      '来源标题也属于受保护清单，不能在导出后被静默篡改',
    );
    const tamperedPayload = JSON.parse(exported.buffer.toString('utf8')) as { payload: { tables: Record<string, Array<Record<string, unknown>>> } };
    tamperedPayload.payload.tables.messages[0].content = '被篡改内容';
    assert.throws(
      () => inspectChartPackage(Buffer.from(JSON.stringify(tamperedPayload))),
      (error: unknown) => error instanceof ChartPackageValidationError && error.code === 'CONTENT_DIGEST_MISMATCH',
    );
    assert.equal(getDatabase().pragma('integrity_check', { simple: true }), 'ok');
    assert.equal((getDatabase().pragma('foreign_key_check') as unknown[]).length, 0);
    console.log('单命盘迁移测试通过：关联闭包、API 导出预检、全量 ID/JSON 重映射、创建副本、冲突识别和事务回滚均正常。');
  } finally {
    closeDatabaseConnection();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
