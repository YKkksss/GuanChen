import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveAnnualQuestion } from '../lib/context/transit-intent';
import type { ConversationMessage } from '../lib/conversations/types';

process.env.SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ziwei-natural-transit-')), 'test.sqlite');
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'local-test';
process.env.DEEPSEEK_BASE_URL = 'http://127.0.0.1:30003';
process.env.AI_CONTEXT_LIMIT = '32768';
process.env.AI_INPUT_TOKEN_TARGET = '12000';

const at = Date.parse('2026-12-31T16:00:00Z'); // 北京时间已进入 2027 年。
const message = (content: string, createdAt = at) => ({ content, createdAt } as ConversationMessage);
const years = (content: string, createdAt = at) => {
  const result = resolveAnnualQuestion(message(content, createdAt), 1992);
  assert.equal(result.kind, 'years', content);
  return result.kind === 'years' ? result.years : [];
};
assert.deepEqual(years('2028年呢？'), [2028]);
assert.deepEqual(years('2028年'), [2028]);
assert.deepEqual(years('明年'), [2028]);
assert.deepEqual(years('今年事业如何？'), [2027]);
assert.deepEqual(years('明年财运怎么样？', at - 1), [2027]);
assert.deepEqual(years('明年财运怎么样？'), [2028]);
assert.deepEqual(years('比较明年和后年的事业'), [2028, 2029]);
assert.deepEqual(years('比较2027和2028年的事业'), [2027, 2028]);
assert.deepEqual(years('2027年至2029年运势如何？'), [2027, 2028, 2029]);
assert.deepEqual(years('我在2020年辞职，明年事业如何？'), [2028]);
for (const text of ['我在2020年辞职。', '我的收入2028元，如何改善？', '请继续分析性格']) {
  assert.equal(resolveAnnualQuestion(message(text), 1992).kind, 'none', text);
}
for (const text of ['2028年3月运势如何？', '今年五月运势如何？', '今年哪个月适合跳槽？', '不是2027年，是2028年呢？', '二〇二八年运势如何？', '2028-03-01运势如何？', '未来十年运势如何？', '大后年呢？', '10年后如何？', '那年运势如何？', '2029到2027年如何？', '2027到2032年如何？', '1980年呢？', '2199年呢？']) {
  assert.equal(resolveAnnualQuestion(message(text), 1992).kind, 'clarify', text);
}

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, appendMessage } = await import('../lib/db/conversations');
  const { buildConversationContext, buildFallbackConversationContext } = await import('../lib/context/builder');
  const { closeDatabaseConnection } = await import('../lib/db/client');
  const chart = generateChart({ year: 1992, month: 5, day: 16, hour: 4, gender: 'male' });
  try {
    const conversation = createConversation({ type: 'chart', title: '自然语言运限合成测试', birthInfo: chart.birthInfo, chartSnapshot: chart });
    const ask = (content: string, extra = {}) => appendMessage({ conversationId: conversation.id, role: 'user', content, source: 'question', ...extra });
    const build = (id: string, fallback = false) => (fallback ? buildFallbackConversationContext : buildConversationContext)({ conversationId: conversation.id, currentMessageId: id, provider: 'deepseek', model: 'deepseek-chat' });
    const annual = ask('2028年呢？');
    const followup = ask('请继续详细说说');
    for (const id of [annual.id, followup.id]) for (const fallback of [false, true]) {
      const context = build(id, fallback);
      assert.deepEqual((context.manifest.layers as any).transit.targetDates, ['2028']);
      assert.match(context.messages[1].content, /本题年份范围.*2028/);
    }
    const comparison = ask('比较2027年与2028年的事业');
    const compared = build(comparison.id);
    assert.deepEqual((compared.manifest.layers as any).transit.targetDates, ['2027', '2028']);
    assert.ok(compared.estimatedInputTokens <= compared.inputBudget);
    const threeYears = ask('2027年至2029年运势如何？');
    for (const fallback of [false, true]) {
      const context = build(threeYears.id, fallback);
      assert.deepEqual((context.manifest.layers as any).transit.targetDates, ['2027', '2028', '2029']);
      assert.ok(context.estimatedInputTokens <= context.inputBudget);
    }
    const invalid = ask('1980年呢？');
    for (const fallback of [false, true]) {
      const context = build(invalid.id, fallback);
      assert.equal((context.manifest.layers as any).transit.included, false);
      assert.match(context.messages[1].content, /需要澄清日期/);
    }
    const explicit = ask('分析今年运势', { metadata: { transit: { level: 'year', targetDate: '2030' } } });
    assert.deepEqual((build(explicit.id).manifest.layers as any).transit.targetDates, ['2030']);
    const { POST } = await import('../app/api/conversations/[id]/respond/route');
    const originalFetch = globalThis.fetch;
    const captured: Array<{ messages: Array<{ content: string }> }> = [];
    globalThis.fetch = async (_url, init) => {
      captured.push(JSON.parse(String(init?.body)));
      return new Response('模拟故障，不访问真实 AI', { status: 503 });
    };
    try {
      const response = await POST(new Request('http://local/respond', { method: 'POST', body: JSON.stringify({ message: '2028年呢？' }) }), { params: Promise.resolve({ id: conversation.id }) });
      await response.text();
      assert.match(captured[0].messages[1].content, /本题年份范围.*2028/);
      assert.equal(captured[0].messages.at(-1)?.content, '2028年呢？');
    } finally { globalThis.fetch = originalFetch; }
    console.log('自然语言年度运限通过：北京时间跨年、相对年份、比较、追问、日期澄清、降级和实际请求注入。');
  } finally { closeDatabaseConnection(); }
}
void main();
