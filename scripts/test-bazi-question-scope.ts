import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveBaziQuestionScope } from '../lib/bazi/question-scope';

process.env.SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'guanchen-bazi-scope-')), 'test.sqlite');
const base = { previousQuestions: ['解释 2030-03-05 的关系'], currentYear: 2029, timeZone: 'Asia/Shanghai', lateZiPolicy: 'same_day' as const };
assert.equal(resolveBaziQuestionScope({ ...base, question: '再详细解释一下' }).scope, '2030-03-05');
assert.equal(resolveBaziQuestionScope({ ...base, question: '改看 2031 年' }).scope, '2031年');
assert.equal(resolveBaziQuestionScope({ ...base, question: '解释我的原局' }).scope, null);
assert.equal(resolveBaziQuestionScope({ ...base, question: '当前流年呢' }).scope, '2029年');
assert.throws(() => resolveBaziQuestionScope({ ...base, question: '2030-02-30 呢' }), /日期无效/);
assert.equal(resolveBaziQuestionScope({ ...base, question: '今天', lateZiPolicy: 'next_day', asOf: new Date('2030-03-05T15:00:00Z') }).scope, '2030-03-06');

async function main() {
  const profiles = await import('../app/api/bazi/profiles/route');
  const { createBaziConversation, appendBaziMessage } = await import('../lib/db/bazi-conversations');
  const { buildBaziConversationContext } = await import('../lib/context/bazi-builder');
  const { getDatabase } = await import('../lib/db/client');
  try {
    const response = await profiles.POST(new Request('http://local/api/bazi/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      displayName: '合成追问测试', birthDate: '2005-12-23', birthTime: '08:37', gender: 'male', timeZoneId: 'Asia/Shanghai',
      initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'same_day' },
    }) }));
    assert.equal(response.status, 201);
    const data = await response.json();
    const conversation = createBaziConversation({ chartVersionId: data.profile.charts[0].id });
    const build = (content: string) => {
      const current = appendBaziMessage({ conversationId: conversation.id, role: 'user', content });
      return buildBaziConversationContext({ conversationId: conversation.id, currentMessageId: current.id, provider: 'deepseek', model: 'deepseek-chat' });
    };
    const first = build('请解释 2030-01-02 的流日');
    assert.equal(first.manifest.questionScope, '2030-01-02');
    assert.equal(first.manifest.monthDayTimelineTargetYear, 2029, '公历一月应使用立春前流年');
    appendBaziMessage({ conversationId: conversation.id, role: 'assistant', content: '其他日期 2040-06-07 不应覆盖用户范围。' });
    const followup = build('再解释一下这个时间的关系');
    assert.equal(followup.manifest.questionScope, '2030-01-02');
    assert.equal(followup.manifest.scopeInherited, true);
    assert.equal(followup.manifest.monthDayRelationVersionId, first.manifest.monthDayRelationVersionId);
    assert.equal(followup.messages.at(-1)?.content, '再解释一下这个时间的关系', '保留用户原文');
    const changed = build('改看 2031 年的流年');
    assert.equal(changed.manifest.questionScope, '2031年');
    assert.equal(changed.manifest.monthDayTimelineTargetYear, 2031);
    assert.equal(changed.manifest.monthDayRelationVersionId, null);
    assert.equal(build('再看看原局').manifest.questionScope, null);
    console.log('八字范围测试通过：日期草稿语义、跨立春、追问延续、显式切年、原局切换和助手日期隔离。');
  } finally { getDatabase().close(); globalThis.__ziweiSqlite = undefined; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
