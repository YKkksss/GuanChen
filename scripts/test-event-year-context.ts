import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ziwei-event-year-')), 'test.sqlite');
process.env.AI_CONTEXT_LIMIT = '32768';
process.env.AI_INPUT_TOKEN_TARGET = '12000';

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, appendMessage } = await import('../lib/db/conversations');
  const { createLifeEventWithTransits, updateLifeEventWithTransits } = await import('../lib/events/service');
  const { deleteLifeEvent } = await import('../lib/db/events');
  const { buildConversationContext, buildFallbackConversationContext, selectRelevantLifeEvents } = await import('../lib/context/builder');
  const { closeDatabaseConnection } = await import('../lib/db/client');
  try {
    const chart = generateChart({ year: 1992, month: 5, day: 16, hour: 4, gender: 'male' });
    const conversation = createConversation({ type: 'chart', title: '年度事件关联合成测试', birthInfo: chart.birthInfo, chartSnapshot: chart });
    const yearEvent = createLifeEventWithTransits(conversation.id, { title: '年度工作记录', category: 'career', datePrecision: 'year', startDate: '2028', impactLevel: 3, confirmedByUser: true });
    const range = createLifeEventWithTransits(conversation.id, { title: '跨年搬迁记录', category: 'relocation', datePrecision: 'range', startDate: '2027-12-01', endDate: '2029-01-15', impactLevel: 3, confirmedByUser: true });
    const unknown = createLifeEventWithTransits(conversation.id, { title: '日期不明的记录', category: 'career', datePrecision: 'unknown', startDate: '', impactLevel: 2, confirmedByUser: true });
    for (let i = 0; i < 10; i++) createLifeEventWithTransits(conversation.id, { title: `其他年份事件${i}`, category: 'career', datePrecision: 'year', startDate: '2030', impactLevel: 2, confirmedByUser: true });
    const ask = (content: string, extra = {}) => appendMessage({ conversationId: conversation.id, role: 'user', source: 'question', content, ...extra });
    const build = (id: string, fallback = false) => (fallback ? buildFallbackConversationContext : buildConversationContext)({ conversationId: conversation.id, currentMessageId: id, provider: 'deepseek', model: 'deepseek-chat' });
    const ids = (id: string, fallback = false) => (build(id, fallback).manifest.layers as { confirmedEvents: { ids: string[] } }).confirmedEvents.ids;
    const annual = ask('2028年运势如何？');
    const followup = ask('继续详细说说');
    for (const id of [annual.id, followup.id]) for (const fallback of [false, true]) {
      assert.deepEqual(new Set(ids(id, fallback)), new Set([yearEvent.id, range.id]));
      const text = build(id, fallback).messages.map(message => message.content).join('\n');
      assert.match(text, /2027-12-01至2029-01-15/);
      assert.doesNotMatch(text, /其他年份事件/);
      assert.match(text, /不得倒因为果/);
    }
    const explicit = ask('今年事业如何？', { metadata: { transit: { level: 'year', targetDate: '2028' } } });
    assert.deepEqual(new Set(ids(explicit.id)), new Set([yearEvent.id, range.id]));
    assert.equal(selectRelevantLifeEvents([{ ...yearEvent, confirmedByUser: false }, unknown], '2028年', [], ['2028']).length, 0);
    // 同一事件的年、月、日挂接不能重复提高年度相关性。
    assert.equal(selectRelevantLifeEvents([yearEvent], '工作', [], ['2028'])[0].datePrecision, 'year');
    const duplicated = { ...yearEvent, id: '重复挂接', transitLinks: [...yearEvent.transitLinks, ...yearEvent.transitLinks], updatedAt: 1 };
    const newer = { ...yearEvent, id: '最新记录', updatedAt: 2 };
    assert.equal(selectRelevantLifeEvents([duplicated, newer], '2028年', [], ['2028'])[0].id, '最新记录');
    updateLifeEventWithTransits(conversation.id, yearEvent.id, { title: yearEvent.title, category: 'career', datePrecision: 'year', startDate: '2026', impactLevel: 3, confirmedByUser: true });
    assert.deepEqual(ids(annual.id), [range.id]);
    assert.equal(deleteLifeEvent(range.id), true);
    assert.deepEqual(ids(annual.id), []);
    console.log('年度事件关联通过：指定年份、追问、跨年范围、确认状态、未知日期、编辑与删除即时生效。');
  } finally { closeDatabaseConnection(); }
}
void main();
