import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-rectification-report-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { getDatabase } = await import('../lib/db/client');
  const { createRectificationSession } = await import('../lib/rectification/service');
  const { attachRectificationEvent, findRectificationEventMatrix, reviseRectificationEventEvidence } = await import('../lib/rectification/event-service');
  const { evaluateRectificationSession } = await import('../lib/rectification/evaluation-service');
  const { selectRectificationCandidate } = await import('../lib/rectification/selection-service');
  const { buildRectificationReportFacts, buildRectificationReportInputFingerprint } = await import('../lib/rectification/report-facts');
  const {
    buildRectificationReportMessages,
    createConversationFromRectificationSelection,
    parseRectificationReportContent,
  } = await import('../lib/rectification/report-service');
  const {
    claimRectificationReportVersion,
    completeRectificationReportVersion,
    failRectificationReportVersion,
    getOrCreateRectificationReport,
    getRectificationReportDetail,
    listRectificationReports,
  } = await import('../lib/db/rectification-reports');
  const { RECTIFICATION_REPORT_SECTIONS } = await import('../lib/rectification/report-types');
  const { compareReportVersions } = await import('../lib/report-comparisons/service');

  try {
    const session = createRectificationSession({
      title: 'M5-5 校时结论测试',
      baseBirthInfo: { name: '测试用户', year: 1990, month: 6, day: 15, gender: 'male', longitude: 116.4074 },
      candidateSlotKeys: ['early_zi', 'si', 'late_zi'],
      reportedTimeEvidence: { source: 'family_written_record', precision: 'range', reportedStartLocal: '10:00', reportedEndLocal: '13:00', timezoneId: 'Asia/Shanghai', longitude: 116.4074 },
    });
    const event = attachRectificationEvent(session.id, { evidenceQuality: 'documented', event: { title: '开始第一份工作', category: 'career', startDate: '2014', datePrecision: 'year', impactLevel: 5 } });
    attachRectificationEvent(session.id, { evidenceQuality: 'corroborated_memory', event: { title: '搬到外地生活', category: 'relocation', startDate: '2018', datePrecision: 'year', impactLevel: 4 } });
    attachRectificationEvent(session.id, { evidenceQuality: 'corroborated_memory', event: { title: '确定长期关系', category: 'relationship', startDate: '2020-05', datePrecision: 'month', impactLevel: 5 } });
    const evaluation = evaluateRectificationSession(session.id);
    const selectedEvaluation = evaluation.candidates.find(item => !session.candidates.find(candidate => candidate.id === item.candidateId)?.duplicateOfCandidateId)!;
    const selection = selectRectificationCandidate(session.id, { candidateId: selectedEvaluation.candidateId, evaluationId: evaluation.id, acknowledgedLimitations: true, note: '作为当前工作假设。' });
    const built = buildRectificationReportFacts({ session: { ...session, selectedCandidateId: selection.candidateId }, evaluation, matrix: findRectificationEventMatrix(session.id), selection });
    assert.equal(built.factPack.evaluationVersion, evaluation.version);
    assert.equal(built.factPack.selectedCandidateId, selection.candidateId);
    assert.equal(built.factPack.candidates.length, new Set(built.factPack.candidates.map(item => item.chartFingerprint)).size);
    assert.ok(built.evidence.some(item => item.kind === 'selection'));
    assert.ok(built.evidence.some(item => item.kind === 'confirmed_event'));

    const prompt = buildRectificationReportMessages(built.evidence, built.factPack).map(message => message.content).join('\n');
    assert.match(prompt, /绝对禁止/);
    assert.match(prompt, /不得修改程序得出的排名|改变候选排名/);
    assert.match(prompt, new RegExp(selection.candidateId));

    const citedId = built.evidence.find(item => item.kind === 'candidate_summary')!.evidenceKey;
    const raw = JSON.stringify({
      title: '模型标题', summary: '这是严格基于规则结果和人工选定记录的校时结论摘要。',
      sections: RECTIFICATION_REPORT_SECTIONS.map(section => ({ ...section, content: `${section.title}测试内容，只解释已提供的确定性事实。`, evidenceIds: [citedId, 'not-allowed'] })),
      actionItems: ['继续核实有准确年月的重大事件', '补充事件类别，使类别数达到推荐类别数 3'], openQuestions: ['是否还能找到原始出生记录？'],
    });
    const content = parseRectificationReportContent(raw, built.evidence, built.factPack);
    assert.equal(content.sections.length, 5);
    assert.deepEqual(content.sections[0].evidenceIds, [citedId]);
    assert.match(content.summary, /系统事实快照/);
    assert.match(content.summary, /事件类别/);
    assert.equal(content.actionItems.length, 1, '已经满足类别推荐要求时，应过滤模型生成的矛盾建议');
    assert.match(content.disclaimer, /相对比较/);

    const report = getOrCreateRectificationReport(session.id, '出生时辰校时结论报告');
    const fingerprint = buildRectificationReportInputFingerprint({ evaluationId: evaluation.id, evaluationInputFingerprint: evaluation.inputFingerprint, selectionId: selection.id });
    const claimV1 = claimRectificationReportVersion({ reportId: report.id, sessionId: session.id, evaluationId: evaluation.id, selectionId: selection.id, inputFingerprint: fingerprint, methodologyVersion: evaluation.methodologyVersion, evaluationEngineVersion: evaluation.evaluationEngineVersion, promptVersion: 'rectification-conclusion-v1', provider: 'test', model: 'test-model', regenerate: false, staleAfterMs: 60_000 });
    assert.equal(claimV1.claimed, true);
    assert.equal(claimRectificationReportVersion({ reportId: report.id, sessionId: session.id, evaluationId: evaluation.id, selectionId: selection.id, inputFingerprint: fingerprint, methodologyVersion: evaluation.methodologyVersion, evaluationEngineVersion: evaluation.evaluationEngineVersion, promptVersion: 'rectification-conclusion-v1', provider: 'test', model: 'test-model', regenerate: false, staleAfterMs: 60_000 }).claimed, false);
    completeRectificationReportVersion({ versionId: claimV1.version.id, content, evidenceBySection: content.sections.map(section => ({ sectionKey: section.key, evidence: [built.evidence.find(item => item.evidenceKey === citedId)!] })), inputTokens: 100, outputTokens: 200 });
    assert.equal(getRectificationReportDetail(report.id)?.evidence.length, 5);
    assert.equal(listRectificationReports(session.id)[0].versionCount, 1);
    const claimV2 = claimRectificationReportVersion({ reportId: report.id, sessionId: session.id, evaluationId: evaluation.id, selectionId: selection.id, inputFingerprint: fingerprint, methodologyVersion: evaluation.methodologyVersion, evaluationEngineVersion: evaluation.evaluationEngineVersion, promptVersion: 'rectification-conclusion-v1', provider: 'test', model: 'test-model', regenerate: true, staleAfterMs: 60_000 });
    failRectificationReportVersion(claimV2.version.id, '模拟失败');
    assert.equal(getRectificationReportDetail(report.id)?.version?.version, 1, '失败版本不得覆盖有效报告');
    const claimV3 = claimRectificationReportVersion({ reportId: report.id, sessionId: session.id, evaluationId: evaluation.id, selectionId: selection.id, inputFingerprint: fingerprint, methodologyVersion: evaluation.methodologyVersion, evaluationEngineVersion: evaluation.evaluationEngineVersion, promptVersion: 'rectification-conclusion-v1', provider: 'test', model: 'test-model', regenerate: true, staleAfterMs: 60_000 });
    completeRectificationReportVersion({ versionId: claimV3.version.id, content, evidenceBySection: content.sections.map(section => ({ sectionKey: section.key, evidence: [built.evidence.find(item => item.evidenceKey === citedId)!] })), inputTokens: 100, outputTokens: 200 });
    const rectificationComparison = compareReportVersions({ sourceKind: 'rectification', reportId: report.id, baseVersion: 1, targetVersion: 3 });
    assert.equal(rectificationComparison.summary.classification, 'generation_metadata_only');
    assert.equal(rectificationComparison.target.baseVersionId, claimV1.version.id);

    const firstConversation = createConversationFromRectificationSelection(session.id);
    const secondConversation = createConversationFromRectificationSelection(session.id);
    assert.equal(firstConversation.reused, false);
    assert.equal(secondConversation.reused, true);
    assert.equal(secondConversation.conversationId, firstConversation.conversationId);
    const linked = getDatabase().prepare('SELECT COUNT(*) AS count FROM rectification_conversation_links WHERE session_id = ?').get(session.id) as { count: number };
    assert.equal(linked.count, 1, '同一选定记录只能创建一个工作命盘');

    reviseRectificationEventEvidence({ sessionId: session.id, eventId: event.id, evidenceQuality: 'documented', userConfirmed: false });
    assert.throws(() => createConversationFromRectificationSelection(session.id), /请先完成/);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 13').get());
    console.log('M5-5 校时结论测试通过：事实包、提示词边界、结构校验、报告版本、失败回退、工作命盘幂等创建与证据失效保护均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
