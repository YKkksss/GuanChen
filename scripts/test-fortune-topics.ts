import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { createConversation } from '../lib/db/conversations';
import { generateChart } from '../lib/ziwei/algorithm';
import { buildAnnualTransitSnapshot, buildAnnualTransitSnapshotAtDate, buildDailyTransitSnapshot, buildMonthlyTransitSnapshot } from '../lib/transits/engine';
import { getFortuneOptions, getFortunePreview, generateFortuneReport, readFortuneReport } from '../lib/fortune-topics/service';
import { parsePeriodKey, resolvePeriod } from '../lib/fortune-topics/periods';
import { buildFortuneMessages, validateFortuneContent } from '../lib/fortune-topics/interpretation';
import { FORTUNE_TOPICS, sectionKeys, type FortuneContent, type FortuneFacts } from '../lib/fortune-topics/types';
import { FORTUNE_STALE_MS, claimFortuneVersion, finishFortuneVersion, findFortuneReport } from '../lib/db/fortune-topics';
import { createChartPackage, importChartPackage } from '../lib/chart-transfer/service';
import { CHART_IMPORT_CONFIRMATION } from '../lib/chart-transfer/types';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { GET, POST } from '../app/api/conversations/[id]/fortune-topics/route';
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-fortune-test-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts'); process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite'); process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek'; process.env.DEEPSEEK_API_KEY = 'synthetic-fortune-key'; process.env.DEEPSEEK_MODEL = 'synthetic-fortune-model';
let checks = 0, calls = 0, mode = 'normal';
function check(v: unknown, text: string) { assert.ok(v, text); checks++; }
function throws(fn: () => unknown) { assert.throws(fn); checks++; }
function contentFor(facts: FortuneFacts): FortuneContent {
  return { summary: `${facts.a.period.label}的${facts.topic}合成专题摘要，用于测试阶段分析、对比与完整保存。`, sections: sectionKeys(Boolean(facts.b)).map((key, i) => ({ key, content: `第${i + 1}节 ${key} 合成解读，按提供的阶段范围核对宫位、四化和本命背景，记录条件与现实反馈。`, evidenceIds: key === 'background' ? [facts.evidence.find(e => e.id.startsWith('natal:'))!.id, 'a:decadal'] : key === 'comparison' ? ['a:flow', 'b:flow'] : key.startsWith('b_') ? ['b:flow'] : ['a:flow'] })) };
}
const server = createServer(async (request, response) => {
  calls++; let raw = ''; for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw), facts = JSON.parse(body.messages.at(-1).content) as FortuneFacts;
  if (mode === 'error') { response.writeHead(503); response.end('不可泄漏的 synthetic-fortune-key 上游错误'); return; }
  if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 90));
  const content = contentFor(facts);
  if (mode === 'invalid') content.sections[1].evidenceIds = ['b:flow'];
  response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 50, completion_tokens: 80 } }));
});
function request(id: string, token: string | undefined, query = '', body?: unknown) { return new Request(`http://local/api/conversations/${id}/fortune-topics${query}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function main() {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('模拟服务地址错误');
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  const a = await registerUser({ username: 'fortune-a', password: randomUUID(), displayName: '专题验收甲' }), b = await registerUser({ username: 'fortune-b', password: randomUUID(), displayName: '专题验收乙' });
  const ta = createSession(a.id), tb = createSession(b.id);
  const birth = { year: 1992, month: 7, day: 9, hour: 4, gender: 'female' as const }, chart = generateChart(birth);
  const conversation = runAsUser(a, () => createConversation({ type: 'chart', title: '合成专题命盘', birthInfo: birth, chartSnapshot: chart }));
  try {
    for (const key of ['year:2026', 'month:2025-06-leap', 'month:2026-09']) check(parsePeriodKey(key).year >= 1900, '标准阶段标识');
    for (const key of ['', 'year:2026-09', 'month:2026', 'month:2026-00', 'month:2026-13', 'month:2026-9', 'year:1899', 'year:2201', '__proto__']) throws(() => parsePeriodKey(key));
    await runAsUser(a, async () => {
      check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v === 56, '当前 v56 初始化');
      const opts = getFortuneOptions(conversation.id, 2025);
      check(opts.periods.length === 14 && opts.periods.filter(p => p.level === 'month').length === 13, '2025保留13个农历月');
      check(opts.periods.some(p => p.key === 'month:2025-06-leap'), '闰六月有独立选择');
      check(getFortuneOptions(conversation.id, 2026).periods.length === 13, '非闰年12个月');
      throws(() => getFortuneOptions(conversation.id, 1991)); throws(() => getFortuneOptions(conversation.id, 2123));
      throws(() => getFortunePreview(conversation.id, 'career', 'year:2026', 'month:2026-09'));
      throws(() => getFortunePreview(conversation.id, 'career', 'year:2026', 'year:2026'));
      throws(() => resolvePeriod('month:2026-06-leap', '1992-07-09', '2122-12-31'));
      const annual = getFortunePreview(conversation.id, 'career', 'year:2026').facts;
      check(annual.a.period.startDate === '2026-02-17' && annual.a.period.endDate === '2027-02-05', '农历年度春节范围');
      check(annual.a.snapshot.level === 'year' && annual.a.snapshot.year.ganZhi === '丙午', '农历流年真实映射');
      const boundary = getFortunePreview(conversation.id, 'career', 'year:1992').facts;
      check(boundary.a.period.startDate === '1992-07-09' && boundary.a.snapshot.representativeDate === '1992-07-09', '出生截取与代表日');
      check(boundary.a.snapshot.decadal.periodKind === 'childhood' && boundary.a.snapshot.decadal.startAge === null, '童限不误关联晚年大限');
      check(annual.a.snapshot.topicPalaces.career >= 0 && annual.a.snapshot.topicPalaces.wealth >= 0, '主题宫位命名兼容');
      check(annual.evidence.some(e => e.id === 'a:topic:官禄宫'), '专题宫位三方四正依据');
      const earlyBirth = { ...birth, month: 1, day: 2 }, earlyChart = generateChart(earlyBirth), early = createConversation({ type: 'chart', title: '春节前出生合成盘', birthInfo: earlyBirth, chartSnapshot: earlyChart });
      const earlyFacts = getFortunePreview(early.id, 'career', 'year:1991').facts;
      check(earlyFacts.a.period.startDate === '1992-01-02' && earlyFacts.a.snapshot.year.ganZhi === '辛未', '春节前出生允许上一农历年');
      const before = buildAnnualTransitSnapshotAtDate(chart, '2026-02-16'), after = buildAnnualTransitSnapshotAtDate(chart, '2026-02-17');
      check(before.year.ganZhi !== after.year.ganZhi && after.nominalAge === before.nominalAge + 1, '观察日年度春节换岁');
      check(buildAnnualTransitSnapshot(chart, 2026).representativeDate === '2026-07-01' && buildAnnualTransitSnapshot(chart, 2026).boundaryPolicy === 'annual-midyear-representative-date', '旧年度接口保持年中口径');
      throws(() => buildAnnualTransitSnapshotAtDate(chart, '2026-02-30'));
      const monthly = getFortunePreview(conversation.id, 'wealth', 'month:2025-06', 'month:2025-06-leap').facts;
      check(monthly.a.snapshot.level === 'month' && !monthly.a.snapshot.lunarMonth.isLeap && monthly.b?.snapshot.level === 'month' && monthly.b.snapshot.lunarMonth.isLeap, '正常月与闰月独立比较');
      check(monthly.changes.length >= 4 && monthly.evidence.some(e => e.id.startsWith('b:')), '双阶段事实与程序变化');
      const monthBirth = getFortunePreview(conversation.id, 'career', 'month:1992-06').facts;
      check(monthBirth.a.period.startDate === '1992-07-09' && monthBirth.a.period.fullStartDate < monthBirth.a.period.startDate, '出生月仅分析可用范围');
      const upper = getFortunePreview(conversation.id, 'study', 'year:2122').facts;
      check(upper.a.period.endDate === '2122-12-31', '运限上界截取');
      check(upper.a.snapshot.decadal.periodKind === 'unavailable' && !upper.evidence.some(e => e.details.includes('undefined')), '上界缺少大限明确标识');
      check(buildMonthlyTransitSnapshot(chart, '2122-12-31').decadal.periodKind === 'unavailable' && buildDailyTransitSnapshot(chart, '2122-12-31').decadal.periodKind === 'unavailable', '月日边界缺少大限不崩溃');
      const unknownBirth = { ...birth, unknownTime: true }, unknown = createConversation({ type: 'chart', title: '未知时辰合成盘', birthInfo: unknownBirth, chartSnapshot: generateChart(unknownBirth) });
      check(getFortunePreview(unknown.id, 'relationship', 'year:2026').facts.unknownTime, '未知时辰提示');
      check(buildFortuneMessages(monthly)[0].content.includes('comparison') && buildFortuneMessages(annual)[0].content.includes('只有阶段 A'), '提示词绑定单阶段或对比');
      const valid = contentFor(monthly);
      check(validateFortuneContent(JSON.stringify(valid), monthly).sections.length === 7, '对比7章节');
      check(validateFortuneContent(JSON.stringify(contentFor(annual)), annual).sections.length === 4, '单阶段4章节');
      for (const invalid of [{ ...valid, sections: valid.sections.slice(1) }, { ...valid, summary: '必定成功，这个结果注定会发生' }, { ...valid, sections: valid.sections.map(s => ({ ...s, content: '每个章节都重复的无意义内容，应该拒绝。' })) }, { ...valid, sections: valid.sections.map(s => s.key === 'comparison' ? { ...s, evidenceIds: ['a:flow'] } : s) }, { ...valid, sections: valid.sections.map(s => s.key === 'a_focus' ? { ...s, evidenceIds: ['b:flow'] } : s) }, { ...valid, sections: valid.sections.map(s => s.key === 'background' ? { ...s, evidenceIds: ['a:flow'] } : s) }]) throws(() => validateFortuneContent(JSON.stringify(invalid), monthly));
      for (const topic of Object.keys(FORTUNE_TOPICS) as Array<keyof typeof FORTUNE_TOPICS>) {
        const r = await generateFortuneReport(conversation.id, topic, 'year:2026');
        check(r.versions[0].status === 'completed' && r.report.topic === topic, '四主题独立生成');
      }
      const first = findFortuneReport(conversation.id, 'career', 'year:2026', '')!; const oldVersion = first.report.activeVersionId;
      const count = calls;
      check((await generateFortuneReport(conversation.id, 'career', 'year:2026')).report.activeVersionId === oldVersion && calls === count, '缓存不重复调用');
      delete process.env.DEEPSEEK_API_KEY;
      check((await generateFortuneReport(conversation.id, 'career', 'year:2026')).report.activeVersionId === oldVersion, '回看不依赖密钥');
      process.env.DEEPSEEK_API_KEY = 'synthetic-fortune-key';
      const renewed = await generateFortuneReport(conversation.id, 'career', 'year:2026', '', true);
      check(renewed.versions.length === 2 && renewed.report.activeVersionId !== oldVersion && renewed.versions.some(v => v.id === oldVersion && v.content), '重新生成保留旧版');
      mode = 'error';
      await assert.rejects(generateFortuneReport(conversation.id, 'career', 'year:2026', '', true), e => e instanceof Error && !e.message.includes('synthetic-fortune-key')); checks++;
      const failed = readFortuneReport(conversation.id, first.report.id);
      check(failed.versions[0].status === 'failed' && failed.report.activeVersionId === renewed.report.activeVersionId, '失败保留已完成版本');
      check(!JSON.stringify(failed).includes('不可泄漏') && failed.versions[0].errorCode === 'generation_failed', '上游错误脱敏');
      mode = 'normal';
      check((await generateFortuneReport(conversation.id, 'career', 'year:2026', '', true)).versions[0].version === 4, '失败后新版本重试');
      const cmp = await generateFortuneReport(conversation.id, 'wealth', 'month:2025-06', 'month:2025-06-leap');
      check(cmp.versions[0].content?.sections.length === 7, '月度对比生成保存');
      const reverse = await generateFortuneReport(conversation.id, 'wealth', 'month:2025-06-leap', 'month:2025-06');
      check(reverse.report.id !== cmp.report.id, 'A/B顺序独立缓存');
      mode = 'delay'; const previousCalls = calls;
      const pending = generateFortuneReport(conversation.id, 'career', 'year:2027');
      const duplicate = await generateFortuneReport(conversation.id, 'career', 'year:2027');
      check(duplicate.versions[0].status === 'generating', '并发复用任务'); await pending;
      check(calls === previousCalls + 1, '并发只调用一次');
      mode = 'invalid'; await assert.rejects(generateFortuneReport(conversation.id, 'study', 'year:2028')); checks++;
      check(findFortuneReport(conversation.id, 'study', 'year:2028', '')?.report.activeVersionId === null, '错阶段引用不发布'); mode = 'normal';
      const staleFacts = getFortunePreview(conversation.id, 'study', 'year:2029').facts;
      const claimInput = { conversationId: conversation.id, facts: staleFacts, title: '过期任务合成', provider: 'test', model: 'test', promptVersion: 'test', regenerate: false };
      const stale = claimFortuneVersion(claimInput);
      getDatabase().prepare('UPDATE fortune_topic_versions SET updated_at = ? WHERE id = ?').run(Date.now() - FORTUNE_STALE_MS - 1, stale.versionId);
      check(readFortuneReport(conversation.id, stale.detail.report.id).versions[0].status === 'failed', '过期恢复');
      const retry = claimFortuneVersion(claimInput);
      check(!finishFortuneVersion(stale.versionId, stale.requestId!, contentFor(staleFacts), 1, 1), '迟到结果不能覆盖重试');
      check(finishFortuneVersion(retry.versionId, retry.requestId!, contentFor(staleFacts), 1, 1), '最新任务发布');
      check(!finishFortuneVersion(retry.versionId, retry.requestId!, contentFor(staleFacts), 1, 1), '任务只发布一次');
      closeDatabaseConnection(); check(readFortuneReport(conversation.id, first.report.id).versions.length === 4, '重开版本保留');
      const exported = createChartPackage(conversation.id), imported = importChartPackage({ buffer: exported.buffer, confirmation: CHART_IMPORT_CONFIRMATION });
      const importedReport = findFortuneReport(imported.conversationId, 'career', 'year:2026', '')!;
      check(importedReport.versions.length === 4 && importedReport.report.id !== first.report.id && importedReport.versions.some(v => v.id === importedReport.report.activeVersionId), '单盘迁移版本与软引用重映射');
      const backup = await createLocalBackupArchive(); getDatabase().prepare('DELETE FROM fortune_topic_reports').run();
      await restoreLocalBackupArchive({ archive: backup.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      check(readFortuneReport(conversation.id, first.report.id).versions.length === 4, '整库备份恢复专题');
      const importedVersion = importedReport.versions[0].id;
      getDatabase().prepare('DELETE FROM conversations WHERE id = ?').run(imported.conversationId);
      check(!getDatabase().prepare('SELECT id FROM fortune_topic_versions WHERE id = ?').get(importedVersion), '删除命盘级联清理版本');
      check((getDatabase().pragma('foreign_key_check') as unknown[]).length === 0, '外键完整');
    });
    const context = { params: Promise.resolve({ id: conversation.id }) };
    for (const [token, expected] of [[undefined, 401], [tb, 404], [ta, 200]] as const) {
      for (const body of [undefined, { topic: 'career', period: 'year:2026' }]) { const response = body === undefined ? await GET(request(conversation.id, token), context) : await POST(request(conversation.id, token, '', body), context); check(response.status === expected, '读写账号边界'); await response.json(); }
    }
    const reportId = runAsUser(a, () => findFortuneReport(conversation.id, 'career', 'year:2026', '')!.report.id);
    const forbidden = await GET(request(conversation.id, tb, `?reportId=${reportId}`), context); check(forbidden.status === 404, '跨用户版本回看拒绝'); await forbidden.json();
    for (const body of [[], null, { topic: '__proto__', period: 'year:2026' }, { topic: 'career', period: 2026 }, { topic: 'career', period: 'year:2026', regenerate: 'yes' }, { topic: 'career', period: 'year:2026', compare: 2027 }, { topic: 'career', period: 'year:2026', compare: 'month:2026-09' }]) { const r = await POST(request(conversation.id, ta, '', body), context); check(r.status === 400, '拒绝无效输入'); await r.json(); }
    for (const query of ['?year=2026.0', '?period=year:2026&topic=__proto__', '?period=month:2026-06-leap&topic=career']) { const r = await GET(request(conversation.id, ta, query), context); check(r.status === 400, '拒绝无效查询'); await r.json(); }
    const other = runAsUser(a, () => createConversation({ type: 'chart', title: '另一份合成盘', birthInfo: birth, chartSnapshot: chart }));
    const otherRead = await GET(request(other.id, ta, `?reportId=${reportId}`), { params: Promise.resolve({ id: other.id }) }); check(otherRead.status === 404, '同账号命盘之间不可错挂版本'); await otherRead.json();
    await runAsUser(a, async () => {
      getDatabase().exec('DROP TABLE qimen_turns; DROP TABLE qimen_sessions; DROP TABLE liuyao_turns; DROP TABLE liuyao_sessions; DROP TABLE meihua_turns; DROP TABLE meihua_sessions; DROP TABLE election_plans; DROP TABLE synthesis_report_versions; DROP TABLE synthesis_sessions; DROP TABLE bazi_reading_versions; DROP TABLE fortune_topic_versions; DROP TABLE fortune_topic_reports; DELETE FROM schema_migrations WHERE version >= 49;'); closeDatabaseConnection();
      check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v === 56, 'v48自动迁移当前v56（含专题迁移）');
      check(Boolean(getDatabase().prepare('SELECT id FROM conversations WHERE id = ?').get(conversation.id)), '升级保留命盘');
      check(Boolean(getDatabase().prepare("SELECT name FROM sqlite_master WHERE name = 'fortune_calendar_readings'").get()), '升级保留日历表');
    });
    console.log(`紫微运势专题专项通过：${checks}项；农历年份/闰月、四主题、阶段对比、版本保留、并发恢复、账号隔离、迁移与备份。`);
  } finally {
    runAsUser(a, closeDatabaseConnection); runAsUser(b, closeDatabaseConnection); closeAccountConnections(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('清理目录不在临时目录内'); rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
