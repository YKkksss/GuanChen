import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { changeBirthDate, isCompleteBirthTime } from '../lib/birth-form';

async function main() {
  assert.deepEqual(changeBirthDate('2024-01-31', 1, '02'), { value: '2024-02-', clearedDay: true });
  assert.deepEqual(changeBirthDate('2024-02-29', 0, '2023'), { value: '2023-02-', clearedDay: true });
  assert.deepEqual(changeBirthDate('2024-02-29', 0, '2000'), { value: '2000-02-29', clearedDay: false });
  assert.deepEqual(changeBirthDate('2024-02-29', 0, '1900'), { value: '1900-02-', clearedDay: true });
  assert.deepEqual(changeBirthDate('2024-01-31', 1, ''), { value: '2024--', clearedDay: true });
  for (const value of ['', ':', '12:', ':30', '24:00', '12:60']) assert.equal(isCompleteBirthTime(value), false);
  for (const value of ['00:00', '23:59', '12:30']) assert.equal(isCompleteBirthTime(value), true);

  process.env.SQLITE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'ziwei-v1-intake-test-')), 'test.sqlite');
  const { createConversation, countConversations, listConversations, updateConversation } = await import('../lib/db/conversations');
  const { getDatabase, closeDatabaseConnection } = await import('../lib/db/client');
  const { GET } = await import('../app/api/conversations/route');
  try {
    for (let i = 0; i < 45; i++) createConversation({ type: 'chart', title: `合成命档 ${i}`, birthInfo: { year: 1992, month: 5, day: 16, hour: 4, gender: 'male', name: i === 44 ? '特别姓名' : '合成资料' } });
    const special = createConversation({ type: 'heming', title: 'Literal_100% ABC' });
    updateConversation(special.id, { status: 'archived' });
    // 固定同一时间，核验分页仍然具备稳定排序，不重复或漏掉记录。
    getDatabase().prepare('UPDATE conversations SET updated_at = 12345').run();
    const pages = [0, 20, 40].flatMap(offset => listConversations({ type: 'chart', limit: 20, offset }));
    assert.equal(new Set(pages.map(item => item.id)).size, 45);
    assert.equal(countConversations({ type: 'chart' }), 45);
    assert.equal(countConversations({ query: '特别姓名' }), 1);
    assert.equal(countConversations({ query: '%' }), 1);
    assert.equal(countConversations({ query: 'abc', status: 'active' }), 0);
    assert.equal(countConversations({ query: 'abc', status: 'archived' }), 1);
    const response = await GET(new Request('http://localhost/api/conversations?type=chart&limit=20&offset=40'));
    const data = await response.json();
    assert.equal(data.total, 45);
    assert.equal(data.conversations.length, 5);
    assert.equal(data.hasMore, false);
    const invalid = await (await GET(new Request('http://localhost/api/conversations?limit=Infinity&offset=-1.5'))).json();
    assert.equal(invalid.limit, 50);
    assert.equal(invalid.offset, 0);
    assert.equal(listConversations({ limit: 1.5 }).length, 1);
    console.log('通过：闰日/月份变更、空时间验证、完整分页、姓名搜索、字面搜索、状态筛选与参数边界。');
  } finally {
    closeDatabaseConnection();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
