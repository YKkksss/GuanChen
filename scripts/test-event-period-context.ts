import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { matchEventContextPeriod } from '../lib/events/context-period';
import type { LifeEvent } from '../lib/events/types';

process.env.SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ziwei-event-period-')), 'test.sqlite');
process.env.AI_CONTEXT_LIMIT = '32768';
process.env.AI_INPUT_TOKEN_TARGET = '12000';

const period = [{ level: 'month' as const, startDate: '2028-02-10', endDate: '2028-03-09' }];
const fixture = (datePrecision: LifeEvent['datePrecision'], startDate: string, endDate: string | null = null) => ({ datePrecision, startDate, endDate, confirmedByUser: true } as LifeEvent);
assert.equal(matchEventContextPeriod(fixture('day', '2028-02-10'), period), 'exact');
assert.equal(matchEventContextPeriod(fixture('day', '2028-03-09'), period), 'exact');
assert.equal(matchEventContextPeriod(fixture('day', '2028-03-10'), period), null);
assert.equal(matchEventContextPeriod(fixture('month', '2028-02'), period), 'possible');
assert.equal(matchEventContextPeriod(fixture('year', '2028'), period), null);
assert.equal(matchEventContextPeriod(fixture('unknown', ''), period), null);
assert.equal(matchEventContextPeriod(fixture('range', '2027-12-01', '2028-05-01'), period), 'exact');
const leapDay = [{ level: 'day' as const, startDate: '2028-02-29', endDate: '2028-02-29' }];
assert.equal(matchEventContextPeriod(fixture('month', '2028-02'), leapDay), null);
assert.equal(matchEventContextPeriod(fixture('day', '2028-02-29'), leapDay), 'exact');
assert.equal(matchEventContextPeriod(fixture('range', '2028-02-28', '2028-03-01'), leapDay), 'exact');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation, appendMessage } = await import('../lib/db/conversations');
  const { createLifeEventWithTransits } = await import('../lib/events/service');
  const { getOrCreateMonthlyTransit } = await import('../lib/transits/service');
  const { buildConversationContext, buildFallbackConversationContext } = await import('../lib/context/builder');
  const { closeDatabaseConnection } = await import('../lib/db/client');
  try {
    const chart = generateChart({ year: 1992, month: 5, day: 16, hour: 4, gender: 'male' });
    const conversation = createConversation({ type: 'chart', title: '月日事件合成测试', birthInfo: chart.birthInfo, chartSnapshot: chart });
    const create = (title: string, datePrecision: LifeEvent['datePrecision'], startDate: string, endDate?: string) => createLifeEventWithTransits(conversation.id, { title, category: 'career', datePrecision, startDate, endDate, impactLevel: 3, confirmedByUser: true });
    const exact = create('当天正式记录', 'day', '2028-05-16');
    const span = create('长期工作区间', 'range', '2027-12-01', '2029-01-15');
    const coarse = create('仅知月份', 'month', '2028-05');
    const yearOnly = create('仅知年份', 'year', '2028');
    const other = create('其他月份', 'day', '2028-10-01');
    const ask = (level: 'month' | 'day') => appendMessage({ conversationId: conversation.id, role: 'user', source: 'topic', content: '分析这个时段', metadata: { transit: { level, targetDate: '2028-05-16' } } });
    const month = ask('month');
    const follow = appendMessage({ conversationId: conversation.id, role: 'user', source: 'question', content: '继续详细说说' });
    const expected = getOrCreateMonthlyTransit(conversation.id, '2028-05-16').snapshot.lunarMonth;
    for (const message of [month, follow, ask('day')]) for (const fallback of [false, true]) {
      const context = (fallback ? buildFallbackConversationContext : buildConversationContext)({ conversationId: conversation.id, currentMessageId: message.id, provider: 'deepseek', model: 'deepseek-chat' });
      const layer = (context.manifest.layers as { confirmedEvents: { ids: string[]; periods: Array<{ startDate: string; endDate: string }> } }).confirmedEvents;
      assert.ok(layer.ids.includes(exact.id));
      assert.ok(layer.ids.includes(span.id), '不能只看跨年事件的起止挂接，必须匹配中间时段');
      assert.ok(!layer.ids.includes(yearOnly.id));
      assert.ok(!layer.ids.includes(other.id));
      if (message.id === month.id || message.id === follow.id) {
        assert.ok(layer.ids.includes(coarse.id));
        assert.equal(layer.periods[0].startDate, expected.startDate);
        assert.equal(layer.periods[0].endDate, expected.endDate);
        assert.match(context.messages.map(item => item.content).join('\n'), /不能确定实际发生在本流月内/);
      } else assert.ok(!layer.ids.includes(coarse.id));
      assert.ok(context.estimatedInputTokens <= context.inputBudget);
    }
    console.log('月日事件匹配通过：真实农历月边界、端点、闰日、跨期事件、粗日期隔离、追问与降级。');
  } finally { closeDatabaseConnection(); }
}
void main();
