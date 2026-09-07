import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-reports-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, deleteConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const {
    claimReportVersion,
    completeReportVersion,
    failReportVersion,
    getOrCreateReport,
    getReportDetail,
    listReports,
  } = await import('../lib/db/reports');
  const { buildReportEvidence } = await import('../lib/reports/facts');
  const { buildTopicReportMessages, parseAndValidateReportContent, generateTopicReport } = await import('../lib/reports/service');
  const { REPORT_TYPE_DEFINITIONS } = await import('../lib/reports/types');

  try {
    const birthInfo = { year: 1991, month: 8, day: 12, hour: 6, gender: 'female' as const };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({
      type: 'chart',
      title: '专题报告测试',
      birthInfo,
      chartSnapshot: chart,
    });

    const evidence = buildReportEvidence(chart, 'career');
    assert.ok(evidence.some(item => item.evidenceKey.startsWith('palace:官禄宫')));
    assert.ok(evidence.some(item => item.kind === 'daxian'));
    const prompt = buildTopicReportMessages('career', evidence).map(message => message.content).join('\n');
    assert.match(prompt, /事业发展报告/);
    assert.match(prompt, /evidenceIds/);
    assert.doesNotMatch(prompt, /专题报告测试/, '报告上下文不应包含会话标题或姓名');

    const definition = REPORT_TYPE_DEFINITIONS.career;
    const validEvidenceId = evidence.find(item => item.kind === 'palace')!.evidenceKey;
    const rawContent = JSON.stringify({
      title: '任意标题将被服务端覆盖',
      summary: '这是一段经过结构校验的核心报告摘要。',
      sections: definition.sectionKeys.map(section => ({
        ...section,
        content: `${section.title}的测试内容，结论来自确定性命盘事实。`,
        evidenceIds: [validEvidenceId],
      })),
      actionItems: ['保留阶段记录', '结合现实反馈复盘'],
      openQuestions: ['当前工作的真实体验是否与报告描述一致？'],
    });
    const content = parseAndValidateReportContent(rawContent, 'career', evidence);
    assert.equal(content.title, '事业发展报告');
    assert.equal(content.sections.length, definition.sectionKeys.length);
    assert.deepEqual(content.sections[0].evidenceIds, [validEvidenceId]);
    assert.equal(content.sections[0].basis, 'evidence');

    const invalidReference = JSON.parse(rawContent);
    invalidReference.sections[0].evidenceIds.push('invalid:evidence');
    assert.throws(() => parseAndValidateReportContent(JSON.stringify(invalidReference), 'career', evidence), /未知证据/);
    const duplicate = JSON.parse(rawContent);
    duplicate.sections[1] = duplicate.sections[0];
    assert.throws(() => parseAndValidateReportContent(JSON.stringify(duplicate), 'career', evidence), /完整且唯一/);
    const repeated = JSON.parse(rawContent);
    repeated.sections[1].content = repeated.sections[0].content;
    assert.throws(() => parseAndValidateReportContent(JSON.stringify(repeated), 'career', evidence), /重复/);
    const synthesis = JSON.parse(rawContent);
    synthesis.sections[0].evidenceIds = [];
    assert.throws(() => parseAndValidateReportContent(JSON.stringify(synthesis), 'career', evidence), /综合观察/);
    synthesis.sections[0].content = '综合观察：需要结合实际工作反馈继续核对。';
    assert.equal(parseAndValidateReportContent(JSON.stringify(synthesis), 'career', evidence).sections[0].basis, 'synthesis');
    const noActions = JSON.parse(rawContent);
    noActions.actionItems = [];
    assert.throws(() => parseAndValidateReportContent(JSON.stringify(noActions), 'career', evidence), /可操作建议/);

    const report = getOrCreateReport(conversation.id, 'career');
    assert.equal(getOrCreateReport(conversation.id, 'career').id, report.id, '同一会话同类报告必须复用主记录');
    const claimV1 = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-v1',
      promptVersion: 'topic-report-v1',
      provider: 'test',
      model: 'test-model',
      regenerate: false,
      staleAfterMs: 60_000,
    });
    assert.equal(claimV1.claimed, true);
    assert.equal(claimV1.version.version, 1);

    const concurrent = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-v1',
      promptVersion: 'topic-report-v1',
      provider: 'test',
      model: 'test-model',
      regenerate: false,
      staleAfterMs: 60_000,
    });
    assert.equal(concurrent.claimed, false, '生成中的报告不能被重复认领');
    assert.equal(concurrent.version.id, claimV1.version.id);

    completeReportVersion({
      versionId: claimV1.version.id,
      content,
      evidenceBySection: content.sections.map(section => ({
        sectionKey: section.key,
        evidence: [evidence.find(item => item.evidenceKey === validEvidenceId)!],
      })),
      inputTokens: 100,
      outputTokens: 200,
    });
    const detailV1 = getReportDetail(report.id)!;
    assert.equal(detailV1.version?.version, 1);
    assert.equal(detailV1.evidence.length, content.sections.length);

    const cached = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-v1',
      promptVersion: 'topic-report-v1',
      provider: 'test',
      model: 'test-model',
      regenerate: false,
      staleAfterMs: 60_000,
    });
    assert.equal(cached.claimed, false);
    assert.equal(cached.version.version, 1);

    const claimV2 = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-v1',
      promptVersion: 'topic-report-v1',
      provider: 'test',
      model: 'test-model',
      regenerate: true,
      staleAfterMs: 60_000,
    });
    assert.equal(claimV2.version.version, 2);
    failReportVersion(claimV2.version.id, '模拟生成失败');
    assert.equal(getReportDetail(report.id)?.version?.version, 1, '新版本失败不能覆盖旧的有效版本');

    const claimV3 = claimReportVersion({
      reportId: report.id,
      engineVersion: 'ziwei-v1',
      promptVersion: 'topic-report-v1',
      provider: 'test',
      model: 'test-model',
      regenerate: true,
      staleAfterMs: 60_000,
    });
    completeReportVersion({
      versionId: claimV3.version.id,
      content: { ...content, summary: '第三版报告摘要。' },
      evidenceBySection: [],
      inputTokens: null,
      outputTokens: null,
    });
    const detailV3 = getReportDetail(report.id)!;
    assert.equal(detailV3.version?.version, 3);
    assert.equal(detailV3.versions.length, 3);
    assert.equal(listReports(conversation.id)[0].versionCount, 3);

    // 实际生成服务使用合成数据库和模拟响应，不调用真实供应商。
    process.env.AI_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'local-test';
    process.env.DEEPSEEK_BASE_URL = 'http://127.0.0.1:30003';
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let alwaysInvalid = false;
    try {
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), 'http://127.0.0.1:30003/chat/completions');
        calls++;
        const request = JSON.parse(String(init?.body));
        if (calls === 2) {
          assert.match(request.messages.at(-1).content, /未知证据/);
          assert.match(request.messages[1].content, /可引用的权威证据/);
        }
        return new Response(JSON.stringify({
          choices: [{ message: { content: alwaysInvalid || calls === 1 ? JSON.stringify(invalidReference) : rawContent } }],
          usage: { prompt_tokens: 100, completion_tokens: 200 },
        }), { status: 200 });
      };
      const repaired = await generateTopicReport({ conversationId: conversation.id, type: 'career', regenerate: true });
      assert.equal(calls, 2, '内容失败仅修正一次');
      assert.equal(repaired.version?.version, 4);
      assert.equal(repaired.version?.inputTokens, 200);
      assert.equal(repaired.version?.outputTokens, 400);
      alwaysInvalid = true;
      calls = 0;
      await assert.rejects(generateTopicReport({ conversationId: conversation.id, type: 'career', regenerate: true }), /未知证据/);
      assert.equal(calls, 2, '修正失败不无限重试');
      assert.equal(getReportDetail(report.id)?.version?.version, 4, '修正失败保留旧完成版');
      calls = 0;
      globalThis.fetch = async () => { calls++; return new Response('模拟故障', { status: 503 }); };
      await assert.rejects(generateTopicReport({ conversationId: conversation.id, type: 'career', regenerate: true }), /503/);
      assert.equal(calls, 1, '网络故障不触发内容修正');
    } finally {
      globalThis.fetch = originalFetch;
    }

    const migration = getDatabase().prepare('SELECT version FROM schema_migrations WHERE version = 6').get();
    assert.ok(migration, '数据库第 6 版迁移必须存在');
    assert.equal(deleteConversation(conversation.id), true);
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM reports WHERE conversation_id = ?').get(conversation.id) as { count: number }).count,
      0,
      '删除会话后报告必须级联删除',
    );

    console.log('专题报告测试通过：证据构建、结构校验、并发保护、版本保留、失败回退与级联删除均正常。');
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
