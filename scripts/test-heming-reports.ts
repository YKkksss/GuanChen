import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-heming-reports-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { evaluateHeming } = await import('../lib/heming/engine');
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
  const { buildHemingReportEvidence } = await import('../lib/reports/heming-facts');
  const {
    buildHemingReportMessages,
    parseAndValidateHemingReportContent,
  } = await import('../lib/reports/service');
  const { HEMING_REPORT_DEFINITION } = await import('../lib/reports/types');

  try {
    const birthInfoA = { year: 1990, month: 6, day: 15, hour: 4, gender: 'male' as const, name: '不应进入报告的甲方姓名', city: '甲方隐私城市' };
    const birthInfoB = { year: 1992, month: 8, day: 20, hour: 6, gender: 'female' as const, name: '不应进入报告的乙方姓名', city: '乙方隐私城市', unknownTime: true };
    const chartA = generateChart(birthInfoA);
    const chartB = generateChart(birthInfoB);
    const relationshipContext = {
      ownerARole: '产品合伙人', ownerBRole: '市场合伙人', customRelationshipLabel: null,
      mainConcern: '决策和股权边界',
      confirmedFacts: { planned_roles: '甲方产品，乙方市场', decision_process: '重大事项共同确认' },
    };
    const evaluation = evaluateHeming({ chartA, chartB, relationshipType: 'business', relationshipContext });
    const evidence = buildHemingReportEvidence(evaluation, relationshipContext);

    assert.ok(evidence.some(item => item.kind === 'heming_context'));
    assert.ok(evidence.some(item => item.kind === 'heming_palace' && item.facts.owner === 'A'));
    assert.ok(evidence.some(item => item.kind === 'heming_palace' && item.facts.owner === 'B'));
    assert.ok(evidence.some(item => item.kind === 'heming_stage'));
    assert.ok(evidence.some(item => item.kind === 'heming_rule'));
    assert.ok(evidence.filter(item => item.kind === 'heming_palace').every(item => item.evidenceKey.includes(`:${String(item.facts.owner)}:`)));

    const prompt = buildHemingReportMessages(evidence, evaluation.warnings).map(message => message.content).join('\n');
    assert.match(prompt, /合盘关系报告/);
    assert.match(prompt, /产品合伙人/);
    assert.match(prompt, /市场合伙人/);
    assert.match(prompt, /不得输出总分/);
    assert.doesNotMatch(prompt, /不应进入报告/);
    assert.doesNotMatch(prompt, /隐私城市/);
    assert.doesNotMatch(prompt, /selfSihua/);

    const validEvidenceId = evidence.find(item => item.kind === 'heming_rule')?.evidenceKey
      ?? evidence[0].evidenceKey;
    const raw = JSON.stringify({
      title: '模型返回标题会被覆盖',
      summary: '双方在商业协作中存在可观察的结构对应，也有需要通过明确职责和现实规则持续验证的部分。',
      sections: HEMING_REPORT_DEFINITION.sectionKeys.map(section => ({
        ...section,
        content: `${section.title}的测试内容。甲乙事实分别表达，本命基线和阶段影响保持分层。`,
        evidenceIds: [validEvidenceId, 'invalid:evidence'],
      })),
      actionItems: ['明确职责范围', '约定重大事项决策流程', '定期复盘协作体验'],
      openQuestions: ['双方是否已确认退出机制？'],
    });
    const content = parseAndValidateHemingReportContent(raw, evidence);
    assert.equal(content.title, '合盘关系报告');
    assert.equal(content.sections.length, 6);
    assert.ok(content.sections.every(section => section.evidenceIds.length === 1));
    assert.ok(content.disclaimer.includes('婚姻'));

    const conversation = createConversation({
      type: 'heming', title: '合盘报告测试', birthInfoA, birthInfoB, chartSnapshotA: chartA, chartSnapshotB: chartB,
      relationshipType: 'business', relationshipContext,
    });
    const report = getOrCreateReport(conversation.id, 'relationship', HEMING_REPORT_DEFINITION.label);
    assert.equal(report.title, '合盘关系报告');
    assert.equal(getOrCreateReport(conversation.id, 'relationship', HEMING_REPORT_DEFINITION.label).id, report.id);

    const claimV1 = claimReportVersion({ reportId: report.id, engineVersion: 'ziwei-v1', promptVersion: 'heming-report-v1', provider: 'test', model: 'test-model', regenerate: false, staleAfterMs: 60_000 });
    assert.equal(claimV1.claimed, true);
    completeReportVersion({
      versionId: claimV1.version.id,
      content,
      evidenceBySection: content.sections.map(section => ({ sectionKey: section.key, evidence: [evidence.find(item => item.evidenceKey === validEvidenceId)!] })),
      inputTokens: 200,
      outputTokens: 500,
    });
    assert.equal(getReportDetail(report.id)?.version?.version, 1);
    assert.equal(getReportDetail(report.id)?.evidence.length, 6);

    const claimV2 = claimReportVersion({ reportId: report.id, engineVersion: 'ziwei-v1', promptVersion: 'heming-report-v1', provider: 'test', model: 'test-model', regenerate: true, staleAfterMs: 60_000 });
    failReportVersion(claimV2.version.id, '模拟合盘报告失败');
    assert.equal(getReportDetail(report.id)?.version?.version, 1, '失败版本不得覆盖有效报告');

    const claimV3 = claimReportVersion({ reportId: report.id, engineVersion: 'ziwei-v1', promptVersion: 'heming-report-v1', provider: 'test', model: 'test-model', regenerate: true, staleAfterMs: 60_000 });
    completeReportVersion({ versionId: claimV3.version.id, content: { ...content, summary: '第三版合盘报告。' }, evidenceBySection: [], inputTokens: null, outputTokens: null });
    assert.equal(getReportDetail(report.id)?.version?.version, 3);
    assert.equal(listReports(conversation.id)[0].versionCount, 3);

    assert.equal(deleteConversation(conversation.id), true);
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM reports WHERE conversation_id = ?').get(conversation.id) as { count: number }).count, 0);
    console.log('M4-4 合盘报告测试通过：双盘证据、提示词边界、结构校验、版本保留、失败回退与级联删除均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
