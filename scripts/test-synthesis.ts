import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { createConversation, getConversation, deleteConversation } from '../lib/db/conversations';
import { getBaziChartVersion, deleteBaziChartVersion } from '../lib/db/bazi';
import { calculateBazi } from '../lib/bazi/engine';
import { generateChart } from '../lib/ziwei/algorithm';
import { calculateSynthesisBirth } from '../lib/synthesis/birth';
import { SYNTHESIS_TOPICS, SYNTHESIS_SECTIONS, type SynthesisFacts, type SynthesisContent } from '../lib/synthesis/types';
import { getSynthesisDetail, generateSynthesisReport } from '../lib/synthesis/service';
import { buildSynthesisMessages, validateSynthesisContent } from '../lib/synthesis/interpretation';
import { createSynthesisSession, getSynthesisSession, listSynthesisSessions, deleteSynthesisSession, fingerprintSynthesis, claimSynthesisVersion, finishSynthesisVersion, listSynthesisVersions, SYNTHESIS_STALE_MS } from '../lib/db/synthesis';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { createChartPackage, PORTABLE_CHART_TABLES } from '../lib/chart-transfer/service';
import { GET as list, POST as create } from '../app/api/synthesis/route';
import { POST as preview } from '../app/api/synthesis/preview/route';
import { GET as read, DELETE as remove } from '../app/api/synthesis/[id]/route';
import { POST as report } from '../app/api/synthesis/[id]/reports/route';
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-synthesis-test-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts'); process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite'); process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek'; process.env.DEEPSEEK_API_KEY = 'synthetic-synthesis-key'; process.env.DEEPSEEK_MODEL = 'synthetic-synthesis-model';
let checks = 0, calls = 0, mode = 'normal';
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
function rejects(fn: () => unknown, label: string) { assert.throws(fn, label); checks++; }
function contentFor(facts: Pick<SynthesisFacts, 'topic' | 'evidence'>): SynthesisContent { const z = facts.evidence.find(e => e.id.startsWith('ziwei:'))!.id, b = facts.evidence.find(e => e.id.startsWith('bazi:'))!.id; return { summary: `${facts.topic} 合成合参摘要，仅用于核对五章与两侧引用，保留方法差异及出生资料待核条件。`, sections: (Object.keys(SYNTHESIS_SECTIONS) as Array<keyof typeof SYNTHESIS_SECTIONS>).map((key,i) => ({ key, content: `第${i + 1}节 ${key} 合成观察。分别核对宫位与十神位置，共同方向不构成独立事实的证明，保留不同侧重点。`, evidenceIds: key === 'ziwei' ? [z] : key === 'bazi' ? [b] : [z,b] })) }; }
const server = createServer(async (req,res) => { calls++; let raw = ''; for await (const chunk of req) raw += chunk; const facts = JSON.parse(JSON.parse(raw).messages.at(-1).content); if (mode === 'error') { res.writeHead(503); res.end('内部 synthetic-synthesis-key 供应商错误'); return; } if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 120)); const c = contentFor(facts); if (mode === 'wrong') c.sections[0].evidenceIds = c.sections[1].evidenceIds; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(c) } }], usage: { prompt_tokens: 70, completion_tokens: 110 } })); });
const input = { displayName: '合成双盘', birthDate: '1992-07-09', birthTime: '09:30', gender: 'female', timeZoneId: 'Etc/GMT-8', timeStandard: 'civil_time', lateZiPolicy: 'next_day' };
function request(token?: string, method = 'GET', body?: unknown, query = '') { return new Request(`http://local/api/synthesis${query}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function main() {
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('测试地址错误'); process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  const a = await registerUser({ username: 'synthesis-a', password: randomUUID(), displayName: '合参测试甲' }), b = await registerUser({ username: 'synthesis-b', password: randomUUID(), displayName: '合参测试乙' }); const tokenA = createSession(a.id), tokenB = createSession(b.id); let id = '', sourceId = '';
  try {
    const civil = calculateSynthesisBirth(input); check(civil.input.birthTime === '09:30:00' && civil.policy.ziweiHour === 5, '墙上时间标准化且按准确时分取巳时');
    for (const [time,hour] of [['00:00',0],['00:59:59',0],['01:00',1],['02:59:59',1],['03:00',2],['22:59:59',11],['23:00',0]] as const) { const c = calculateSynthesisBirth({ ...input, birthTime: time }); check(c.policy.ziweiHour === hour, `${time}时辰边界`); }
    const early = calculateSynthesisBirth({ ...input, birthDate: '1992-07-10', birthTime: '00:30' }), next = calculateSynthesisBirth({ ...input, birthTime: '23:30' }), same = calculateSynthesisBirth({ ...input, birthTime: '23:30', lateZiPolicy: 'same_day' });
    check(next.policy.ziweiDate === '1992-07-10' && next.policy.lateZiRollover && next.bazi.pillars.day.ganZhi === early.bazi.pillars.day.ganZhi && next.bazi.pillars.time?.ganZhi === early.bazi.pillars.time?.ganZhi, '次日晚子时两盘与早子时同日同柱');
    check(same.policy.ziweiDate === '1992-07-09' && !same.policy.lateZiRollover && same.bazi.pillars.day.ganZhi === civil.bazi.pillars.day.ganZhi, '当日晚子时保留本日日柱');
    check(next.ziwei.palaces.map(p => p.stars.map(s => s.name).join()).join() === early.ziwei.palaces.map(p => p.stars.map(s => s.name).join()).join(), '晚子时与次日紫微星位一致');
    const solar = calculateSynthesisBirth({ ...input, birthTime: '00:15', longitude: 75, timeStandard: 'apparent_solar_time' }); const direct = calculateBazi({ ...solar.input });
    check(solar.bazi.effectiveTime.date === direct.effectiveTime.date && solar.bazi.effectiveTime.time === direct.effectiveTime.time && solar.policy.ziweiDate === solar.policy.effectiveDate && solar.policy.effectiveDate === '1992-07-08', '真太阳时精细校正一次且跨日前一日');
    check(solar.ziwei.birthInfo.hour === Math.floor((Number(direct.effectiveTime.time.slice(0,2)) + 1)/2)%12 && solar.policy.warnings.some(s => s.includes('只') || s.includes('一次')), '太阳校正后的时辰一致');
    const unknown = calculateSynthesisBirth({ ...input, unknownTime: true, birthTime: undefined }); check(unknown.bazi.pillars.time === null && unknown.ziwei.birthInfo.unknownTime && unknown.policy.ziweiHour === 0 && unknown.policy.warnings.some(s => s.includes('边界')), '未知时间不补柱且提示其他柱边界');
    const spring = calculateSynthesisBirth({ ...input, birthDate: '2026-02-05', birthTime: '12:00' }); check(spring.ziwei.lunarInfo.lunarYear === 2025 && spring.bazi.pillars.year.ganZhi === '丙午', '春节与立春年标签允许不同');
    check(calculateSynthesisBirth({ ...input, birthDate: '2000-02-29' }).policy.ziweiDate === '2000-02-29', '闰年日期');
    for (const changes of [{ birthDate: '1900-01-01', birthTime: '00:05', timeStandard: 'apparent_solar_time', longitude: 75 },{ birthDate: '2100-12-31', birthTime: '23:30' },{ birthDate: '1900-02-29' },{ birthTime: '24:00' },{ gender: 'other' },{ unknownTime: 'true' },{ unknownTime: true, timeStandard: 'apparent_solar_time', longitude: 100 },{ timeZoneId: 'Asia/Shanghai' },{ timeZoneId: 'America/New_York' },{ longitude: NaN },{ longitude: 181 },{ longitude: '116.4' },{ displayName: '' },{ displayName: 'a'.repeat(81) },{ birthTime: null },{ sourceConversationId: 2 },{ timeStandard: 'invalid' },{ lateZiPolicy: 'invalid' }]) rejects(() => calculateSynthesisBirth({ ...input,...changes }), '非法资料与越界拒绝');
    for (const raw of [null,[],false,'data']) rejects(() => calculateSynthesisBirth(raw), '非法根值拒绝');
    await runAsUser(a, async () => {
      check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v === 56, 'v56初始化');
      const sourceBirth = { year: 1992, month: 7, day: 9, hour: 5, gender: 'female' as const, name: '原盘合成' }; const source = createConversation({ type: 'chart', title: '原盘合成', birthInfo: sourceBirth, chartSnapshot: generateChart(sourceBirth) }); sourceId = source.id;
      const created = createSynthesisSession({ ...input, sourceConversationId: sourceId }); id = created.session.id; check(!created.reused && getConversation(created.session.conversationId)?.id !== sourceId && Boolean(getBaziChartVersion(created.session.baziChartId)), '同次建立独立双盘且原盘不覆盖');
      const duplicate = createSynthesisSession({ ...input, displayName: ' 合成双盘 ', birthTime: '09:30:00', sourceConversationId: sourceId }); check(duplicate.reused && duplicate.session.id === id && listSynthesisSessions().length === 1, '同口径规范输入幂等');
      const before = (getDatabase().prepare('SELECT COUNT(*) AS n FROM conversations').get() as { n: number }).n;
      getDatabase().exec("CREATE TEMP TRIGGER fail_synthesis BEFORE INSERT ON synthesis_sessions BEGIN SELECT RAISE(ABORT, 'synthetic rollback'); END"); rejects(() => createSynthesisSession({ ...input, displayName: '回滚双盘' }), '事务插入失败'); getDatabase().exec('DROP TRIGGER fail_synthesis'); check((getDatabase().prepare('SELECT COUNT(*) AS n FROM conversations').get() as { n: number }).n === before, '事务失败不遗留底层盘');
      const facts = getSynthesisDetail(id,'overview').facts, valid = contentFor(facts); check(new Set(facts.evidence.map(e => e.id)).size === facts.evidence.length && facts.evidence.some(e => e.id.startsWith('ziwei:topic:')) && facts.evidence.some(e => e.id === 'bazi:topic'), '证据ID唯一且主题两侧有依据');
      const changed = structuredClone(facts); changed.ziwei.currentAge++; changed.bazi.chart.calculatedAt += 1000; check(fingerprintSynthesis(facts) === fingerprintSynthesis(changed), '当前年龄与计算时间不触发缓存失效');
      const messages = buildSynthesisMessages(facts); check(messages[0].content.includes('不构成') || messages[0].content.includes('不是独立事实'), '保留合参非独立证明边界'); check(!Object.hasOwn(JSON.parse(messages[1].content).ziwei,'currentAge'), '提示词不混入当前阶段');
      check(validateSynthesisContent(JSON.stringify(valid),facts).sections.length === 5, '合法双侧引用五章通过');
      for (const mutate of [(c:SynthesisContent)=>c.sections.pop(), (c:SynthesisContent)=>c.sections[1].key = 'ziwei', (c:SynthesisContent)=>c.sections[0].evidenceIds = ['missing'], (c:SynthesisContent)=>c.sections[0].evidenceIds = valid.sections[1].evidenceIds, (c:SynthesisContent)=>c.sections[2].evidenceIds = valid.sections[0].evidenceIds, (c:SynthesisContent)=>c.sections[3].content = c.sections[4].content, (c:SynthesisContent)=>c.summary = '这里说你注定会成功，这是测试拒绝内容。', (c:SynthesisContent)=>c.sections[4].content = '这里用统计证明命运，这是测试拒绝内容。']) { const wrong = structuredClone(valid); mutate(wrong); rejects(() => validateSynthesisContent(JSON.stringify(wrong),facts), '非法内容与引用拒绝'); }
      for (const raw of ['invalid','[]','null', 'a'.repeat(36001)]) rejects(() => validateSynthesisContent(raw,facts), '坏JSON与过长响应拒绝');
      const oldKey = process.env.DEEPSEEK_API_KEY; process.env.DEEPSEEK_API_KEY = ''; await assert.rejects(generateSynthesisReport(id,'overview'), /AI 服务/); checks++; process.env.DEEPSEEK_API_KEY = oldKey;
      for (const topic of Object.keys(SYNTHESIS_TOPICS) as Array<keyof typeof SYNTHESIS_TOPICS>) { const previous = calls, result = await generateSynthesisReport(id,topic); check(result.versions[0].status === 'completed' && result.versions[0].topic === topic && result.versions.length === 1, '五主题分别保存'); await generateSynthesisReport(id,topic); check(calls === previous + 1, '回看缓存不重复AI'); }
      const old = getSynthesisDetail(id,'overview').activeVersionId, second = await generateSynthesisReport(id,'overview',true); check(second.versions.length === 2 && second.activeVersionId !== old, '重生成保留旧版本');
      mode = 'error'; await assert.rejects(generateSynthesisReport(id,'overview',true), e => e instanceof Error && !e.message.includes('synthetic-synthesis-key')); checks++; check(getSynthesisDetail(id,'overview').activeVersionId === second.activeVersionId && getSynthesisDetail(id,'overview').versions[0].status === 'failed', '失败脱敏且旧版仍在');
      mode = 'wrong'; await assert.rejects(generateSynthesisReport(id,'overview',true)); checks++; check(getSynthesisDetail(id,'overview').versions[0].status === 'failed', '跨体系误引用拒绝保存');
      mode = 'delay'; const count = calls, pending = generateSynthesisReport(id,'overview',true), repeated = await generateSynthesisReport(id,'overview',true); check(repeated.versions[0].status === 'generating', '并发复用任务'); await pending; check(calls === count+1, '并发仅一次供应商调用');
      const cancel = new AbortController(); cancel.abort(); await assert.rejects(generateSynthesisReport(id,'overview',true,cancel.signal)); checks++; check(getSynthesisDetail(id,'overview').versions[0].status === 'failed', '取消任务释放占位'); mode = 'normal';
      const stale = claimSynthesisVersion({ sessionId: id, facts, regenerate: true, provider: 'mock', model: 'mock', promptVersion: 'test' }); getDatabase().prepare('UPDATE synthesis_report_versions SET updated_at = ? WHERE id = ?').run(Date.now()-SYNTHESIS_STALE_MS-1,stale.version.id); check(listSynthesisVersions(id,'overview')[0].status === 'failed','过期生成可恢复');
      const retry = claimSynthesisVersion({ sessionId: id, facts, regenerate: true, provider: 'mock', model: 'mock', promptVersion: 'test' }); check(!finishSynthesisVersion(stale.version.id,stale.requestId!,valid,1,1) && !finishSynthesisVersion(retry.version.id,'wrong',valid,1,1), '过期与错误任务标识不能发布'); check(finishSynthesisVersion(retry.version.id,retry.requestId!,valid,1,1) && !finishSynthesisVersion(retry.version.id,retry.requestId!,valid,1,1),'仅合法任务发布一次');
      const archive = await createLocalBackupArchive(), versionCount = getSynthesisDetail(id,'overview').versions.length; deleteSynthesisSession(id); await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION }); check(getSynthesisDetail(id,'overview').versions.length === versionCount && Boolean(getBaziChartVersion(created.session.baziChartId)), '完整备份恢复双盘和版本关系');
      const transfer = createChartPackage(created.session.conversationId); check(!PORTABLE_CHART_TABLES.some(t => String(t).startsWith('synthesis')) && transfer.preview.boundaries.some(s => s.includes('合参')), '单紫微包明确排除独立合参关系');
      const removed = createSynthesisSession({ ...input, displayName: '移除合参保留盘' }).session; await generateSynthesisReport(removed.id,'study'); deleteSynthesisSession(removed.id); check(Boolean(getConversation(removed.conversationId)) && Boolean(getBaziChartVersion(removed.baziChartId)) && !getDatabase().prepare('SELECT id FROM synthesis_report_versions WHERE session_id = ?').get(removed.id), '移除只删合参及报告');
      for (const type of ['ziwei','bazi']) { const s = createSynthesisSession({ ...input, displayName: `删${type}级联合参` }).session; await generateSynthesisReport(s.id,'career'); if (type === 'ziwei') deleteConversation(s.conversationId); else deleteBaziChartVersion(s.baziChartId); check(!getSynthesisSession(s.id) && !getDatabase().prepare('SELECT id FROM synthesis_report_versions WHERE session_id = ?').get(s.id), '删底层盘级联移除合参版本'); }
      deleteConversation(sourceId); check(getSynthesisSession(id)?.sourceConversationId === null && Boolean(getSynthesisDetail(id,'overview').facts), '删除旧来源不破坏新双盘');
      check((getDatabase().pragma('foreign_key_check') as unknown[]).length === 0, '外键完整性'); closeDatabaseConnection(); check(Boolean(getSynthesisDetail(id,'career').activeVersionId), '连接重开后主题回看');
    });
    const ctx = { params: Promise.resolve({ id }) };
    for (const [token,expected] of [[undefined,401],[tokenB,404],[tokenA,200]] as const) { for (const operation of ['read','report'] as const) { const r = operation === 'read' ? await read(request(token),ctx) : await report(request(token,'POST',{ topic:'overview' }),ctx); check(r.status === expected,'匿名和跨账号读写拒绝'); await r.json(); } }
    const anonymous = await create(request(undefined,'POST',input)); check(anonymous.status === 401,'匿名不能创建'); await anonymous.json();
    const otherList = await list(request(tokenB)); check((await otherList.json()).sessions.length === 0,'跨账号列表隔离');
    const foreignDelete = await remove(request(tokenB,'DELETE',{}),ctx); check(foreignDelete.status === 404,'跨账号删除拒绝'); await foreignDelete.json();
    const ownPreview = await preview(request(tokenA,'POST',input)); check(ownPreview.status === 200 && (await ownPreview.json()).pillars.length === 4,'预览返回口径与四柱');
    for (const operation of [create,preview]) for (const data of [null,[],{ ...input,birthTime:'24:00' },{ ...input,timeZoneId:'Asia/Shanghai' },{ ...input,sourceConversationId:'foreign-source' }]) { const r = await operation(request(tokenA,'POST',data)); check(r.status === (data && !Array.isArray(data) && Object.hasOwn(data,'sourceConversationId') ? 404 : 400),'输入与来源归属拒绝'); await r.json(); }
    for (const data of [null,[],{ topic:'wrong' },{ topic:'overview',regenerate:1 }]) { const r = await report(request(tokenA,'POST',data),ctx); check(r.status === 400,'非法报告参数'); await r.json(); }
    const badTopic = await read(request(tokenA,'GET',undefined,'?topic=wrong'),ctx); check(badTopic.status === 400,'未知查询专题拒绝'); await badTopic.json();
    await runAsUser(a,async () => { const before = listSynthesisSessions()[0]; getDatabase().exec('DROP TABLE qimen_turns; DROP TABLE qimen_sessions; DROP TABLE liuyao_turns; DROP TABLE liuyao_sessions; DROP TABLE meihua_turns; DROP TABLE meihua_sessions; DROP TABLE election_plans; DROP TABLE synthesis_report_versions; DROP TABLE synthesis_sessions; DELETE FROM schema_migrations WHERE version >= 51;'); closeDatabaseConnection(); check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v:number }).v === 56 && Boolean(getConversation(before.conversationId)) && Boolean(getBaziChartVersion(before.baziChartId)), 'v50迁移v56保留现有两盘'); });
    console.log(`紫微八字合参专项通过：${checks}项；时辰换日、太阳时与历法边界、独立双盘、主题引用、版本恢复、账号隔离及备份迁移。`);
  } finally { runAsUser(a,closeDatabaseConnection); runAsUser(b,closeDatabaseConnection); closeAccountConnections(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('清理目录不在临时目录内'); rmSync(directory,{ recursive:true,force:true }); }
}
main().catch(e => { console.error(e); process.exitCode=1; });
