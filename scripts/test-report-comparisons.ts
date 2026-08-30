import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-report-comparisons-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, deleteConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const {
    claimReportVersion,
    completeReportVersion,
    getOrCreateReport,
    getReportDetail,
  } = await import('../lib/db/reports');
  const {
    claimAnnualTransitReport,
    completeAnnualTransitReportVersion,
    getAnnualTransitReportDetail,
  } = await import('../lib/db/transit-reports');
  const { getOrCreateAnnualTransit } = await import('../lib/transits/service');
  const { compareReportVersions } = await import('../lib/report-comparisons/service');
  const { resolveReportExportDocument } = await import('../lib/report-exports/source');
  const { GET: compareRoute } = await import('../app/api/report-comparisons/route');
  const { REPORT_TYPE_DEFINITIONS } = await import('../lib/reports/types');
  type ReportContent = import('../lib/reports/types').ReportContent;
  type ReportEvidenceDraft = import('../lib/reports/types').ReportEvidenceDraft;

  try {
    const birthInfo = { year: 1991, month: 8, day: 12, hour: 6, gender: 'female' as const };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({
      type: 'chart',
      title: '报告版本对比测试',
      birthInfo,
      chartSnapshot: chart,
    });

    const report = getOrCreateReport(conversation.id, 'career');
    const definition = REPORT_TYPE_DEFINITIONS.career;
    const makeContent = (summary: string, firstSection: string): ReportContent => ({
      schemaVersion: 1,
      title: definition.label,
      summary,
      sections: definition.sectionKeys.map((section, index) => ({
        key: section.key,
        title: section.title,
        content: index === 0 ? firstSection : `${section.title}保持一致。`,
        basis: index === 0 ? 'evidence' : 'synthesis',
        evidenceIds: index === 0 ? ['palace:官禄宫'] : [],
      })),
      actionItems: ['保留阶段记录'],
      openQuestions: ['现实体验是否一致？'],
      disclaimer: '传统文化研究参考。',
    });
    const evidenceV1: ReportEvidenceDraft = {
      evidenceKey: 'palace:官禄宫',
      kind: 'palace',
      label: '官禄宫事实',
      source: 'chart_snapshot',
      facts: { palace: '官禄宫', stars: ['紫微'] },
    };
    const evidenceV3: ReportEvidenceDraft = {
      ...evidenceV1,
      facts: { palace: '官禄宫', stars: ['紫微', '天府'] },
    };

    const claimV1 = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-v1',
      promptVersion: 'topic-report-v1',
      provider: 'test',
      model: 'model-a',
      regenerate: false,
      staleAfterMs: 60_000,
    });
    completeReportVersion({
      versionId: claimV1.version.id,
      content: makeContent('第一版摘要。', '第一版事业驱动力表达。'),
      evidenceBySection: [{ sectionKey: 'career_drive', evidence: [evidenceV1] }],
      inputTokens: 100,
      outputTokens: 200,
    });

    const claimV2 = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-v1',
      promptVersion: 'topic-report-v1',
      provider: 'test',
      model: 'model-a',
      regenerate: true,
      staleAfterMs: 60_000,
    });
    completeReportVersion({
      versionId: claimV2.version.id,
      content: makeContent('第二版摘要，改写了文字。', '第二版事业驱动力表达。'),
      evidenceBySection: [{ sectionKey: 'career_drive', evidence: [evidenceV1] }],
      inputTokens: 110,
      outputTokens: 210,
    });

    const detailV2 = getReportDetail(report.id, 2)!;
    assert.equal(detailV2.version?.generationReason, 'manual_regenerate');
    assert.equal(detailV2.version?.baseVersionId, claimV1.version.id);
    const expressionComparison = compareReportVersions({
      sourceKind: 'topic',
      reportId: report.id,
      baseVersion: 1,
      targetVersion: 2,
    });
    assert.equal(expressionComparison.summary.classification, 'expression_only');
    assert.equal(expressionComparison.summary.evidenceChangedSections, 0);
    assert.ok(expressionComparison.sections.some(item => item.kind === 'expression_changed'));

    const claimV3 = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-v2',
      promptVersion: 'topic-report-v1',
      provider: 'test',
      model: 'model-a',
      regenerate: true,
      generationReason: 'source_changed',
      staleAfterMs: 60_000,
    });
    completeReportVersion({
      versionId: claimV3.version.id,
      content: makeContent('第二版摘要，改写了文字。', '第二版事业驱动力表达。'),
      evidenceBySection: [{ sectionKey: 'career_drive', evidence: [evidenceV3] }],
      inputTokens: 110,
      outputTokens: 210,
    });
    const evidenceComparison = compareReportVersions({
      sourceKind: 'topic',
      reportId: report.id,
      baseVersion: 2,
      targetVersion: 3,
    });
    assert.equal(evidenceComparison.summary.classification, 'evidence_changed');
    assert.equal(evidenceComparison.summary.changedEvidence, 1);
    assert.equal(
      evidenceComparison.sections.find(item => item.key === 'career_drive')?.kind,
      'evidence_changed',
    );
    assert.ok(evidenceComparison.metadata.some(item => item.key === 'engineVersion' && item.changed));

    const apiResponse = await compareRoute(new Request(
      `http://localhost/api/report-comparisons?sourceKind=topic&reportId=${report.id}&baseVersion=1&targetVersion=2`,
    ));
    assert.equal(apiResponse.status, 200);
    const apiComparison = await apiResponse.json() as { summary: { classification: string } };
    assert.equal(apiComparison.summary.classification, 'expression_only');

    const transit = getOrCreateAnnualTransit(conversation.id, 2026);
    const annualIdentity = {
      conversationId: conversation.id,
      snapshotId: transit.id,
      targetDate: '2026',
      engineVersion: transit.engineVersion,
      promptVersion: 'annual-report-v2',
      provider: 'test',
      model: 'annual-model',
      staleAfterMs: 60_000,
    };
    const annualV1 = claimAnnualTransitReport({ ...annualIdentity, regenerate: false });
    completeAnnualTransitReportVersion(annualV1.version.id, {
      content: annualContent('第一版年度总览。', '第一版行动建议。'),
      inputTokens: 300,
      outputTokens: 600,
    });
    const annualV2 = claimAnnualTransitReport({ ...annualIdentity, regenerate: true });
    assert.match(annualV2.report.content, /第一版年度总览/, '年度新版本生成期间应继续保留旧正文');
    completeAnnualTransitReportVersion(annualV2.version.id, {
      content: annualContent('第二版年度总览，仅改写表达。', '第二版行动建议。'),
      inputTokens: 320,
      outputTokens: 620,
    });
    const annualDetail = getAnnualTransitReportDetail(annualV1.report.id)!;
    assert.equal(annualDetail.versions.length, 2);
    assert.equal(annualDetail.report.version, 2);
    assert.equal(annualDetail.versions[0].baseVersionId, annualV1.version.id);
    assert.equal(annualDetail.versions[0].generationReason, 'manual_regenerate');
    const annualComparison = compareReportVersions({
      sourceKind: 'annual',
      reportId: annualV1.report.id,
      baseVersion: 1,
      targetVersion: 2,
    });
    assert.equal(annualComparison.summary.classification, 'expression_only');
    assert.equal(annualComparison.summary.evidenceChangedSections, 0);
    const annualV3 = claimAnnualTransitReport({
      ...annualIdentity,
      promptVersion: 'annual-report-v3',
      regenerate: false,
    });
    assert.equal(annualV3.report.id, annualV1.report.id, '年度模板升级应继续使用同一报告主记录');
    assert.equal(annualV3.version.generationReason, 'template_upgraded');
    assert.equal(annualV3.version.baseVersionId, annualV2.version.id);
    completeAnnualTransitReportVersion(annualV3.version.id, {
      content: annualContent('第三版年度总览，模板已经升级。', '第三版行动建议。'),
      inputTokens: 330,
      outputTokens: 630,
    });
    const annualTemplateComparison = compareReportVersions({
      sourceKind: 'annual',
      reportId: annualV1.report.id,
      baseVersion: 2,
      targetVersion: 3,
    });
    assert.ok(annualTemplateComparison.metadata.some(item => item.key === 'promptVersion' && item.changed));
    const annualV1Export = resolveReportExportDocument({
      sourceKind: 'annual',
      reportId: annualV1.report.id,
      version: 1,
    });
    assert.equal(annualV1Export.sourceVersionId, annualV1.version.id);
    assert.equal(annualV1Export.versionLabel, 'v1');

    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 43').get());
    const transitVersionColumns = getDatabase().prepare('PRAGMA table_info(transit_report_versions)')
      .all() as Array<{ name: string }>;
    assert.ok(transitVersionColumns.some(column => column.name === 'generation_reason'));
    assert.equal(deleteConversation(conversation.id), true);
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM transit_report_versions').get() as { count: number }).count,
      0,
      '删除会话后年度报告历史版本必须级联清理',
    );

    console.log('M3-2 报告版本对比测试通过：表达变化、事实依据变化、生成审计、年度不可变历史、API 与 PDF 指定版本均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function annualContent(summary: string, action: string): string {
  return [
    '**【年度总览】**', summary,
    '**【命格在本年的表现】**', '命格表现保持一致。',
    '**【感情与关系】**', '关系分析保持一致。',
    '**【事业与学习】**', '事业分析保持一致。',
    '**【财运与资源】**', '财运分析保持一致。',
    '**【健康与生活节奏】**', '健康分析保持一致。',
    '**【性格与人际表现】**', '人际分析保持一致。',
    '**【年度行动建议】**', action,
  ].join('\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
