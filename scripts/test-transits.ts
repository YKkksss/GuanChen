import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-transit-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.AI_CONTEXT_LIMIT = '12000';
process.env.AI_INPUT_TOKEN_TARGET = '6000';

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, appendMessage, deleteConversation } = await import('../lib/db/conversations');
  const { getOrCreateAnnualTransit } = await import('../lib/transits/service');
  const { buildAnnualTransitSnapshot } = await import('../lib/transits/engine');
  const { ANNUAL_REPORT_PROMPT_VERSION, buildAnnualReportMessages } = await import('../lib/transits/annual-report');
  const {
    claimAnnualTransitReport,
    completeAnnualTransitReport,
    getAnnualTransitReport,
  } = await import('../lib/db/transit-reports');
  const { buildConversationContext } = await import('../lib/context/builder');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const birthInfo = {
      year: 2000,
      month: 4,
      day: 15,
      hour: 4,
      gender: 'male' as const,
      name: '年度测试',
    };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({
      type: 'chart',
      title: '年度分析测试',
      birthInfo,
      chartSnapshot: chart,
    });

    const directA = buildAnnualTransitSnapshot(chart, 2026);
    const directB = buildAnnualTransitSnapshot(chart, 2026);
    assert.deepEqual(directA, directB, '同一命盘同一年必须得到完全相同的快照');
    assert.equal(directA.year.ganZhi, '丙午');
    assert.equal(directA.transformations.length, 4);
    assert.deepEqual(
      directA.transformations.map(item => `${item.starName}化${item.type}`),
      ['天同化禄', '天机化权', '文昌化科', '廉贞化忌'],
    );
    assert.equal(new Set(directA.relatedPalaceBranches).size, 4, '三方四正应包含四个不同宫位');
    assert.equal(directA.palaceMappings.length, 12, '流年十二宫必须完整映射');
    assert.ok(directA.keyPalaces.some(item => item.branch === directA.flowYear.palaceBranch));

    const direct2027 = buildAnnualTransitSnapshot(chart, 2027);
    assert.equal(direct2027.year.ganZhi, '丁未');
    assert.notEqual(direct2027.flowYear.palaceBranch, directA.flowYear.palaceBranch);

    const cachedA = getOrCreateAnnualTransit(conversation.id, 2026);
    const cachedB = getOrCreateAnnualTransit(conversation.id, 2026);
    assert.equal(cachedA.id, cachedB.id, '重复查询必须命中同一缓存记录');
    assert.deepEqual(cachedA.snapshot, directA);

    const userMessage = appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '这一年的事业发展应该重点看什么？',
      metadata: { transit: { level: 'year', targetDate: '2026' } },
    });
    const context = buildConversationContext({
      conversationId: conversation.id,
      currentMessageId: userMessage.id,
      provider: 'test',
      model: 'test-model',
    });
    const contextText = context.messages.map(message => message.content).join('\n');
    assert.match(contextText, /2026 年确定性运势事实/);
    assert.match(contextText, /天同化禄/);
    const transitLayer = (context.manifest.layers as Record<string, { included?: boolean }>).transit;
    assert.equal(transitLayer.included, true);

    const reportMessages = buildAnnualReportMessages(chart, directA);
    const reportPrompt = reportMessages.map(message => message.content).join('\n');
    ['年度总览', '命格在本年的表现', '感情与关系', '事业与学习', '财运与资源', '健康与生活节奏', '性格与人际表现', '年度行动建议']
      .forEach(title => assert.match(reportPrompt, new RegExp(title)));
    assert.match(reportPrompt, /天同/);
    assert.doesNotMatch(reportPrompt, /年度测试/, '年度报告上下文不应包含姓名');

    const reportIdentity = {
      conversationId: conversation.id,
      snapshotId: cachedA.id,
      targetDate: '2026',
      engineVersion: cachedA.engineVersion,
      promptVersion: ANNUAL_REPORT_PROMPT_VERSION,
      provider: 'test-provider',
      model: 'test-model',
      staleAfterMs: 120_000,
    };
    const firstClaim = claimAnnualTransitReport({ ...reportIdentity, regenerate: false });
    assert.equal(firstClaim.claimed, true);
    const concurrentClaim = claimAnnualTransitReport({ ...reportIdentity, regenerate: false });
    assert.equal(concurrentClaim.claimed, false, '生成中的同年报告不能被重复认领');
    assert.equal(concurrentClaim.report.id, firstClaim.report.id);
    const firstCompleted = completeAnnualTransitReport(firstClaim.report.id, {
      content: '**【年度总览】**\n第一版年度报告',
      inputTokens: 800,
      outputTokens: 1200,
    });
    assert.equal(firstCompleted?.status, 'completed');
    const cachedReportClaim = claimAnnualTransitReport({ ...reportIdentity, regenerate: false });
    assert.equal(cachedReportClaim.claimed, false, '已有报告时应直接读取缓存');
    assert.match(cachedReportClaim.report.content, /第一版年度报告/);

    const regenerateClaim = claimAnnualTransitReport({ ...reportIdentity, regenerate: true });
    assert.equal(regenerateClaim.claimed, true, '手动重新生成应重新认领任务');
    assert.match(regenerateClaim.report.content, /第一版年度报告/, '生成新版本期间应保留旧内容');
    completeAnnualTransitReport(regenerateClaim.report.id, {
      content: '**【年度总览】**\n重新生成后的年度报告',
      inputTokens: 820,
      outputTokens: 1250,
    });
    const savedReport = getAnnualTransitReport({
      conversationId: conversation.id,
      targetDate: '2026',
      engineVersion: cachedA.engineVersion,
      promptVersion: ANNUAL_REPORT_PROMPT_VERSION,
    });
    assert.match(savedReport?.content ?? '', /重新生成后的年度报告/);

    const migrations = getDatabase().prepare('SELECT version FROM schema_migrations WHERE version IN (3, 4)').all() as Array<{ version: number }>;
    assert.deepEqual(migrations.map(item => item.version), [3, 4], '数据库第 3、4 版迁移必须存在');
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM transit_snapshots WHERE conversation_id = ?').get(conversation.id) as { count: number }).count,
      1,
    );
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM transit_reports WHERE conversation_id = ?').get(conversation.id) as { count: number }).count,
      1,
    );
    assert.equal(deleteConversation(conversation.id), true);
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM transit_snapshots WHERE conversation_id = ?').get(conversation.id) as { count: number }).count,
      0,
      '删除会话后年度快照应级联删除',
    );
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM transit_reports WHERE conversation_id = ?').get(conversation.id) as { count: number }).count,
      0,
      '删除会话后年度报告应级联删除',
    );

    console.log('年度运势测试通过：快照确定性、报告缓存、并发保护、重新生成、上下文注入和级联删除均正常。');
  } finally {
    getDatabaseSafeClose();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
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
