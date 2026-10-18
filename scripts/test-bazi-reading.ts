import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { createBaziBirthProfile, deleteBaziBirthProfile } from '../lib/db/bazi';
import { calculateBazi } from '../lib/bazi/engine';
import { BAZI_CLIMATE_RULES, BAZI_STEM_MONTH_REFERENCES, seasonForBranch } from '../lib/bazi/climate-rules';
import { analyzeBaziClimate, buildBaziReadingChatSnapshot, buildBaziReadingFacts, positions } from '../lib/bazi/reading-engine';
import { getBaziReadingDetail, generateBaziReading } from '../lib/bazi/reading-service';
import { buildBaziReadingMessages, validateBaziReadingContent } from '../lib/bazi/reading-interpretation';
import { BAZI_READING_SECTIONS, type BaziReadingContent, type BaziReadingFacts } from '../lib/bazi/reading-types';
import { BAZI_READING_STALE_MS, claimBaziReading, fingerprintBaziReading, finishBaziReading, listBaziReadings } from '../lib/db/bazi-readings';
import { BAZI_READING_EXAMPLES, baziReadingExample } from '../lib/bazi/reading-examples';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { GET, POST } from '../app/api/bazi/charts/[id]/reading/route';
import type { BaziElement, BaziPillar } from '../lib/bazi/types';
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-bazi-reading-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts'); process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite'); process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek'; process.env.DEEPSEEK_API_KEY = 'synthetic-bazi-reading-key'; process.env.DEEPSEEK_MODEL = 'synthetic-bazi-reading-model';
let checks = 0, calls = 0, mode = 'normal';
function check(v: unknown, message: string) { assert.ok(v, message); checks++; }
function contentFor(facts: BaziReadingFacts): BaziReadingContent { return { summary: `${facts.chart.dayMaster.stem}${facts.chart.dayMaster.element}日主合成论命摘要，仅用于核对五个论命章节、依据与版本保存。`, sections: (Object.keys(BAZI_READING_SECTIONS) as Array<keyof typeof BAZI_READING_SECTIONS>).map((key, i) => {
  const base = key === 'action' ? 'chart:policy' : facts.evidence.find(e => e.id.startsWith(`${key}:${facts.monthCommandReview && (key === 'strength' || key === 'pattern') ? 'month-command:' : ''}`))!.id;
  const intake = facts.monthIntake && key === 'pattern' ? facts.evidence.find(e => e.id.startsWith('pattern:month-intake:'))?.id : undefined;
  return { key, content: `第${i + 1}节 ${key} 合成解释，结合实际月令和方法条件，核对表层藏干及尚未确定的信息。`, evidenceIds: intake && intake !== base ? [base, intake] : [base] };
}) }; }
const server = createServer(async (req, res) => { calls++; let raw = ''; for await (const chunk of req) raw += chunk; const data = JSON.parse(raw), facts = JSON.parse(data.messages.at(-1).content) as BaziReadingFacts;
  if (mode === 'error') { res.writeHead(503); res.end('内部 synthetic-bazi-reading-key 供应商错误'); return; }
  if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 70));
  const content = contentFor(facts); if (mode === 'wrong') content.sections[2].evidenceIds = ['strength:assessment'];
  res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 80, completion_tokens: 120 } }));
});
function request(chartId: string, token?: string, body?: unknown, query = '') { return new Request(`http://local/api/bazi/charts/${chartId}/reading${query}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function main() {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('模拟服务地址错误'); process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  const a = await registerUser({ username: 'bazi-reading-a', password: randomUUID(), displayName: '论命测试甲' }), b = await registerUser({ username: 'bazi-reading-b', password: randomUUID(), displayName: '论命测试乙' });
  const tokenA = createSession(a.id), tokenB = createSession(b.id);
  const profileInput = { displayName: '合成八字论命', birthDate: '1992-07-09', birthTime: '09:30', gender: 'female' as const, timeZoneId: 'Asia/Shanghai', unknownTime: false, initialChart: { timeStandard: 'civil_time' as const, lateZiPolicy: 'next_day' as const } };
  const profile = runAsUser(a, () => createBaziBirthProfile(profileInput)), chartId = profile.charts[0].id;
  try {
    check(BAZI_CLIMATE_RULES.length === 20 && new Set(BAZI_CLIMATE_RULES.map(r => r.id)).size === 20, '五行四时20条规则唯一');
    const base = calculateBazi({ birthDate: '1992-07-09', birthTime: '09:30', gender: 'female' });
    const stems: Array<[string, BaziElement]> = [['甲', '木'], ['乙', '木'], ['丙', '火'], ['丁', '火'], ['戊', '土'], ['己', '土'], ['庚', '金'], ['辛', '金'], ['壬', '水'], ['癸', '水']];
    for (const [stem, element] of stems) for (const branch of '子丑寅卯辰巳午未申酉戌亥') {
      // 这是规则选择的合成组合，不作为具有出生日期一致性的实际排盘使用。
      const fixture = { ...base, dayMaster: { stem, element }, pillars: { ...base.pillars, month: { ...base.pillars.month, branch } } };
      const climate = analyzeBaziClimate(fixture);
      check(climate.rule.elements.length > 0 && climate.season === seasonForBranch(branch) && climate.rule.scope === (BAZI_STEM_MONTH_REFERENCES[`${stem}:${branch}`] ? 'stem_month_reference' : 'seasonal_reference'), '十干十二月120组合明确规则层级');
    }
    assert.throws(() => seasonForBranch('无')); checks++;
    for (const [key, reference] of Object.entries(BAZI_STEM_MONTH_REFERENCES)) {
      const [stem, branch] = key.split(':');
      const element = stems.find(s => s[0] === stem)![1];
      const climate = analyzeBaziClimate({ ...base, dayMaster: { stem, element }, pillars: { ...base.pillars, month: { ...base.pillars.month, branch } } });
      check(climate.stemReferences.map(r => r.stem).join() === reference.stems.join() && climate.rule.elements.join() === reference.elements.join(), '120组来源参考按实际干月命中');
    }
    const beforeTerm = calculateBazi({ birthDate: '2026-02-04', birthTime: '00:01', gender: 'female' }), afterTerm = calculateBazi({ birthDate: '2026-02-05', birthTime: '12:00', gender: 'female' });
    check(analyzeBaziClimate(beforeTerm).season === 'winter' && analyzeBaziClimate(afterTerm).season === 'spring', '调候服从实际节界，不按公历2月');
    check(analyzeBaziClimate(base).directions.every(d => !d.surface.some(p => p.startsWith('日柱'))), '日干只作参照，不重复当候选取用');
    const unknown = calculateBazi({ birthDate: '1992-07-09', unknownTime: true, gender: 'female' });
    check(analyzeBaziClimate(unknown).conditions.some(s => s.includes('时柱未知')), '未知时辰降级');
    const withoutWater = (p: BaziPillar): BaziPillar => ({ ...p, stemElement: '火', hiddenStems: [] });
    const noWater = { ...unknown, pillars: { year: withoutWater(unknown.pillars.year), month: withoutWater(unknown.pillars.month), day: withoutWater(unknown.pillars.day), time: null } };
    check(positions(noWater, '水').status === 'unknown_time', '缺时柱不能断全盘缺水');
    for (const example of BAZI_READING_EXAMPLES) check(baziReadingExample(example.id).synthetic && baziReadingExample(example.id).climate.rule.elements.length > 0, '四个教学示例可重复计算');
    check(baziReadingExample('storage').chart.pillars.month.branch === '戌' && !baziReadingExample('unknown').chart.pillars.time, '杂气与未知教学资料');
    await runAsUser(a, async () => {
      check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v === 56, 'v56 初始化');
      const detail = getBaziReadingDetail(chartId), facts = detail.facts;
      check(facts.evidence.some(e => e.family === 'climate') && facts.evidence.some(e => e.family === 'pattern') && facts.usefulElements.length === 5, '完整四方法总览与五行矩阵');
      const contrasting = { ...facts.interpretation, usefulGod: { ...facts.interpretation.usefulGod, methods: facts.interpretation.usefulGod.methods.map(m => m.method === 'balancing' ? { ...m, status: 'candidate_direction' as const, candidateElements: ['火'] as BaziElement[] } : m) } };
      const separated = buildBaziReadingFacts(facts.chart, contrasting, facts.patterns, facts.chartFingerprint);
      check(separated.usefulElements.find(e => e.element === '水')?.status === 'conditions_pending' && !separated.usefulElements.some(e => e.status === 'method_conflict'), '调候与扶抑分别核对，不按元素不相交伪造冲突');
      check(fingerprintBaziReading(facts) === fingerprintBaziReading({ ...facts, interpretation: { ...facts.interpretation, calculatedAt: '2099-01-01' } }), '计算时间不改变规则指纹');
      check(new Set(facts.evidence.map(e => e.id)).size === facts.evidence.length, '所有依据ID唯一');
      check(buildBaziReadingChatSnapshot(facts.chart).includes('新增原局调候参考') && buildBaziReadingMessages(facts)[0].content.includes('五节完整'), '聊天与独立报告复用规则');
      const unknownProfile = createBaziBirthProfile({ ...profileInput, displayName: '未知合成八字', unknownTime: true, birthTime: undefined });
      const unknownFacts = getBaziReadingDetail(unknownProfile.charts[0].id).facts;
      check(unknownFacts.usefulElements.every(e => e.status === 'undetermined') && !unknownFacts.chart.pillars.time, '未知时辰不强行裁定喜忌');
      const valid = contentFor(facts); check(validateBaziReadingContent(JSON.stringify(valid), facts).sections.length === 5, '有效五节正文');
      for (const invalid of [{ ...valid, sections: valid.sections.slice(1) }, { ...valid, sections: [valid.sections[0], valid.sections[0], ...valid.sections.slice(2)] }, { ...valid, summary: '你的最终用神是火，这个结果必定正确' }, { ...valid, sections: valid.sections.map(s => ({ ...s, content: '重复内容不符合独立章节完整性的要求。' })) }, { ...valid, sections: valid.sections.map(s => s.key === 'climate' ? { ...s, evidenceIds: ['strength:assessment'] } : s) }, { ...valid, sections: valid.sections.map(s => ({ ...s, evidenceIds: ['invented'] })) }]) { assert.throws(() => validateBaziReadingContent(JSON.stringify(invalid), facts)); checks++; }
      const first = await generateBaziReading(chartId); check(first.versions[0].status === 'completed' && first.versions[0].content?.sections.length === 5, '生成保存完整论命');
      const count = calls; delete process.env.DEEPSEEK_API_KEY;
      check((await generateBaziReading(chartId)).activeVersionId === first.activeVersionId && calls === count, '缓存回看不依赖AI密钥'); process.env.DEEPSEEK_API_KEY = 'synthetic-bazi-reading-key';
      const second = await generateBaziReading(chartId, true); check(second.versions.length === 2 && second.activeVersionId !== first.activeVersionId && second.versions.some(v => v.id === first.activeVersionId && v.content), '重新生成保留旧版');
      mode = 'error'; await assert.rejects(generateBaziReading(chartId, true), e => e instanceof Error && !e.message.includes('synthetic-bazi-reading-key')); checks++;
      const failed = getBaziReadingDetail(chartId); check(failed.versions[0].status === 'failed' && failed.activeVersionId === second.activeVersionId && !JSON.stringify(failed).includes('内部 synthetic'), '失败脱敏且保留旧版');
      mode = 'normal'; check((await generateBaziReading(chartId, true)).versions[0].version === 4, '失败后重试另存版本');
      mode = 'delay'; const previous = calls, pending = generateBaziReading(chartId, true), duplicate = await generateBaziReading(chartId, true); check(duplicate.versions[0].status === 'generating', '并发复用已有任务'); await pending; check(calls === previous + 1, '并发只调用一次');
      mode = 'wrong'; await assert.rejects(generateBaziReading(chartId, true)); checks++; check(getBaziReadingDetail(chartId).versions[0].status === 'failed', '方法引用不匹配拒绝发布'); mode = 'normal';
      const stale = claimBaziReading({ chartId, facts, regenerate: true, provider: 'test', model: 'test', promptVersion: 'test' });
      getDatabase().prepare('UPDATE bazi_reading_versions SET updated_at = ? WHERE id = ?').run(Date.now() - BAZI_READING_STALE_MS - 1, stale.version.id);
      check(listBaziReadings(chartId)[0].status === 'failed', '任务过期恢复');
      const retry = claimBaziReading({ chartId, facts, regenerate: true, provider: 'test', model: 'test', promptVersion: 'test' });
      check(!finishBaziReading(stale.version.id, stale.requestId!, valid, 1, 1), '过期迟到响应拒绝'); check(finishBaziReading(retry.version.id, retry.requestId!, valid, 1, 1), '最新任务发布'); check(!finishBaziReading(retry.version.id, retry.requestId!, valid, 1, 1), '同任务只发布一次');
      closeDatabaseConnection(); check(getBaziReadingDetail(chartId).versions.length === 8, '重开完整版本保留');
      const archive = await createLocalBackupArchive(); getDatabase().prepare('DELETE FROM bazi_reading_versions').run(); await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      check(getBaziReadingDetail(chartId).versions.length === 8, '整库备份恢复论命版本');
      const other = createBaziBirthProfile({ ...profileInput, displayName: '删盘合成八字' });
      const newFacts=getBaziReadingDetail(other.charts[0].id).facts,legacyFacts={...newFacts,methodologyVersion:'bazi-reading-v1-seasonal-cross-method',fineReview:undefined,natalReview:undefined,methodReview:undefined,monthCommandReview:undefined,evidence:newFacts.evidence.filter(e=>!e.id.includes(':month-command:')),climate:{...newFacts.climate,reference:undefined}};
      const legacyClaim=claimBaziReading({chartId:other.charts[0].id,facts:legacyFacts,regenerate:false,provider:'mock',model:'mock',promptVersion:'bazi-reading-report-v1'});
      check(finishBaziReading(legacyClaim.version.id,legacyClaim.requestId!,contentFor(legacyFacts),1,1),'合成旧格式报告保存');
      const preserved=getBaziReadingDetail(other.charts[0].id);check(preserved.versions[0].facts.methodologyVersion===legacyFacts.methodologyVersion&&!preserved.versions[0].facts.fineReview,'旧格式回看不补写新规则');
      const upgraded=await generateBaziReading(other.charts[0].id);check(upgraded.versions.length===2&&upgraded.versions[0].facts.methodologyVersion===newFacts.methodologyVersion&&upgraded.versions[1].id===legacyClaim.version.id,'新规则生成另存并保留旧报告');
      check(upgraded.versions[0].facts.natalReview?.version===newFacts.natalReview?.version&&!upgraded.versions[1].facts.natalReview,'原局复核随新报告保存，不补写旧报告');
      const v2Facts={...newFacts,methodologyVersion:'bazi-reading-v2-monthly-conditional-review',natalReview:undefined,methodReview:undefined,monthCommandReview:undefined,evidence:newFacts.evidence.filter(e=>!e.id.includes(':month-command:'))};
      const v2Claim=claimBaziReading({chartId:other.charts[0].id,facts:v2Facts,regenerate:true,provider:'mock',model:'mock',promptVersion:'bazi-reading-report-v2-monthly-conditions'});
      check(finishBaziReading(v2Claim.version.id,v2Claim.requestId!,contentFor(v2Facts),1,1),'上一版精细论命快照可保存');
      const v2Saved=JSON.stringify(listBaziReadings(other.charts[0].id).find(v=>v.id===v2Claim.version.id));
      getBaziReadingDetail(other.charts[0].id);
      check(JSON.stringify(listBaziReadings(other.charts[0].id).find(v=>v.id===v2Claim.version.id))===v2Saved,'读取当前复核不重算或重写上一版快照');
      const v3Facts={...newFacts,methodologyVersion:'bazi-reading-v3-natal-period-contact-review',methodReview:undefined,monthCommandReview:undefined,evidence:newFacts.evidence.filter(e=>!e.id.includes(':method-')&&!e.id.startsWith('pattern:method:')&&!e.id.includes(':month-command:'))};
      const v3Claim=claimBaziReading({chartId:other.charts[0].id,facts:v3Facts,regenerate:true,provider:'mock',model:'mock',promptVersion:'bazi-reading-report-v3-natal-period-contact'});
      check(finishBaziReading(v3Claim.version.id,v3Claim.requestId!,contentFor(v3Facts),1,1),'上一版原局复核快照可保存');
      const v3Saved=JSON.stringify(listBaziReadings(other.charts[0].id).find(v=>v.id===v3Claim.version.id));
      const methodUpgrade=await generateBaziReading(other.charts[0].id,true);
      check(Boolean(methodUpgrade.versions[0].facts.methodReview)&&JSON.stringify(listBaziReadings(other.charts[0].id).find(v=>v.id===v3Claim.version.id))===v3Saved,'新方法报告另存，v3原快照逐字保留');
      deleteBaziBirthProfile(other.id);
      check(!getDatabase().prepare('SELECT id FROM bazi_reading_versions WHERE chart_version_id = ?').get(other.charts[0].id), '删档级联删除论命版本'); check((getDatabase().pragma('foreign_key_check') as unknown[]).length === 0, '外键完整性');
    });
    const context = { params: Promise.resolve({ id: chartId }) };
    for (const [token, expected] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) { for (const body of [undefined, { regenerate: false }]) { const r = body === undefined ? await GET(request(chartId, token), context) : await POST(request(chartId, token, body), context); check(r.status === expected, '匿名与跨账号读写拒绝'); await r.json(); } }
    for (const body of [[], null, { regenerate: 'yes' }, { regenerate: 1 }]) { const r = await POST(request(chartId, tokenA, body), context); check(r.status === 400, '拒绝无效请求体'); await r.json(); }
    const exampleResponse = await GET(request(chartId, tokenA, undefined, '?example=unknown'), context); check(exampleResponse.status === 200 && (await exampleResponse.json()).example.synthetic, '示例API与当前命盘归属核对');
    const badExample = await GET(request(chartId, tokenA, undefined, '?example=missing'), context); check(badExample.status === 404, '未知示例拒绝'); await badExample.json();
    await runAsUser(a, async () => { getDatabase().exec('DROP TABLE qimen_turns; DROP TABLE qimen_sessions; DROP TABLE liuyao_turns; DROP TABLE liuyao_sessions; DROP TABLE meihua_turns; DROP TABLE meihua_sessions; DROP TABLE election_plans; DROP TABLE synthesis_report_versions; DROP TABLE synthesis_sessions; DROP TABLE bazi_reading_versions; DELETE FROM schema_migrations WHERE version >= 50;'); closeDatabaseConnection(); check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v === 56, 'v49升级v56'); check(Boolean(getBaziReadingDetail(chartId).facts.chart), '升级保留八字命盘'); });
    console.log(`八字论命深化专项通过：${checks}项；120规则组合、节界、四方法、引用、报告版本、并发恢复、账号隔离及备份迁移。`);
  } finally { runAsUser(a, closeDatabaseConnection); runAsUser(b, closeDatabaseConnection); closeAccountConnections(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('清理目录不在临时目录内'); rmSync(directory, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
