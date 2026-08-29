import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-bazi-conversation-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function json<T>(response: Response) {
  return await response.json() as T;
}

async function main() {
  const profilesRoute = await import('../app/api/bazi/profiles/route');
  const conversationsRoute = await import('../app/api/bazi/conversations/route');
  const conversationRoute = await import('../app/api/bazi/conversations/[id]/route');
  const {
    appendBaziMessage,
    completeBaziContextRun,
    createBaziContextRun,
    getBaziConversation,
    listBaziContextRuns,
    listBaziMessages,
    updateBaziConversationSummary,
  } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext, buildBaziFactsSnapshot, findBaziOutputViolations } = await import('../lib/context/bazi-builder');
  const { shouldMaintainBaziSummary } = await import('../lib/context/bazi-maintenance');
  const { deleteBaziChartVersion } = await import('../lib/db/bazi');
  const { getDatabase } = await import('../lib/db/client');

  try {
    const profileResponse = await profilesRoute.POST(new Request('http://local/api/bazi/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'M9-2 对话测试', birthDate: '2005-12-23', birthTime: '08:37',
        gender: 'male', timeZoneId: 'Asia/Shanghai', longitude: 116.4074,
        initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
      }),
    }));
    const profile = (await json<{ profile: { charts: Array<{ id: string; result: unknown }> } }>(profileResponse)).profile;
    const chartId = profile.charts[0].id;

    const create = () => conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId }),
    }));
    const first = (await json<{ conversation: { id: string; promptVersion: string } }>(await create())).conversation;
    const reused = (await json<{ conversation: { id: string } }>(await create())).conversation;
    assert.equal(reused.id, first.id, '同一版本默认应恢复最近的活动会话');
    assert.equal(first.promptVersion, 'bazi-chat-relation-evidence-v5');

    const forcedResponse = await conversationsRoute.POST(new Request('http://local/api/bazi/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartVersionId: chartId, forceNew: true }),
    }));
    const forced = (await json<{ conversation: { id: string } }>(forcedResponse)).conversation;
    assert.notEqual(forced.id, first.id, '显式新建应产生独立会话');

    for (let index = 0; index < 14; index += 1) {
      appendBaziMessage({ conversationId: first.id, role: 'user', content: `第 ${index + 1} 轮：请解释基础事实。` });
      appendBaziMessage({ conversationId: first.id, role: 'assistant', content: `第 ${index + 1} 轮：只解释四柱、藏干和十神。` });
    }
    updateBaziConversationSummary({
      conversationId: first.id,
      throughSeq: 8,
      summary: {
        topicsDiscussed: ['四柱基础'], explainedFacts: ['日主为辛金'], userQuestions: ['藏干含义'],
        corrections: [], openQuestions: ['继续解释十神'], boundariesReiterated: ['不判断旺衰'],
        doNotAssume: ['五行计数不是用神'],
      },
    });
    const current = appendBaziMessage({ conversationId: first.id, role: 'user', content: '请继续解释时柱的藏干。' });
    const assistant = appendBaziMessage({ conversationId: first.id, role: 'assistant', status: 'streaming' });
    const built = buildBaziConversationContext({
      conversationId: first.id, currentMessageId: current.id,
      provider: 'deepseek', model: 'deepseek-chat',
    });
    assert.equal(built.manifest.kind, 'bazi_foundation');
    assert.equal(built.manifest.isolation, 'dedicated_bazi_tables_and_prompt');
    assert.ok(built.recentMessageIds.length <= 20);
    assert.ok(built.messages.some(message => message.content.includes('权威八字基础盘快照')));
    assert.ok(built.messages.some(message => message.content.includes('滚动摘要')));
    assert.ok(built.messages.some(message => message.content.includes('日主：辛（金）')));
    assert.ok(!built.messages.some(message => /紫微星|夫妻宫|四化/.test(message.content) && !message.content.includes('不得混入')));
    assert.ok(built.estimatedInputTokens <= built.inputBudget);

    const detail = getBaziConversation(first.id)!;
    const facts = buildBaziFactsSnapshot(detail.chart.result);
    assert.match(facts, /乙酉/);
    assert.match(facts, /五行结构计数不等于旺衰/);
    assert.deepEqual(findBaziOutputViolations('你的命局身强，用神是火。'), ['越权判断身强身弱', '越权指定用神喜忌']);
    assert.deepEqual(findBaziOutputViolations('日柱天干为辛，藏干包括丙、庚、戊。'), []);
    assert.equal(shouldMaintainBaziSummary({ messageCount: 24, tokenCount: 100 }), true);
    assert.equal(shouldMaintainBaziSummary({ messageCount: 8, tokenCount: 6_100 }), true);

    const run = createBaziContextRun({
      conversationId: first.id, triggerMessageId: current.id, assistantMessageId: assistant.id,
      provider: 'test', model: 'test-model', contextLimit: built.contextLimit,
      outputReserve: built.outputReserve, inputBudget: built.inputBudget,
      estimatedInputTokens: built.estimatedInputTokens, summaryVersion: built.summaryVersion,
      recentMessageStartSeq: built.recentMessageStartSeq, recentMessageCount: built.recentMessageIds.length,
      contextManifest: built.manifest,
    });
    completeBaziContextRun(run.id, { status: 'completed', actualInputTokens: 900, actualOutputTokens: 120 });
    assert.equal(listBaziContextRuns(first.id)[0].actualOutputTokens, 120);

    const detailResponse = await conversationRoute.GET(new Request('http://local/detail'), { params: Promise.resolve({ id: first.id }) });
    const payload = await json<{ conversation: { id: string }; messages: unknown[] }>(detailResponse);
    assert.equal(payload.conversation.id, first.id);
    assert.equal(payload.messages.length, 30);

    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 24').get());
    assert.equal(deleteBaziChartVersion(chartId), true);
    assert.equal(getBaziConversation(first.id), null, '删除命盘版本应级联删除会话');
    assert.equal(listBaziMessages(first.id).length, 0, '删除命盘版本应级联删除消息');
    assert.equal(listBaziContextRuns(first.id).length, 0, '删除命盘版本应级联删除上下文运行记录');

    console.log('M9-2 八字对话测试通过：v24 迁移、版本绑定、会话恢复、独立消息、事实上下文、长对话摘要触发、输出边界与级联删除均正常。');
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
