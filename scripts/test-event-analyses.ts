import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-event-analysis-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

function buildContent(eventId: string, suffix = '') {
  return JSON.stringify({
    summary: `这是一份基于用户确认事件与程序运限快照的谨慎回溯摘要${suffix}。时间结构只提供观察角度，不代表运限必然导致现实事件。`,
    sections: [
      {
        key: 'confirmed_facts',
        title: '已确认的现实事实',
        content: `用户确认在 2018 年 7 月 18 日发生了重要工作变动${suffix}，除此之外不补充未知细节。`,
        evidenceIds: [`event:${eventId}`, '不存在的证据'],
      },
      {
        key: 'timing_structure',
        title: '当时的运限结构',
        content: '程序快照显示该事件日期同时具有流年、流月与流日结构，可据此分层观察。',
        evidenceIds: ['transit:year:2018', 'transit:month:2018-07-13', 'transit:day:2018-07-18'],
      },
      {
        key: 'cautious_interpretation',
        title: '谨慎回溯解释',
        content: '这些结构可能对应当时对工作方向和现实节奏的关注，但只能作为回顾视角。',
        evidenceIds: [`event:${eventId}`, 'transit:year:2018'],
      },
      {
        key: 'open_verification',
        title: '仍待验证与继续观察',
        content: '仍需结合当时的行业环境、个人选择与实际资源，核对其他现实解释。',
        evidenceIds: [`event:${eventId}`],
      },
    ],
    actionItems: ['补充记录当时的选择依据', '区分外部环境和个人行动的影响'],
    openQuestions: ['当时还有哪些现实条件发生变化？'],
  });
}

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, deleteConversation } = await import('../lib/db/conversations');
  const { deleteLifeEvent } = await import('../lib/db/events');
  const { createLifeEventWithTransits, updateLifeEventWithTransits } = await import('../lib/events/service');
  const {
    buildEventAnalysisEvidence,
    buildEventAnalysisMessages,
    findEventAnalysisDetail,
    generateEventAnalysis,
    listEventAnalysisSummaries,
    parseEventAnalysisContent,
  } = await import('../lib/events/analysis-service');
  const { getDatabase } = await import('../lib/db/client');
  const eventsRoute = await import('../app/api/conversations/[id]/events/route');
  const analysisRoute = await import('../app/api/conversations/[id]/events/[eventId]/analysis/route');

  try {
    const birthInfo = { year: 1990, month: 6, day: 15, hour: 4, gender: 'male' as const };
    const conversation = createConversation({
      type: 'chart',
      title: '事件回溯测试',
      birthInfo,
      chartSnapshot: generateChart(birthInfo),
    });
    const event = createLifeEventWithTransits(conversation.id, {
      title: '第一次重要工作变动',
      category: 'career',
      startDate: '2018-07-18',
      datePrecision: 'day',
      description: '用户确认的工作经历',
      impactLevel: 5,
      confirmedByUser: true,
    });

    const evidence = buildEventAnalysisEvidence(event);
    assert.deepEqual(evidence.map(item => item.kind), [
      'confirmed_event', 'annual_transit', 'monthly_transit', 'daily_transit',
    ]);
    const messages = buildEventAnalysisMessages(event, evidence);
    assert.ok(messages[0].content.includes('不证明命理造成了现实事件'));
    assert.ok(messages[1].content.includes(`event:${event.id}`));

    let completionCalls = 0;
    const first = await generateEventAnalysis({
      conversationId: conversation.id,
      eventId: event.id,
      completion: async () => {
        completionCalls += 1;
        return {
          content: buildContent(event.id),
          usage: { inputTokens: 800, outputTokens: 600, cachedInputTokens: null },
        };
      },
    });
    assert.equal(completionCalls, 1);
    assert.equal(first.version?.version, 1);
    assert.equal(first.version?.generationReason, 'initial_generation');
    assert.equal(first.version?.status, 'completed');
    assert.equal(first.version?.content?.sections.length, 4);
    assert.equal(first.version?.content?.sections[0].evidenceIds.includes('不存在的证据'), false);
    assert.equal(first.isStale, false);
    assert.ok(first.evidence.some(item => item.kind === 'daily_transit'));

    const cached = await generateEventAnalysis({
      conversationId: conversation.id,
      eventId: event.id,
      completion: async () => { throw new Error('缓存命中时不应再次调用模型'); },
    });
    assert.equal(cached.version?.version, 1);
    assert.equal(completionCalls, 1);

    const regenerated = await generateEventAnalysis({
      conversationId: conversation.id,
      eventId: event.id,
      regenerate: true,
      completion: async () => ({
        content: buildContent(event.id, '（第二版）'),
        usage: { inputTokens: 820, outputTokens: 620, cachedInputTokens: 100 },
      }),
    });
    assert.equal(regenerated.version?.version, 2);
    assert.equal(regenerated.version?.generationReason, 'manual_regenerate');
    assert.equal(regenerated.versions.length, 2);

    const updatedEvent = updateLifeEventWithTransits(conversation.id, event.id, {
      title: '第一次重要工作变动（补充月份）',
      category: 'career',
      startDate: '2018-08',
      datePrecision: 'month',
      description: '用户再次核对后修正月份',
      impactLevel: 5,
      confirmedByUser: true,
    })!;
    assert.equal(findEventAnalysisDetail({
      conversationId: conversation.id,
      eventId: event.id,
    })?.isStale, true);

    const refreshed = await generateEventAnalysis({
      conversationId: conversation.id,
      eventId: event.id,
      completion: async () => ({
        content: buildContent(event.id, '（事实更新版）')
          .replaceAll('2018-07-13', updatedEvent.transitLinks.find(link => link.level === 'month')!.targetDate),
        usage: { inputTokens: 780, outputTokens: 580, cachedInputTokens: null },
      }),
    });
    assert.equal(refreshed.version?.version, 3);
    assert.equal(refreshed.version?.generationReason, 'source_changed');
    assert.equal(refreshed.isStale, false);
    assert.equal(findEventAnalysisDetail({
      conversationId: conversation.id,
      eventId: event.id,
      version: 1,
    })?.version?.version, 1);

    const summaries = listEventAnalysisSummaries(conversation.id);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].version, 3);
    assert.equal(summaries[0].versionCount, 3);
    assert.equal(summaries[0].isStale, false);

    const eventListResponse = await eventsRoute.GET(
      new Request(`http://local/api/conversations/${conversation.id}/events`),
      { params: Promise.resolve({ id: conversation.id }) },
    );
    const eventList = await eventListResponse.json() as {
      events: unknown[];
      analyses: Array<{ eventId: string; version: number }>;
    };
    assert.equal(eventList.events.length, 1);
    assert.equal(eventList.analyses[0].eventId, event.id);
    assert.equal(eventList.analyses[0].version, 3);

    const analysisGetResponse = await analysisRoute.GET(
      new Request(`http://local/api/conversations/${conversation.id}/events/${event.id}/analysis?version=2`),
      { params: Promise.resolve({ id: conversation.id, eventId: event.id }) },
    );
    assert.equal(analysisGetResponse.status, 200);
    const historical = await analysisGetResponse.json() as { detail: { version: { version: number } } };
    assert.equal(historical.detail.version.version, 2);

    const invalidVersionResponse = await analysisRoute.GET(
      new Request(`http://local/api/conversations/${conversation.id}/events/${event.id}/analysis?version=99`),
      { params: Promise.resolve({ id: conversation.id, eventId: event.id }) },
    );
    assert.equal(invalidVersionResponse.status, 404);

    assert.throws(() => parseEventAnalysisContent(
      buildContent(event.id).replace('可能对应', '必然导致'),
      updatedEvent,
      buildEventAnalysisEvidence(updatedEvent),
    ), /确定性因果/);

    const otherConversation = createConversation({
      type: 'chart', title: '越权测试', birthInfo, chartSnapshot: generateChart(birthInfo),
    });
    assert.throws(() => findEventAnalysisDetail({
      conversationId: otherConversation.id,
      eventId: event.id,
    }), /不存在/);
    assert.equal(deleteConversation(otherConversation.id), true);

    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 46').get());
    assert.equal(deleteLifeEvent(event.id), true);
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM event_ai_analyses').get() as { count: number }).count,
      0,
      '删除事件后回溯分析主记录必须级联删除',
    );
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM event_ai_analysis_versions').get() as { count: number }).count,
      0,
      '删除事件后回溯分析版本必须级联删除',
    );
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM event_ai_analysis_evidence').get() as { count: number }).count,
      0,
      '删除事件后回溯证据必须级联删除',
    );
    assert.equal(deleteConversation(conversation.id), true);

    console.log('M2-3 事件回溯分析测试通过：证据分层、缓存复用、版本重生成、事实变更、API、因果边界与级联删除均正常。');
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
