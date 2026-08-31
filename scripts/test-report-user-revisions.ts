import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-report-revisions-test-'));
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
  const { getReportUserRevision } = await import('../lib/db/report-user-revisions');
  const { getOrCreateAnnualTransit } = await import('../lib/transits/service');
  const {
    claimAnnualTransitReport,
    completeAnnualTransitReportVersion,
  } = await import('../lib/db/transit-reports');
  const { resolveReportExportDocument } = await import('../lib/report-exports/source');
  const revisionRoute = await import('../app/api/report-user-revisions/route');
  const { REPORT_TYPE_DEFINITIONS } = await import('../lib/reports/types');
  type ReportContent = import('../lib/reports/types').ReportContent;

  try {
    const birthInfo = { year: 1990, month: 5, day: 18, hour: 9, gender: 'male' as const };
    const conversation = createConversation({
      type: 'chart',
      title: 'M3-3 报告确认测试命盘',
      birthInfo,
      chartSnapshot: generateChart(birthInfo),
    });
    const report = getOrCreateReport(conversation.id, 'career');
    const definition = REPORT_TYPE_DEFINITIONS.career;
    const originalContent: ReportContent = {
      schemaVersion: 1,
      title: definition.label,
      summary: 'AI 原始摘要。',
      sections: definition.sectionKeys.map(section => ({
        key: section.key,
        title: section.title,
        content: `${section.title}的 AI 原始正文。`,
        basis: 'evidence',
        evidenceIds: ['chart:core'],
      })),
      actionItems: ['AI 原始行动建议'],
      openQuestions: ['AI 原始待核实问题'],
      disclaimer: '系统固定免责声明。',
    };
    const claim = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-review-test-v1',
      promptVersion: 'topic-report-review-test-v1',
      provider: 'test',
      model: 'fixture',
      regenerate: false,
      staleAfterMs: 60_000,
    });
    completeReportVersion({
      versionId: claim.version.id,
      content: originalContent,
      evidenceBySection: [{
        sectionKey: definition.sectionKeys[0].key,
        evidence: [{
          evidenceKey: 'chart:core',
          kind: 'chart_core',
          label: '命盘核心结构',
          source: 'chart_snapshot',
          facts: { mingGong: '测试宫位' },
        }],
      }],
      inputTokens: 100,
      outputTokens: 200,
    });

    const emptyResponse = await revisionRoute.GET(new Request(
      `http://localhost/api/report-user-revisions?sourceKind=topic&reportId=${report.id}&version=1`,
    ));
    assert.equal(emptyResponse.status, 200);
    assert.equal((await emptyResponse.json() as { revision: unknown }).revision, null);

    const submittedContent: ReportContent = {
      ...originalContent,
      title: '试图修改系统标题',
      summary: '人工修订后的摘要。',
      sections: originalContent.sections.map((section, index) => ({
        ...section,
        title: '试图修改章节标题',
        basis: 'synthesis',
        evidenceIds: [],
        content: index === 0 ? '人工修订后的事业正文。' : section.content,
      })),
      actionItems: ['人工行动建议'],
      openQuestions: ['人工待核实问题'],
      disclaimer: '试图移除免责声明。',
    };
    const draftResponse = await revisionRoute.PUT(jsonRequest({
      sourceKind: 'topic',
      reportId: report.id,
      version: 1,
      reviewStatus: 'draft',
      note: '这是用户自己的现实反馈。',
      editedContent: { format: 'structured', content: submittedContent },
    }));
    assert.equal(draftResponse.status, 200);
    const draft = (await draftResponse.json() as { revision: import('../lib/report-revisions/types').ReportUserRevision }).revision;
    assert.equal(draft.editRevision, 1);
    assert.equal(draft.editedContent?.format, 'structured');
    if (draft.editedContent?.format !== 'structured') throw new Error('结构化修订稿缺失');
    assert.equal(draft.editedContent.content.title, originalContent.title, '系统标题不能被人工覆盖');
    assert.equal(draft.editedContent.content.sections[0].title, originalContent.sections[0].title, '章节标题不能被人工覆盖');
    assert.equal(draft.editedContent.content.sections[0].basis, 'evidence', '证据类型不能被人工覆盖');
    assert.deepEqual(draft.editedContent.content.sections[0].evidenceIds, ['chart:core'], '证据映射不能被人工覆盖');
    assert.equal(draft.editedContent.content.disclaimer, originalContent.disclaimer, '免责声明不能被人工覆盖');
    assert.equal(getReportDetail(report.id, 1)?.version?.content?.summary, 'AI 原始摘要。', 'AI 原始版本必须保持不可变');

    const confirmedResponse = await revisionRoute.PUT(jsonRequest({
      sourceKind: 'topic',
      reportId: report.id,
      version: 1,
      reviewStatus: 'confirmed',
      note: draft.note,
      editedContent: draft.editedContent,
    }));
    assert.equal(confirmedResponse.status, 200);
    const confirmed = (await confirmedResponse.json() as { revision: import('../lib/report-revisions/types').ReportUserRevision }).revision;
    assert.equal(confirmed.reviewStatus, 'confirmed');
    assert.ok(confirmed.confirmedAt);
    assert.equal(confirmed.editRevision, 1, '仅变更确认状态不应增加人工修订稿号');

    const topicDocument = resolveReportExportDocument({ sourceKind: 'topic', reportId: report.id, version: 1 });
    assert.equal(topicDocument.summary, '人工修订后的摘要。');
    assert.match(topicDocument.versionLabel, /人工修订r1/);
    assert.ok(topicDocument.metadata.some(item => item.label === '用户确认' && item.value === '已确认'));
    assert.ok(topicDocument.sections.some(section => section.title === '个人备注' && section.content.includes('现实反馈')));

    const transit = getOrCreateAnnualTransit(conversation.id, 2027);
    const annualClaim = claimAnnualTransitReport({
      conversationId: conversation.id,
      snapshotId: transit.id,
      targetDate: '2027',
      engineVersion: transit.engineVersion,
      promptVersion: 'annual-review-test-v1',
      provider: 'test',
      model: 'fixture',
      regenerate: false,
      staleAfterMs: 60_000,
    });
    completeAnnualTransitReportVersion(annualClaim.version.id, {
      content: '**【年度总览】**\nAI 年度原文。',
      inputTokens: 50,
      outputTokens: 100,
    });
    const annualResponse = await revisionRoute.PUT(jsonRequest({
      sourceKind: 'annual',
      reportId: annualClaim.report.id,
      version: 1,
      reviewStatus: 'needs_revision',
      note: '需要继续观察。',
      editedContent: { format: 'plain_text', content: '**【年度总览】**\n人工年度修订稿。' },
    }));
    assert.equal(annualResponse.status, 200);
    const annualDocument = resolveReportExportDocument({ sourceKind: 'annual', reportId: annualClaim.report.id, version: 1 });
    assert.ok(annualDocument.sections.some(section => section.content.includes('人工年度修订稿')));
    assert.ok(annualDocument.metadata.some(item => item.value === '待调整'));

    const invalidResponse = await revisionRoute.PUT(jsonRequest({
      sourceKind: 'annual',
      reportId: annualClaim.report.id,
      version: 1,
      reviewStatus: 'confirmed',
      note: '',
      editedContent: { format: 'structured', content: submittedContent },
    }));
    assert.equal(invalidResponse.status, 400, '不同报告格式不能混用');

    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 44').get());
    assert.equal(getReportUserRevision('topic', claim.version.id)?.reviewStatus, 'confirmed');
    assert.equal(deleteConversation(conversation.id), true);
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM report_user_revisions').get() as { count: number }).count,
      0,
      '删除来源会话后，四类报告的用户修订记录必须跟随版本清理',
    );

    console.log('M3-3 报告确认与人工修订测试通过：版本隔离、不可变原文、字段边界、备注、确认状态、年度文本、PDF 来源与级联清理均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/report-user-revisions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
