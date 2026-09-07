import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-report-pdf-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(tempDirectory, 'exports');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, deleteConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const {
    claimReportVersion,
    completeReportVersion,
    getOrCreateReport,
  } = await import('../lib/db/reports');
  const { getReportExport, listReportExports } = await import('../lib/db/report-exports');
  const {
    ensureReportPdfExport,
    getReportExportRoot,
    pruneOrphanedReportExportFiles,
    readReportExportFile,
  } = await import('../lib/report-exports/service');
  const { parseAnnualContent } = await import('../lib/report-exports/source');
  const { REPORT_TYPE_DEFINITIONS } = await import('../lib/reports/types');
  const { getOrCreateAnnualTransit } = await import('../lib/transits/service');
  const { claimAnnualTransitReport, completeAnnualTransitReport } = await import('../lib/db/transit-reports');
  const reportExportRoute = await import('../app/api/report-exports/route');
  const downloadRoute = await import('../app/api/report-exports/[exportId]/download/route');

  try {
    const birthInfo = { year: 1992, month: 7, day: 9, hour: 8, gender: 'female' as const };
    const conversation = createConversation({
      type: 'chart',
      title: 'M3-1 PDF 导出测试命盘',
      birthInfo,
      chartSnapshot: generateChart(birthInfo),
    });
    const report = getOrCreateReport(conversation.id, 'career');
    const claim = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-pdf-test-v1',
      promptVersion: 'topic-report-pdf-test-v1',
      provider: 'test',
      model: 'fixed-fixture',
      regenerate: false,
      staleAfterMs: 60_000,
    });
    const sectionText = '这是一段用于验证中文字体嵌入、自动换行和多页分页的结构化报告内容。系统只导出已经保存在数据库中的报告，不会在导出时重新调用模型，也不会补造用户没有确认的现实经历。'.repeat(7);
    const content = {
      schemaVersion: 1 as const,
      title: '事业发展报告',
      summary: '本摘要用于验证服务端 PDF 的中文排版、摘要卡片、版本元数据和长文本分页。导出的文件需要能够刷新后重复下载，并通过文件大小与 SHA-256 指纹校验。',
      sections: REPORT_TYPE_DEFINITIONS.career.sectionKeys.map((section, index) => ({
        key: section.key,
        title: section.title,
        content: `${sectionText}\n第 ${index + 1} 节继续保留来源边界和谨慎解释。`,
        basis: 'evidence' as const,
        evidenceIds: ['fixture:chart-core'],
      })),
      actionItems: ['保留阶段记录并定期复盘', '把命盘结论与现实反馈分开记录', '重要决策继续参考专业意见'],
      openQuestions: ['当前工作体验是否与报告观察一致？', '哪些结论仍需要现实信息验证？'],
      disclaimer: '本报告属于传统文化研究与自我观察参考，不构成医疗、投资、法律、婚姻或其他专业决策建议。',
    };
    const evidence = {
      evidenceKey: 'fixture:chart-core',
      kind: 'chart_core' as const,
      label: '命盘核心结构快照',
      source: 'chart_snapshot' as const,
      facts: { wuxingJu: '测试五行局', mingGongBranch: '辰' },
    };
    completeReportVersion({
      versionId: claim.version.id,
      content,
      evidenceBySection: content.sections.map(section => ({ sectionKey: section.key, evidence: [evidence] })),
      inputTokens: 100,
      outputTokens: 500,
    });

    const first = await ensureReportPdfExport({ sourceKind: 'topic', reportId: report.id, version: 1 });
    assert.equal(first.reused, false);
    assert.equal(first.record.rendererVersion, 'report-pdf-v2');
    if (process.env.PDF_REVIEW_OUTPUT) {
      const exported = await readReportExportFile(first.record.id);
      writeFileSync(process.env.PDF_REVIEW_OUTPUT, exported.buffer);
    }
    assert.equal(first.record.status, 'completed');
    assert.equal(first.record.sourceVersionId, claim.version.id);
    assert.ok((first.record.byteSize ?? 0) > 20_000, '嵌入中文字体后的 PDF 文件不应异常偏小');
    assert.match(first.record.sha256 ?? '', /^[0-9a-f]{64}$/);
    const storedPath = path.join(getReportExportRoot(), first.record.relativePath!);
    assert.ok(existsSync(storedPath));
    const stored = readFileSync(storedPath);
    assert.equal(stored.subarray(0, 5).toString('ascii'), '%PDF-');

    const second = await ensureReportPdfExport({ sourceKind: 'topic', reportId: report.id, version: 1 });
    assert.equal(second.reused, true);
    assert.equal(second.record.id, first.record.id, '同一来源指纹与渲染版本必须复用同一导出');
    assert.equal(listReportExports({ sourceKind: 'topic', reportId: report.id }).length, 1);

    const apiResponse = await reportExportRoute.POST(new Request('http://localhost/api/report-exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceKind: 'topic', reportId: report.id, version: 1 }),
    }));
    assert.equal(apiResponse.status, 200);
    const apiData = await apiResponse.json() as { export: { id: string }; reused: boolean; downloadUrl: string };
    assert.equal(apiData.export.id, first.record.id);
    assert.equal(apiData.reused, true);

    const downloadResponse = await downloadRoute.GET(
      new Request(`http://localhost${apiData.downloadUrl}`),
      { params: Promise.resolve({ exportId: first.record.id }) },
    );
    assert.equal(downloadResponse.status, 200);
    assert.match(downloadResponse.headers.get('content-type') ?? '', /application\/pdf/);
    assert.match(downloadResponse.headers.get('content-disposition') ?? '', /filename\*=UTF-8''/);
    const downloaded = Buffer.from(await downloadResponse.arrayBuffer());
    assert.equal(downloaded.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.equal(downloaded.length, first.record.byteSize);

    writeFileSync(storedPath, Buffer.from('%PDF-corrupted'));
    const repaired = await ensureReportPdfExport({ sourceKind: 'topic', reportId: report.id, version: 1 });
    assert.equal(repaired.reused, false, '文件损坏时必须重新生成而不是返回错误缓存');
    assert.equal(repaired.record.id, first.record.id);
    assert.ok((await readReportExportFile(repaired.record.id)).buffer.length > 20_000);

    const annual = parseAnnualContent('年度导语。\n\n**【事业】**\n事业部分。\n\n**【情感】**\n情感部分。');
    assert.equal(annual.summary, '年度导语。');
    assert.deepEqual(annual.sections.map(section => section.title), ['事业', '情感']);
    await assert.rejects(
      ensureReportPdfExport({ sourceKind: 'heming', reportId: report.id, version: 1 }),
      /类型与导出类型不一致/,
    );

    const transit = getOrCreateAnnualTransit(conversation.id, 2026);
    const annualClaim = claimAnnualTransitReport({
      conversationId: conversation.id,
      snapshotId: transit.id,
      targetDate: '2026',
      engineVersion: transit.engineVersion,
      promptVersion: 'annual-report-pdf-test-v1',
      provider: 'test',
      model: 'fixed-fixture',
      regenerate: false,
      staleAfterMs: 60_000,
    });
    completeAnnualTransitReport(annualClaim.report.id, {
      content: '**【年度总览】**\n年度报告服务端导出测试。\n\n**【事业与学习】**\n保持现实反馈和命盘解释分层。',
      inputTokens: 50,
      outputTokens: 100,
    });
    const annualExport = await ensureReportPdfExport({
      sourceKind: 'annual',
      reportId: annualClaim.report.id,
    });
    assert.equal(annualExport.record.sourceTransitReportId, annualClaim.report.id);
    assert.equal(annualExport.record.sourceReportId, null);
    assert.equal(listReportExports({ sourceKind: 'annual', reportId: annualClaim.report.id }).length, 1);
    assert.throws(
      () => getDatabase().prepare(`INSERT INTO report_exports (
        id, source_kind, source_version_id, source_fingerprint, renderer_version,
        file_name, mime_type, status, created_at, updated_at
      ) VALUES ('invalid', 'topic', 'v', 'f', 'r', 'x.pdf', 'application/pdf', 'failed', 1, 1)`).run(),
      /CHECK constraint failed/,
      '导出记录必须且只能关联一种来源报告',
    );
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 42').get());

    const qaOutput = process.env.PDF_QA_OUTPUT;
    if (qaOutput) {
      const target = path.resolve(qaOutput);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(storedPath, target);
    }

    assert.equal(deleteConversation(conversation.id), true);
    assert.equal(getReportExport(first.record.id), null, '删除报告来源后导出记录必须级联删除');
    assert.equal(getReportExport(annualExport.record.id), null, '删除年度报告来源后导出记录必须级联删除');
    assert.equal(await pruneOrphanedReportExportFiles(), 2, '下次维护应清理失去数据库记录的 PDF 文件');
    assert.equal(existsSync(storedPath), false);

    console.log('M3-1 服务端 PDF 测试通过：中文多页渲染、版本缓存、API 下载、完整性修复、v42 约束、级联记录与孤儿文件清理均正常。');
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
