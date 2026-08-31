import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-event-candidates-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, appendMessage, deleteConversation } = await import('../lib/db/conversations');
  const { listLifeEvents } = await import('../lib/db/events');
  const { getLifeEventCandidate, listLifeEventCandidates } = await import('../lib/db/event-candidates');
  const { listActiveMemories, replaceConversationMemories } = await import('../lib/db/context');
  const {
    extractLifeEventCandidates,
    parseLifeEventCandidateExtraction,
    shouldAttemptLifeEventExtraction,
  } = await import('../lib/events/candidate-service');
  const { buildConversationContext } = await import('../lib/context/builder');
  const { getDatabase } = await import('../lib/db/client');
  const candidateRoute = await import('../app/api/conversations/[id]/event-candidates/route');
  const candidateItemRoute = await import('../app/api/conversations/[id]/event-candidates/[candidateId]/route');

  try {
    assert.equal(shouldAttemptLifeEventExtraction('我在2018年换了第一份工作'), true);
    assert.equal(shouldAttemptLifeEventExtraction('我想知道2030年会不会换工作？'), false);
    assert.equal(shouldAttemptLifeEventExtraction('今年事业怎么样？'), false);

    const parsed = parseLifeEventCandidateExtraction({
      sourceMessage: '我在2018年换了第一份工作，2020年又从北京搬到了上海。',
      birthYear: 1990,
      currentYear: 2026,
      content: JSON.stringify({ candidates: [
        {
          title: '更换第一份工作', category: 'career', customCategory: null,
          startDate: '2018', endDate: null, datePrecision: 'year', description: '更换工作', impactLevel: 4,
          confidence: 0.94, sourceExcerpt: '我在2018年换了第一份工作', reviewNotes: [],
        },
        {
          title: '从北京搬到上海', category: 'relocation', customCategory: null,
          startDate: '2020', endDate: null, datePrecision: 'year', description: '跨城市搬迁', impactLevel: 3,
          confidence: 0.9, sourceExcerpt: '2020年又从北京搬到了上海', reviewNotes: ['请核对月份'],
        },
        {
          title: '未来换工作', category: 'career', customCategory: null,
          startDate: '2030', endDate: null, datePrecision: 'year', description: null, impactLevel: 3,
          confidence: 0.99, sourceExcerpt: '第一份工作', reviewNotes: [],
        },
        {
          title: '低置信候选', category: 'career', customCategory: null,
          startDate: '2019', endDate: null, datePrecision: 'year', description: null, impactLevel: 3,
          confidence: 0.3, sourceExcerpt: '第一份工作', reviewNotes: [],
        },
      ] }),
    });
    assert.equal(parsed.length, 2, '未来事件和低置信候选必须过滤');
    assert.equal(parsed[0].sourceExcerpt, '我在2018年换了第一份工作');
    assert.deepEqual(parsed[1].reviewNotes, ['请核对月份']);

    const birthInfo = { year: 1990, month: 6, day: 15, hour: 4, gender: 'male' as const };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({ type: 'chart', title: '事件候选测试', birthInfo, chartSnapshot: chart });
    const source = appendMessage({
      conversationId: conversation.id,
      role: 'user',
      source: 'question',
      content: '我在2018年换了第一份工作，2020年又从北京搬到了上海。',
    });
    let completionCalls = 0;
    const extracted = await extractLifeEventCandidates({
      conversationId: conversation.id,
      sourceMessageId: source.id,
      completion: async () => {
        completionCalls += 1;
        return { content: JSON.stringify({ candidates: parsed.map(item => ({ ...item })) }) };
      },
    });
    assert.equal(extracted.status, 'completed');
    assert.equal(extracted.candidates.length, 2);
    assert.equal(completionCalls, 1);
    assert.equal(listLifeEvents({ conversationId: conversation.id }).length, 0, '确认前不得写入正式事件表');
    assert.equal(listActiveMemories(conversation.id).filter(item => item.category === 'confirmed_event').length, 0, '确认前不得写入已确认记忆');

    const reused = await extractLifeEventCandidates({
      conversationId: conversation.id,
      sourceMessageId: source.id,
      completion: async () => { throw new Error('幂等复用时不应再次请求模型'); },
    });
    assert.equal(reused.reused, true);
    assert.equal(reused.candidates.length, 2);

    const listedResponse = await candidateRoute.GET(
      new Request(`http://local/api/conversations/${conversation.id}/event-candidates?status=pending`),
      { params: Promise.resolve({ id: conversation.id }) },
    );
    const listed = await json<{ candidates: typeof extracted.candidates }>(listedResponse);
    assert.equal(listed.candidates.length, 2);

    const beforeQuestion = appendMessage({
      conversationId: conversation.id, role: 'user', source: 'question',
      content: '请结合2018年的实际工作经历分析。',
    });
    const beforeContext = buildConversationContext({
      conversationId: conversation.id, currentMessageId: beforeQuestion.id,
      provider: 'deepseek', model: 'test-model',
    });
    assert.ok(!beforeContext.messages.some(message => message.content.includes('【L3 用户已确认人生事件】')));

    const careerCandidate = extracted.candidates.find(item => item.category === 'career')!;
    const confirmResponse = await candidateItemRoute.PATCH(new Request('http://local/confirm', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm',
        event: {
          title: '第一次正式转职', category: 'career', customCategory: '',
          datePrecision: 'month', startDate: '2018-07', endDate: '',
          impactLevel: 5, description: '用户核对后补充了月份和影响程度',
        },
      }),
    }), { params: Promise.resolve({ id: conversation.id, candidateId: careerCandidate.id }) });
    assert.equal(confirmResponse.status, 200);
    const confirmed = await json<{ candidate: { status: string }; event: {
      id: string; title: string; source: string; sourceMessageId: string; confirmedByUser: boolean;
      startDate: string; transitLinks: Array<{ level: string; targetDate: string }>;
    } }>(confirmResponse);
    assert.equal(confirmed.candidate.status, 'confirmed');
    assert.equal(confirmed.event.title, '第一次正式转职');
    assert.equal(confirmed.event.source, 'conversation_extracted');
    assert.equal(confirmed.event.sourceMessageId, source.id);
    assert.equal(confirmed.event.confirmedByUser, true);
    assert.equal(confirmed.event.startDate, '2018-07');
    assert.equal(confirmed.event.transitLinks[0].targetDate, '2018');
    assert.deepEqual(confirmed.event.transitLinks.map(link => link.level), ['year', 'month']);
    assert.equal(listLifeEvents({ conversationId: conversation.id }).length, 1);
    assert.equal(listActiveMemories(conversation.id).filter(item => item.category === 'confirmed_event').length, 1);

    const secondConfirm = await candidateItemRoute.PATCH(new Request('http://local/confirm', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', event: {
        title: '不应重复创建', category: 'career', datePrecision: 'year', startDate: '2018', impactLevel: 3,
      } }),
    }), { params: Promise.resolve({ id: conversation.id, candidateId: careerCandidate.id }) });
    const idempotent = await json<{ event: { id: string } }>(secondConfirm);
    assert.equal(idempotent.event.id, confirmed.event.id);
    assert.equal(listLifeEvents({ conversationId: conversation.id }).length, 1, '重复确认不能重复创建正式事件');

    const relocationCandidate = extracted.candidates.find(item => item.category === 'relocation')!;
    const dismissResponse = await candidateItemRoute.PATCH(new Request('http://local/dismiss', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss' }),
    }), { params: Promise.resolve({ id: conversation.id, candidateId: relocationCandidate.id }) });
    assert.equal(dismissResponse.status, 200);
    assert.equal(getLifeEventCandidate(relocationCandidate.id)?.status, 'dismissed');
    assert.equal(listLifeEvents({ conversationId: conversation.id }).length, 1, '忽略候选不得创建正式事件');

    const afterQuestion = appendMessage({
      conversationId: conversation.id, role: 'user', source: 'question',
      content: '请结合2018年的工作事件分析当年的变化。',
    });
    const afterContext = buildConversationContext({
      conversationId: conversation.id, currentMessageId: afterQuestion.id,
      provider: 'deepseek', model: 'test-model',
    });
    const contextText = afterContext.messages.map(message => message.content).join('\n');
    assert.ok(contextText.includes('【L3 用户已确认人生事件】'));
    assert.ok(contextText.includes('第一次正式转职'));
    const eventLayer = (afterContext.manifest.layers as Record<string, { count?: number; ids?: string[] }>).confirmedEvents;
    assert.equal(eventLayer.count, 1);
    assert.deepEqual(eventLayer.ids, [confirmed.event.id]);

    replaceConversationMemories(conversation.id, [{
      category: 'user_preference', content: '希望回答简洁', normalizedKey: 'answer_style', confidence: 1,
    }]);
    assert.equal(listActiveMemories(conversation.id).filter(item => item.category === 'confirmed_event').length, 1, '重建普通记忆不得删除用户已确认事件记忆');

    const future = appendMessage({
      conversationId: conversation.id, role: 'user', source: 'question',
      content: '我想知道2030年会不会换工作？',
    });
    let skippedCompletionCalls = 0;
    const skipped = await extractLifeEventCandidates({
      conversationId: conversation.id,
      sourceMessageId: future.id,
      completion: async () => { skippedCompletionCalls += 1; return { content: '{"candidates":[]}' }; },
    });
    assert.equal(skipped.status, 'skipped');
    assert.equal(skippedCompletionCalls, 0, '明显的未来问题不应调用候选提取模型');

    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 41').get());
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM life_event_extraction_runs').get() as { count: number }).count, 2);
    assert.equal(listLifeEventCandidates({ conversationId: conversation.id }).length, 2);

    assert.equal(deleteConversation(conversation.id), true);
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM life_event_candidates').get() as { count: number }).count, 0);
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS count FROM life_event_extraction_runs').get() as { count: number }).count, 0);

    console.log('M2-1 人生事件候选测试通过：智能提取、独立候选层、确认前隔离、核对保存、忽略、幂等确认、正式上下文注入与 v41 级联均正常。');
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
