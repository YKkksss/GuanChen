import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { createConversation } from '../lib/db/conversations';
import { generateChart } from '../lib/ziwei/algorithm';
import { getCalendarMonth, getCalendarDay, generateCalendarReading } from '../lib/fortune-calendar/service';
import { buildCalendarMessages, validateCalendarContent } from '../lib/fortune-calendar/interpretation';
import { beijingToday, parseCalendarMonth, shiftCalendarMonth, shiftCalendarDay, validateCalendarDate } from '../lib/fortune-calendar/dates';
import { CALENDAR_TOPICS } from '../lib/fortune-calendar/types';
import { CALENDAR_STALE_MS, claimCalendarReading, finishCalendarReading, getCalendarReading } from '../lib/db/fortune-calendar';
import { createChartPackage, importChartPackage } from '../lib/chart-transfer/service';
import { CHART_IMPORT_CONFIRMATION } from '../lib/chart-transfer/types';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { GET } from '../app/api/conversations/[id]/calendar/route';
import { POST } from '../app/api/conversations/[id]/calendar/readings/route';

const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-calendar-test-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek'; process.env.DEEPSEEK_API_KEY = 'synthetic-calendar-key'; process.env.DEEPSEEK_MODEL = 'synthetic-calendar-model';
let calls = 0, mode = 'normal', checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }
const server = createServer(async (request, response) => {
  calls++;
  let raw = ''; for await (const chunk of request) raw += chunk;
  const requestData = JSON.parse(raw), facts = JSON.parse(requestData.messages[1].content);
  if (mode === 'error') { response.writeHead(503); response.end('上游错误含 synthetic-calendar-key'); return; }
  if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 80));
  const sections = ['overview', 'focus', 'attention', 'action'].map((key, index) => ({ key,
    content: `${facts.date}的${facts.topic}主题第${index + 1}节合成解读，结合提供的阶段事实记录观察重点，正文内容各不相同。`,
    evidenceIds: [index === 0 ? 'stage:day' : index === 1 ? 'stage:year' : index === 2 ? 'stage:month' : 'stage:decadal'] }));
  if (mode === 'bad-evidence') sections[0].evidenceIds = ['invented-fact'];
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: `${facts.date}的${facts.topic}合成摘要，用于验证保存与主题隔离。`, sections }) } }], usage: { prompt_tokens: 60, completion_tokens: 80 } }));
});
function request(id: string, token: string | undefined, method = 'GET', query = '', body?: unknown) {
  return new Request(`http://local/api/conversations/${id}/calendar${method === 'POST' ? '/readings' : ''}${query}`, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function main() {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('测试服务地址错误');
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  const a = await registerUser({ username: 'calendar-a', password: 'synthetic-calendar-password-a', displayName: '日历测试甲' });
  const b = await registerUser({ username: 'calendar-b', password: 'synthetic-calendar-password-b', displayName: '日历测试乙' });
  const tokenA = createSession(a.id), tokenB = createSession(b.id);
  const birth = { year: 1992, month: 7, day: 9, hour: 4, gender: 'female' as const };
  const conversation = runAsUser(a, () => createConversation({ type: 'chart', title: '合成日历命盘', birthInfo: birth, chartSnapshot: generateChart(birth) }));
  try {
    check(beijingToday(new Date('2026-01-01T15:59:59Z')) === '2026-01-01', '北京时间午夜前');
    check(beijingToday(new Date('2026-01-01T16:00:00Z')) === '2026-01-02', '北京时间跨日');
    check(parseCalendarMonth('2024-02').days === 29 && parseCalendarMonth('2100-02').days === 28, '公历闰年和世纪年');
    check(shiftCalendarMonth('2026-12', 1) === '2027-01', '月份跨年');
    check(shiftCalendarDay('2024-02-28', 1) === '2024-02-29', '闰日导航');
    for (const date of ['2026-02-30', '2026-00-10', '1899-12-31', '2026-1-1', '2026-02-00']) { assert.throws(() => validateCalendarDate(date)); checks++; }
    await runAsUser(a, async () => {
      check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v === 56, '当前 v56 初始化');
      const feb = getCalendarMonth(conversation.id, '2024-02', 'overview');
      check(feb.days.length === 29 && feb.days.at(-1)?.date === '2024-02-29', '完整月历');
      check(feb.days[0].weekday === 4 && feb.days.every(day => day.available), '周起始与日期可用性');
      const birthMonth = getCalendarMonth(conversation.id, '1992-07', 'overview');
      check(birthMonth.days.slice(0, 8).every(day => !day.available) && birthMonth.days[8].available, '出生日前禁用');
      assert.throws(() => getCalendarMonth(conversation.id, '1992-06', 'overview')); checks++;
      assert.throws(() => getCalendarDay(conversation.id, '1992-07-08', 'overview')); checks++;
      assert.throws(() => getCalendarMonth(conversation.id, '2123-01', 'overview')); checks++;
      const beforeMonth = getCalendarDay(conversation.id, '2026-03-18', 'overview');
      const afterMonth = getCalendarDay(conversation.id, '2026-03-19', 'overview');
      check(beforeMonth.facts.snapshot.lunarDay.dayLabel === '三十' && afterMonth.facts.snapshot.lunarDay.dayLabel === '初一', '农历月界');
      check(beforeMonth.facts.snapshot.flowMonth.ganZhi !== afterMonth.facts.snapshot.flowMonth.ganZhi, '月界切换流月');
      const beforeYear = getCalendarDay(conversation.id, '2026-02-16', 'overview').facts.snapshot;
      const afterYear = getCalendarDay(conversation.id, '2026-02-17', 'overview').facts.snapshot;
      check(afterYear.nominalAge === beforeYear.nominalAge + 1 && afterYear.year.ganZhi !== beforeYear.year.ganZhi, '春节切换流年和农历虚岁');
      const leap = getCalendarMonth(conversation.id, '2025-07', 'overview');
      check(leap.days.some(day => day.lunarLabel === '闰六月'), '月历保留闰月');
      const messages = buildCalendarMessages(afterMonth.facts, 'study');
      check(messages[0].content.includes('学习') && messages[1].content.includes('stage:day'), '主题与权威事实注入');
      const reading = await generateCalendarReading(conversation.id, '2026-03-19', 'overview');
      check(reading.status === 'completed' && reading.content?.sections.length === 4, '生成后保存完整章节');
      const firstCalls = calls;
      check((await generateCalendarReading(conversation.id, '2026-03-19', 'overview')).id === reading.id && calls === firstCalls, '重复生成返回保存内容');
      delete process.env.DEEPSEEK_API_KEY;
      check((await generateCalendarReading(conversation.id, '2026-03-19', 'overview')).status === 'completed', '回看不依赖密钥');
      process.env.DEEPSEEK_API_KEY = 'synthetic-calendar-key';
      await generateCalendarReading(conversation.id, '2026-03-19', 'career');
      check(getCalendarMonth(conversation.id, '2026-03', 'overview').days[18].reading?.status === 'completed', '保存标记按日期显示');
      check(!getCalendarMonth(conversation.id, '2026-03', 'wealth').days[18].reading, '主题保存标记不串用');
      mode = 'delay';
      const callCount = calls;
      const pending = generateCalendarReading(conversation.id, '2026-03-20', 'overview');
      const duplicate = await generateCalendarReading(conversation.id, '2026-03-20', 'overview');
      check(duplicate.status === 'generating', '并发返回已有任务');
      await pending;
      check(calls === callCount + 1, '并发只调用一次 AI');
      mode = 'error';
      await assert.rejects(generateCalendarReading(conversation.id, '2026-03-21', 'wealth'), error => error instanceof Error && !error.message.includes('synthetic-calendar-key')); checks++;
      check(getCalendarReading(conversation.id, '2026-03-21', 'wealth')?.status === 'failed', '上游失败持久化');
      mode = 'normal';
      check((await generateCalendarReading(conversation.id, '2026-03-21', 'wealth')).status === 'completed', '失败重试成功');
      mode = 'bad-evidence';
      await assert.rejects(generateCalendarReading(conversation.id, '2026-03-22', 'relationship')); checks++;
      check(getCalendarReading(conversation.id, '2026-03-22', 'relationship')?.content === null, '无效引用不发布');
      mode = 'normal';
      const valid = reading.content!;
      for (const invalid of [{ ...valid, sections: valid.sections.slice(1) }, { ...valid, sections: [valid.sections[0], valid.sections[0], ...valid.sections.slice(2)] }, { ...valid, summary: '百分百会成功，请放心行动' }, { ...valid, sections: valid.sections.map(item => ({ ...item, content: '同一段重复内容会造成解读质量问题。' })) }]) {
        assert.throws(() => validateCalendarContent(JSON.stringify(invalid), reading.facts)); checks++;
      }
      const staleFacts = getCalendarDay(conversation.id, '2026-03-23', 'study').facts;
      const stale = claimCalendarReading({ conversationId: conversation.id, date: '2026-03-23', topic: 'study', facts: staleFacts, provider: 'test', model: 'test', promptVersion: 'test' });
      getDatabase().prepare('UPDATE fortune_calendar_readings SET updated_at = ? WHERE id = ?').run(Date.now() - CALENDAR_STALE_MS - 1, stale.reading.id);
      check(getCalendarReading(conversation.id, '2026-03-23', 'study')?.status === 'failed', '过期任务恢复');
      const retry = claimCalendarReading({ conversationId: conversation.id, date: '2026-03-23', topic: 'study', facts: staleFacts, provider: 'test', model: 'test', promptVersion: 'test' });
      check(!finishCalendarReading(stale.reading.id, stale.requestId!, valid, 1, 1), '迟到响应不能覆盖重试');
      check(finishCalendarReading(retry.reading.id, retry.requestId!, valid, 1, 1), '最新任务可以完成');
      closeDatabaseConnection();
      check(getCalendarReading(conversation.id, '2026-03-19', 'overview')?.content?.summary === reading.content?.summary, '关闭重开仍可回看');
      const exported = createChartPackage(conversation.id);
      const imported = importChartPackage({ buffer: exported.buffer, confirmation: CHART_IMPORT_CONFIRMATION });
      check(getCalendarReading(imported.conversationId, '2026-03-19', 'overview')?.content?.summary === reading.content?.summary, '单盘迁移保留解读');
      check(getCalendarReading(imported.conversationId, '2026-03-19', 'overview')?.id !== reading.id, '单盘迁移重映射主键');
      const backup = await createLocalBackupArchive();
      getDatabase().prepare('DELETE FROM fortune_calendar_readings').run();
      await restoreLocalBackupArchive({ archive: backup.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      check(getCalendarReading(conversation.id, '2026-03-19', 'overview')?.content?.summary === reading.content?.summary, '整库恢复保留解读');
      getDatabase().prepare('DELETE FROM conversations WHERE id = ?').run(imported.conversationId);
      check(!getCalendarReading(imported.conversationId, '2026-03-19', 'overview'), '删盘级联删除解读');
      check((getDatabase().pragma('foreign_key_check') as unknown[]).length === 0, '外键完整性');
    });
    const context = { params: Promise.resolve({ id: conversation.id }) };
    for (const [token, expected] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await GET(request(conversation.id, token, 'GET', '?month=2026-03'), context);
      check(response.status === expected, '日历读取账号边界'); await response.json();
    }
    for (const [token, expected] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await POST(request(conversation.id, token, 'POST', '', { date: '2026-03-19', topic: 'overview', userId: b.id }), context);
      check(response.status === expected, '解读写入账号边界'); await response.json();
    }
    for (const query of ['?date=2026-02-30', '?date=', '?month=2026-13', '?topic=__proto__', '?month=1991-01']) {
      const response = await GET(request(conversation.id, tokenA, 'GET', query), context); check(response.status === 400, '非法日历输入拒绝'); await response.json();
    }
    const invalid = await POST(request(conversation.id, tokenA, 'POST', '', []), context); check(invalid.status === 400, '数组请求体拒绝'); await invalid.json();
    await runAsUser(b, async () => { check(!getCalendarReading(conversation.id, '2026-03-19', 'overview'), '乙不能读取甲解读'); closeDatabaseConnection(); });
    await runAsUser(a, async () => {
      const unknownBirth = { ...birth, unknownTime: true };
      const unknown = createConversation({ type: 'chart', title: '时辰未知合成命盘', birthInfo: unknownBirth, chartSnapshot: generateChart(unknownBirth) });
      check(getCalendarDay(unknown.id, '2026-03-19', 'overview').facts.unknownTime, '未知时辰状态保留');
      // 合成 v47 状态再重新打开，验证新增迁移保留既有命盘。
      getDatabase().exec('DROP TABLE qimen_turns; DROP TABLE qimen_sessions; DROP TABLE liuyao_turns; DROP TABLE liuyao_sessions; DROP TABLE meihua_turns; DROP TABLE meihua_sessions; DROP TABLE election_plans; DROP TABLE synthesis_report_versions; DROP TABLE synthesis_sessions; DROP TABLE bazi_reading_versions; DROP TABLE fortune_topic_versions; DROP TABLE fortune_topic_reports; DROP TABLE fortune_calendar_readings; DELETE FROM schema_migrations WHERE version >= 48;');
      closeDatabaseConnection();
      check((getDatabase().prepare('SELECT COUNT(*) AS n FROM conversations WHERE id = ?').get(conversation.id) as { n: number }).n === 1, 'v47升级保留既有档案');
      check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v === 56, 'v47升级完成v55（含日历迁移）');
      closeDatabaseConnection();
    });
    console.log(`运势日历专项通过：${checks}项；北京时间、历法边界、五主题、保存重开、并发恢复、账号隔离、迁移与备份。`);
  } finally {
    runAsUser(a, closeDatabaseConnection); runAsUser(b, closeDatabaseConnection); closeAccountConnections();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('测试目录不在临时目录内');
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
