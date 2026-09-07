import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ziwei-followup-')), 'test.sqlite');
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'local-test';
process.env.DEEPSEEK_BASE_URL = 'http://127.0.0.1:30003';
process.env.AI_CONTEXT_LIMIT = '32768';
process.env.AI_INPUT_TOKEN_TARGET = '12000';

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, appendMessage } = await import('../lib/db/conversations');
  const { buildConversationContext, buildFallbackConversationContext } = await import('../lib/context/builder');
  const { resolveConversationFocus } = await import('../lib/context/topic-router');
  const { closeDatabaseConnection } = await import('../lib/db/client');
  const chart = generateChart({ year: 1992, month: 5, day: 16, hour: 4, gender: 'male' });
  try {
    const conversation = createConversation({ type: 'chart', title: '追问合成测试', birthInfo: chart.birthInfo, chartSnapshot: chart });
    const question = (content: string, extra = {}) => appendMessage({ conversationId: conversation.id, role: 'user', source: 'question', content, ...extra });
    const build = (id: string, fallback = false) => (fallback ? buildFallbackConversationContext : buildConversationContext)({ conversationId: conversation.id, currentMessageId: id, provider: 'deepseek', model: 'deepseek-chat' });
    const palace = chart.palaces.find(item => item.name.replace('宫', '') === '夫妻')!;
    const anchor = question('请解读这个宫位', { source: 'palace', palaceBranch: palace.branch });
    appendMessage({ conversationId: conversation.id, role: 'assistant', source: 'answer', content: '这是测试回复，讨论的是夫妻宫。' });
    const follow = question('详细说说');
    for (const fallback of [false, true]) {
      const context = build(follow.id, fallback);
      assert.equal(context.manifest.topic, 'palace');
      assert.equal(context.manifest.inheritedFromMessageId, anchor.id);
      assert.match(context.messages[1].content, /夫妻宫/);
      assert.equal(context.messages.at(-1)?.content, '详细说说');
      assert.ok(context.estimatedInputTokens <= context.inputBudget);
    }
    const chained = question('那我该怎么做？');
    assert.equal(build(chained.id).manifest.inheritedFromMessageId, anchor.id);
    const career = question('换个话题，我的工作方向怎么样？');
    assert.equal(build(career.id).manifest.topic, 'career');
    assert.equal(build(career.id).manifest.inheritedFromMessageId, null);
    const annual = question('分析这一年的运势', { source: 'topic', topic: 'fortune', metadata: { transit: { level: 'year', targetDate: '2027' } } });
    const next = question('请具体展开');
    for (const fallback of [false, true]) {
      const context = build(next.id, fallback);
      assert.equal(context.manifest.inheritedFromMessageId, annual.id);
      assert.equal((context.manifest.layers as { transit: { targetDate: string } }).transit.targetDate, '2027');
    }
    const changedDate = question('2028年呢？');
    assert.equal(build(changedDate.id).manifest.inheritedFromMessageId, null);
    const explicit = question('继续详细说说', { topic: 'wealth' });
    assert.equal(build(explicit.id).manifest.topic, 'wealth');
    assert.equal(resolveConversationFocus(follow, [{ ...anchor, conversationId: '其他档案' }]).inheritedFromMessageId, null);
    assert.throws(() => buildFallbackConversationContext({ conversationId: '不存在', currentMessageId: follow.id, provider: 'deepseek', model: 'deepseek-chat' }));
    // 从实际聊天接口捕获上游请求；模拟失败，避免触发异步记忆提取。
    const { POST } = await import('../app/api/conversations/[id]/respond/route');
    const originalFetch = globalThis.fetch;
    const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response('本地测试故障', { status: 503 });
    };
    try {
      question('请解读夫妻宫', { source: 'palace', palaceBranch: palace.branch });
      const response = await POST(new Request('http://local/respond', { method: 'POST', body: JSON.stringify({ message: '再详细说说', source: 'question' }) }), { params: Promise.resolve({ id: conversation.id }) });
      await response.text();
      assert.ok(requests.length > 0);
      assert.match(requests[0].messages[1].content, /夫妻宫/);
      assert.match(requests[0].messages[1].content, /追问范围/);
      assert.equal(requests[0].messages.at(-1)?.content, '再详细说说');
    } finally { globalThis.fetch = originalFetch; }
    console.log('紫微连续追问测试通过：宫位、连续追问、换题、指定年份、降级事实、预算与跨档案隔离。');
  } finally { closeDatabaseConnection(); }
}
void main();
