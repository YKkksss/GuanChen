import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Solar } from 'lunar-javascript';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { deleteConversation, getConversation } from '../lib/db/conversations';
import { getBaziChartVersion, deleteBaziChartVersion } from '../lib/db/bazi';
import { createSynthesisSession, getSynthesisSession, deleteSynthesisSession, listSynthesisVersions, claimSynthesisVersion, finishSynthesisVersion, fingerprintSynthesis, SYNTHESIS_STALE_MS } from '../lib/db/synthesis';
import { getSynthesisDetail, generateSynthesisReport } from '../lib/synthesis/service';
import { buildDynamicSynthesisFacts, normalizeDynamicSelection, resolveDynamicRange } from '../lib/synthesis/dynamic-engine';
import { getDynamicSynthesisDetail, saveDynamicSynthesisSnapshot, generateDynamicSynthesisReport } from '../lib/synthesis/dynamic-service';
import { SYNTHESIS_DYNAMIC_VERSION, type SynthesisDynamicFacts, type SynthesisDynamicSelection } from '../lib/synthesis/dynamic-types';
import { SYNTHESIS_SECTIONS, SYNTHESIS_TOPICS, type SynthesisFacts, type SynthesisContent } from '../lib/synthesis/types';
import { buildSynthesisMessages, validateSynthesisContent } from '../lib/synthesis/interpretation';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { calculateBazi } from '../lib/bazi/engine';
import { buildMonthlyTransitSnapshot } from '../lib/transits/engine';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';

// 所有账号、数据库、供应商请求均限于本次新建的临时空间。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-synthesis-dynamic-test-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'synthetic-dynamic-key';
process.env.DEEPSEEK_MODEL = 'synthetic-dynamic-model';
let checks = 0, calls = 0;
let mode: 'normal' | 'error' | 'delay' | 'natal-only' = 'normal';
const received: SynthesisFacts[] = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(fn: () => unknown, label: string) { assert.throws(fn, label); checks++; }
async function rejectsAsync(fn: () => Promise<unknown>, label: string, predicate?: (e: unknown) => boolean) { await assert.rejects(fn, predicate ?? (() => true), label); checks++; }
function selection(dateTime = '2026-10-15T10:30:00', level: SynthesisDynamicSelection['level'] = 'month'): SynthesisDynamicSelection { return { level, dateTime }; }
function shiftSeconds(value: string, seconds: number) { return new Date(Date.parse(`${value.replace(' ', 'T')}+08:00`) + seconds * 1000 + 8 * 3600000).toISOString().slice(0, 19); }
const input = { displayName: '动态合参合成盘', birthDate: '1992-07-09', birthTime: '09:30', gender: 'female', timeZoneId: 'Etc/GMT-8', timeStandard: 'civil_time', lateZiPolicy: 'next_day' };
function contentFor(facts: SynthesisFacts, useNatal = false): SynthesisContent {
  const prefix = facts.dynamic && !useNatal ? ':dynamic:' : ':';
  const z = facts.evidence.find(e => e.id.startsWith(`ziwei${prefix}`))!.id;
  const b = facts.evidence.find(e => e.id.startsWith(`bazi${prefix}`))!.id;
  return { summary: `${facts.topic} 合成阶段摘要，分别核对两套传统规则的时点与证据，保留不同月界、交运精度及未确定条件。`, sections: (Object.keys(SYNTHESIS_SECTIONS) as Array<keyof typeof SYNTHESIS_SECTIONS>).map((key, i) => ({ key, content: `第${i + 1}节 ${key} 合成阶段观察。紫微宫位与八字干支分别陈述，共同方向不构成独立事实的证明，也不能替代真实记录与个人选择。`, evidenceIds: key === 'ziwei' ? [z] : key === 'bazi' ? [b] : [z, b] })) };
}
const server = createServer(async (req, res) => {
  calls++;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const facts = JSON.parse(JSON.parse(raw).messages.at(-1).content) as SynthesisFacts;
  received.push(facts);
  if (mode === 'error') { res.writeHead(503); res.end('内部 synthetic-dynamic-key 供应商错误'); return; }
  const responseMode = mode;
  if (responseMode === 'delay') await new Promise(resolve => setTimeout(resolve, 180));
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(contentFor(facts, responseMode === 'natal-only')) } }], usage: { prompt_tokens: 100, completion_tokens: 130 } }));
});

// 独立十神表：不复用被测动态引擎或其内部十神帮助函数。
const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
function tenGod(day: string, other: string) {
  const d = stems.indexOf(day), o = stems.indexOf(other), de = Math.floor(d / 2), oe = Math.floor(o / 2), same = d % 2 === o % 2;
  return de === oe ? same ? '比肩' : '劫财' : (de + 1) % 5 === oe ? same ? '食神' : '伤官' : (de + 2) % 5 === oe ? same ? '偏财' : '正财' : (oe + 2) % 5 === de ? same ? '七杀' : '正官' : same ? '偏印' : '正印';
}
function verifyDynamicFacts(base: SynthesisFacts, facts: SynthesisDynamicFacts, expected: SynthesisDynamicSelection) {
  equal(facts.dynamic.selection, expected, '观察时刻与粒度规范化');
  equal(facts.dynamic.version, SYNTHESIS_DYNAMIC_VERSION, '独立动态方法版本');
  equal(facts.dynamic.key, `${SYNTHESIS_DYNAMIC_VERSION}:${expected.level}:${expected.dateTime}`, '精确时刻阶段键');
  equal(new Set(facts.evidence.map(e => e.id)).size, facts.evidence.length, '本命与动态证据ID全局唯一');
  check(facts.evidence.some(e => e.id.startsWith('ziwei:dynamic:')) && facts.evidence.some(e => e.id.startsWith('bazi:dynamic:')), '动态两套体系均有独立依据');
  equal(facts.dynamic.ziwei.annual.representativeDate, expected.dateTime.slice(0, 10), '紫微流年按真实观察日定位');
  equal(facts.dynamic.ziwei.annual.boundaryPolicy, 'annual-observation-date', '流年不复用年中代表日');
  const month = expected.level === 'month';
  equal(Boolean(facts.dynamic.ziwei.monthly), month, '年粒度不补紫微流月');
  equal(Boolean(facts.dynamic.bazi.month), month, '年粒度不补八字流月');
  equal(facts.dynamic.bazi.roles.some(r => r.key === 'month'), month, '流月角色遵守粒度');
  for (const role of facts.dynamic.bazi.roles) {
    equal(role.stemTenGod, tenGod(base.bazi.chart.dayMaster.stem, role.ganZhi[0]), '岁运十神以本命日主为参照');
    for (const hidden of role.hiddenStems) equal(hidden.tenGod, tenGod(base.bazi.chart.dayMaster.stem, hidden.stem), '藏干十神以本命日主为参照');
  }
  equal(facts.bazi.chart, base.bazi.chart, '观察时刻不改出生四柱');
  equal(facts.ziwei, base.ziwei, '动态计算不改本命紫微');
}

async function main() {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('合成供应商地址错误');
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  const a = await registerUser({ username: 'dynamic-synthesis-a', password: randomUUID(), displayName: '动态合参测试甲' });
  const b = await registerUser({ username: 'dynamic-synthesis-b', password: randomUUID(), displayName: '动态合参测试乙' });
  const tokenA = createSession(a.id), tokenB = createSession(b.id);
  let id = '', legacyId = '', legacyKey = '';
  try {
    await runAsUser(a, async () => {
      id = createSynthesisSession(input).session.id;
      const base = getSynthesisDetail(id, 'overview').facts, original = JSON.stringify(base);
      equal(normalizeDynamicSelection({ level: 'month', dateTime: '2026-10-15T10:30' }), selection(), '分钟输入显式补零秒');
      equal(normalizeDynamicSelection(selection()), selection(), '完整秒输入保留');
      for (const value of [null, [], false, '2026-10-15', {}, { level: 'day', dateTime: selection().dateTime }, { level: '__proto__', dateTime: selection().dateTime }, { level: 'constructor', dateTime: selection().dateTime }, { level: 'year' }, { dateTime: selection().dateTime }, Object.create(selection()), ...['2026-02-29T12:00:00', '2026-13-01T00:00:00', '2026-10-15T24:00:00', '2026-10-15T10:60:00', '2026-10-15T10:30:60', '2026-10-15 10:30:00', '2026-10-15T10:30:00Z', '2026-10-15T10:30:00+08:00', '2026-10-15T10:30:00.123', '1899-12-31T23:59:59', '2201-01-01T00:00:00'].map(dateTime => ({ level: 'month', dateTime }))]) rejects(() => normalizeDynamicSelection(value), `非法日期、偏移和继承输入拒绝：${JSON.stringify(value)}`);
      equal(normalizeDynamicSelection({ level: 'year', dateTime: '2000-02-29T00:00:00' }), selection('2000-02-29T00:00:00', 'year'), '真实闰日接受');
      const range = resolveDynamicRange(base);
      check(range.minDateTime >= '1992-07-09T09:30:00' && range.maxDateTime === '2122-12-31T23:59:59', '观察范围从出生瞬间至出生年后130年，不扩展底盘出生范围');
      rejects(() => buildDynamicSynthesisFacts(base, selection('1992-07-09T09:29:59')), '出生当天前一秒拒绝');
      rejects(() => buildDynamicSynthesisFacts(base, selection('1992-07-08T12:00:00')), '出生日前拒绝');
      for (const level of ['year', 'month'] as const) verifyDynamicFacts(base, buildDynamicSynthesisFacts(base, selection(undefined, level)), selection(undefined, level));
      equal(JSON.stringify(base), original, '动态构建不修改旧本命事实对象');
      const minute = buildDynamicSynthesisFacts(base, { level: 'month', dateTime: '2026-10-15T10:30' });
      equal(minute.dynamic.key, buildDynamicSynthesisFacts(base, selection()).dynamic.key, '同一时刻分钟与秒输入同键');
      check(minute.dynamic.key !== buildDynamicSynthesisFacts(base, selection('2026-10-15T10:30:01')).dynamic.key, '相邻秒不折叠快照');
      check(minute.dynamic.key !== buildDynamicSynthesisFacts(base, selection(undefined, 'year')).dynamic.key, '年与月粒度不串快照');

      // 春节与立春故意选择不同一侧；不能用一个年标签覆盖另一个体系。
      const preSpringFestival = buildDynamicSynthesisFacts(base, selection('2026-02-05T12:00:00'));
      equal(preSpringFestival.dynamic.ziwei.annual.year.ganZhi, '乙巳', '春节前紫微仍乙巳年');
      equal(preSpringFestival.dynamic.bazi.year.ganZhi, '丙午', '立春后八字已丙午年');
      for (const year of [2025, 2026, 2028]) {
        const lunar = Solar.fromYmdHms(year, 6, 15, 12, 0, 0).getLunar();
        const table = (lunar as unknown as { getJieQiTable(): Record<string, { toYmdHms(): string }> }).getJieQiTable();
        for (const name of ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒']) {
          const at = table[name].toYmdHms().replace(' ', 'T'), before = shiftSeconds(at, -1);
          const left = buildDynamicSynthesisFacts(base, selection(before)), right = buildDynamicSynthesisFacts(base, selection(at));
          check(left.dynamic.bazi.month!.ganZhi !== right.dynamic.bazi.month!.ganZhi, `${year}${name}交节前后秒换节令月`);
          equal(left.dynamic.bazi.month!.endAtExclusive.replace(' ', 'T'), at, '上月截止不含交节瞬间');
          equal(right.dynamic.bazi.month!.startAt.replace(' ', 'T'), at, '新月包含交节瞬间');
          equal(right.dynamic.bazi.year.ganZhi, calculateBazi({ birthDate: at.slice(0, 10), birthTime: at.slice(11), gender: 'female', timeZoneId: 'Etc/GMT-8', timeStandard: 'civil_time' }).pillars.year.ganZhi, '年柱与精确节界参考一致');
          if (name === '立春') check(left.dynamic.bazi.year.ganZhi !== right.dynamic.bazi.year.ganZhi, '立春前后秒独立换年');
          else equal(left.dynamic.bazi.year.ganZhi, right.dynamic.bazi.year.ganZhi, '非立春节界不换八字年');
        }
      }
      const leapBefore = buildDynamicSynthesisFacts(base, selection('2025-08-08T12:00:00'));
      const leapAfter = buildDynamicSynthesisFacts(base, selection('2025-08-09T12:00:00'));
      check(leapBefore.dynamic.ziwei.monthly!.lunarMonth.isLeap && leapAfter.dynamic.ziwei.monthly!.lunarMonth.isLeap, '样例处于闰六月');
      equal(leapAfter.dynamic.ziwei.monthly!.boundaryPolicy, 'lunar-month-observation-date', '动态流月使用真实观察日独立政策');
      equal(leapAfter.dynamic.ziwei.monthly!.representativeDate, '2025-08-09', '闰月后半月未退回月初');
      check(leapBefore.dynamic.ziwei.monthly!.flowMonth.palaceBranch !== leapAfter.dynamic.ziwei.monthly!.flowMonth.palaceBranch, '闰月十五与十六流月落宫按实际日变化');
      const oldMonthly = buildMonthlyTransitSnapshot(base.ziwei, '2025-08-09');
      equal(oldMonthly.boundaryPolicy, 'lunar-month-first-day', '旧流月业务仍保留月初代表快照政策');
      check(oldMonthly.representativeDate !== leapAfter.dynamic.ziwei.monthly!.representativeDate, '动态与旧代表月不混用');
      equal(leapBefore.dynamic.bazi.month!.ganZhi, leapAfter.dynamic.bazi.month!.ganZhi, '闰月半月换宫不改八字节令月');

      // 十个连续出生日覆盖十日主；十个年份覆盖十流年干。
      const seenDays = new Set<string>(), seenYears = new Set<string>();
      for (let day = 9; day <= 18; day++) {
        const chartId = createSynthesisSession({ ...input, displayName: `十神独立核对${day}`, birthDate: `1992-07-${day.toString().padStart(2, '0')}` }).session.id;
        const natal = getSynthesisDetail(chartId, 'career').facts;
        seenDays.add(natal.bazi.chart.dayMaster.stem);
        for (let year = 2020; year <= 2029; year++) {
          const facts = buildDynamicSynthesisFacts(natal, selection(`${year}-07-15T12:00:00`));
          seenYears.add(facts.dynamic.bazi.year.ganZhi[0]);
          for (const role of facts.dynamic.bazi.roles) {
            equal(role.stemTenGod, tenGod(natal.bazi.chart.dayMaster.stem, role.ganZhi[0]), '十日主×十流干的十神核对');
            for (const hidden of role.hiddenStems) equal(hidden.tenGod, tenGod(natal.bazi.chart.dayMaster.stem, hidden.stem), '岁运所有藏干十神独立核对');
          }
        }
      }
      equal(seenDays.size, 10, '覆盖全部本命日主'); equal(seenYears.size, 10, '覆盖全部流年天干');

      // 官方起运案例及八步边界，左闭右开；首运前与末运后不偷用最近运。
      const forwardId = createSynthesisSession({ ...input, displayName: '交运边界合成', birthDate: '2022-03-09', birthTime: '20:51', gender: 'male' }).session.id;
      const forwardBase = getSynthesisDetail(forwardId, 'overview').facts;
      const forwardAt = buildDynamicSynthesisFacts(forwardBase, selection('2030-12-12T06:51:00'));
      equal(forwardAt.dynamic.bazi.luck.startAt?.replace(' ', 'T'), '2030-12-12T06:51:00', '固定UTC8入口可复用已校准分钟大运');
      equal(buildDynamicSynthesisFacts(forwardBase, selection('2030-12-12T06:50:59')).dynamic.bazi.luck.status, 'pre_luck', '起运前一秒无当期大运');
      equal(forwardAt.dynamic.bazi.luck.cycle?.ganZhi, '甲辰', '首运起点左闭');
      const regular = structuredClone(forwardBase.bazi.chart); regular.input.timeZoneId = 'Asia/Shanghai';
      const luck = calculateBaziLuckCycles(regular);
      for (let index = 0; index < luck.cycles.length; index++) {
        const cycle = luck.cycles[index];
        if (!cycle.startAt || !cycle.endAtExclusive || cycle.startAt.slice(0, 4) > '2100') continue;
        const at = cycle.startAt.replace(' ', 'T');
        equal(buildDynamicSynthesisFacts(forwardBase, selection(at)).dynamic.bazi.luck.cycle?.ganZhi, cycle.ganZhi, '每步交运瞬间属于新运');
        if (index) equal(buildDynamicSynthesisFacts(forwardBase, selection(shiftSeconds(at, -1))).dynamic.bazi.luck.cycle?.ganZhi, luck.cycles[index - 1].ganZhi, '交运前一秒属于旧运');
      }
      const birthMoment = buildDynamicSynthesisFacts(forwardBase, selection('2022-03-09T20:51:00'));
      equal(birthMoment.dynamic.ziwei.annual.decadal.periodKind, 'childhood', '出生当日童限不冒充十年大限');
      equal(birthMoment.dynamic.bazi.luck.cycle, null, '首运前不造大运干支');
      const oldId = createSynthesisSession({ ...input, displayName: '八步后撤回合成', birthDate: '1901-07-09' }).session.id;
      const afterEight = buildDynamicSynthesisFacts(getSynthesisDetail(oldId, 'overview').facts, selection('2026-07-01T12:00:00'));
      equal(afterEight.dynamic.bazi.luck.status, 'unavailable', '超过八步排期撤回大运');
      equal(afterEight.dynamic.bazi.luck.cycle, null, '末运后不沿用最后一步');
      check(!afterEight.dynamic.bazi.roles.some(r => r.key === 'luck'), '末运后不携带大运十神');
      const unknownId = createSynthesisSession({ ...input, displayName: '未知时辰动态合成', unknownTime: true, birthTime: undefined }).session.id;
      const unknownBase = getSynthesisDetail(unknownId, 'overview').facts;
      const unknown = buildDynamicSynthesisFacts(unknownBase, selection());
      equal(unknown.dynamic.bazi.luck.status, 'unavailable', '未知时辰不提供精确大运');
      equal(unknown.dynamic.bazi.luck.startAt, null, '未知时辰不补起运日期');
      check(unknown.dynamic.boundaries.some(v => /未知|缺.*时柱|试排/.test(v)), '两侧时辰不确定性保留');
      const conflictId = createSynthesisSession({ ...input, displayName: '太阳时节界冲突合成', birthDate: '2026-02-04', birthTime: '05:00', longitude: 75, timeStandard: 'apparent_solar_time' }).session.id;
      const conflictBase = getSynthesisDetail(conflictId, 'overview').facts;
      const conflict = buildDynamicSynthesisFacts(conflictBase, selection('2026-10-15T12:00:00'));
      equal(conflict.dynamic.bazi.luck.status, 'unavailable', '民用与太阳时跨立春冲突撤回精确大运');
      equal(conflict.dynamic.bazi.luck.cycle, null, '时间口径冲突不补当运');
      equal(conflict.bazi.chart.effectiveTime, conflictBase.bazi.chart.effectiveTime, '动态观察不再次校正太阳时出生时间');

      const dynamicFacts = buildDynamicSynthesisFacts(base, selection());
      const messages = buildSynthesisMessages(dynamicFacts), userFacts = JSON.parse(messages[1].content) as SynthesisFacts;
      equal(userFacts.dynamic?.key, dynamicFacts.dynamic.key, '动态提示词含完整当前阶段快照');
      check(messages[0].content.includes('动态') && !messages[0].content.includes('分析范围仅为本命原局'), '动态专属范围不被本命限制误封');
      equal(validateSynthesisContent(JSON.stringify(contentFor(dynamicFacts)), dynamicFacts).sections.length, 5, '动态五章与双体系引用合法');
      rejects(() => validateSynthesisContent(JSON.stringify(contentFor(dynamicFacts, true)), dynamicFacts), '只引用本命证据不能冒充动态结论');
      check(!JSON.parse(buildSynthesisMessages(base)[1].content).dynamic, '本命提示词不注入动态阶段');

      // 保存依据不调用模型；同阶段/同主题和本命报告的版本均隔离。
      const natal = await generateSynthesisReport(id, 'overview'), natalId = natal.activeVersionId;
      const natalJson = getDatabase().prepare('SELECT facts_json FROM synthesis_report_versions WHERE id = ?').get(natalId) as { facts_json: string };
      const callCount = calls, saved = saveDynamicSynthesisSnapshot(id, 'overview', selection());
      check(saved.savedSnapshotId && saved.activeVersionId === null, '单独保存依据无伪造AI报告');
      equal(calls, callCount, '本地保存不调用AI');
      equal(saveDynamicSynthesisSnapshot(id, 'overview', selection()).savedSnapshotId, saved.savedSnapshotId, '同事实保存幂等');
      equal(getDynamicSynthesisDetail(id, 'overview').facts.dynamic.key, saved.facts.dynamic.key, '无选择时回到最近已存阶段');
      const savedJson = (getDatabase().prepare('SELECT facts_json FROM synthesis_report_versions WHERE id = ?').get(saved.savedSnapshotId) as { facts_json: string }).facts_json;
      for (const topic of Object.keys(SYNTHESIS_TOPICS) as Array<keyof typeof SYNTHESIS_TOPICS>) {
        const result = await generateDynamicSynthesisReport(id, topic, selection());
        check(result.activeVersionId && result.versions.some(v => v.status === 'completed' && v.content), '五主题动态报告可独立生成');
        const previousCalls = calls; await generateDynamicSynthesisReport(id, topic, selection());
        equal(calls, previousCalls, '已完成同阶段报告回看不重调AI');
      }
      const first = getDynamicSynthesisDetail(id, 'overview', selection()), second = await generateDynamicSynthesisReport(id, 'overview', selection(), true);
      check(second.activeVersionId !== first.activeVersionId && second.versions.filter(v => v.content).length === 2, '重生成保留旧阶段报告');
      equal((getDatabase().prepare('SELECT facts_json FROM synthesis_report_versions WHERE id = ?').get(saved.savedSnapshotId) as { facts_json: string }).facts_json, savedJson, '新报告不改旧依据快照');
      const nextSelection = selection('2026-11-15T10:30:00');
      const next = saveDynamicSynthesisSnapshot(id, 'overview', nextSelection);
      equal(next.activeVersionId, null, '新阶段不回退旧阶段报告');
      check(next.versions.every(v => v.facts.dynamic?.key === next.facts.dynamic.key), '阶段版本列表只含选定阶段');
      check(getDynamicSynthesisDetail(id, 'career', selection()).versions.every(v => v.topic === 'career'), '动态主题列表不串');
      equal(getSynthesisDetail(id, 'overview').activeVersionId, natalId, '原本命报告仍独立选中');
      check(getSynthesisDetail(id, 'overview').versions.every(v => !v.facts.dynamic), '旧本命列表不含动态快照');
      equal((getDatabase().prepare('SELECT facts_json FROM synthesis_report_versions WHERE id = ?').get(natalId) as { facts_json: string }).facts_json, natalJson.facts_json, '动态生成不改旧本命快照');
      check(getDynamicSynthesisDetail(id, 'overview', selection()).history.some(h => h.key === next.facts.dynamic.key) && getDynamicSynthesisDetail(id, 'overview', selection()).history.some(h => h.topic === 'career'), '阶段历史保留不同阶段与主题');
      mode = 'error';
      await rejectsAsync(() => generateDynamicSynthesisReport(id, 'overview', selection(), true), '供应商错误安全脱敏', e => e instanceof Error && !e.message.includes('synthetic-dynamic-key'));
      equal(getDynamicSynthesisDetail(id, 'overview', selection()).activeVersionId, second.activeVersionId, '生成失败仍可读旧报告');
      check(getDynamicSynthesisDetail(id, 'overview', selection()).versions.some(v => v.status === 'failed'), '失败任务有状态可重试');
      mode = 'natal-only'; await rejectsAsync(() => generateDynamicSynthesisReport(id, 'overview', selection(), true), '供应商仅本命引用拒绝发布');
      mode = 'delay';
      const beforeConcurrent = calls, pending = generateDynamicSynthesisReport(id, 'overview', selection(), true);
      const concurrent = await generateDynamicSynthesisReport(id, 'overview', selection(), true);
      check(concurrent.versions.some(v => v.status === 'generating'), '同阶段并发复用生成占位');
      await rejectsAsync(() => generateDynamicSynthesisReport(id, 'overview', nextSelection, true), '同主题跨阶段并发409', e => typeof e === 'object' && e !== null && 'status' in e && e.status === 409);
      await pending; equal(calls, beforeConcurrent + 1, '并发仅一次供应商调用');
      const cancel = new AbortController(); cancel.abort();
      await rejectsAsync(() => generateDynamicSynthesisReport(id, 'overview', selection(), true, cancel.signal), '取消任务释放生成占位');
      check(!getDynamicSynthesisDetail(id, 'overview', selection()).versions.some(v => v.status === 'generating'), '取消后无永久占位');
      mode = 'normal';
      const claim = claimSynthesisVersion({ sessionId: id, facts: dynamicFacts, regenerate: true, provider: 'mock', model: 'mock', promptVersion: 'test-dynamic' });
      check(claim.requestId, '可以申请动态任务');
      getDatabase().prepare('UPDATE synthesis_report_versions SET updated_at = ? WHERE id = ?').run(Date.now() - SYNTHESIS_STALE_MS - 1, claim.version.id);
      check(listSynthesisVersions(id, 'overview', dynamicFacts.dynamic.key).find(v => v.id === claim.version.id)?.status === 'failed', '动态任务过期可恢复');
      const retry = claimSynthesisVersion({ sessionId: id, facts: dynamicFacts, regenerate: true, provider: 'mock', model: 'mock', promptVersion: 'test-dynamic' });
      check(!finishSynthesisVersion(claim.version.id, claim.requestId!, contentFor(dynamicFacts), 1, 1), '迟到旧任务不能发布');
      check(!finishSynthesisVersion(retry.version.id, 'wrong', contentFor(dynamicFacts), 1, 1), '错误任务凭证不能发布');
      check(finishSynthesisVersion(retry.version.id, retry.requestId!, contentFor(dynamicFacts), 1, 1) && !finishSynthesisVersion(retry.version.id, retry.requestId!, contentFor(dynamicFacts), 1, 1), '合法动态任务只发布一次');
      check(received.some(f => f.dynamic?.selection.level === 'month') && received.some(f => !f.dynamic), '模拟供应商分别收到动态和旧本命快照');
      const altered = structuredClone(dynamicFacts); altered.dynamic.selection.dateTime = '2026-10-15T10:30:01';
      check(fingerprintSynthesis(altered) !== fingerprintSynthesis(dynamicFacts), '观察秒属于快照指纹');

      const count = getDynamicSynthesisDetail(id, 'overview', selection()).versions.length, historyCount = getDynamicSynthesisDetail(id, 'overview', selection()).history.length;
      const archive = await createLocalBackupArchive();
      deleteSynthesisSession(id);
      await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      equal(getDynamicSynthesisDetail(id, 'overview', selection()).versions.length, count, '完整备份恢复动态版本');
      equal(getDynamicSynthesisDetail(id, 'overview', selection()).history.length, historyCount, '完整备份恢复阶段与主题历史');
      equal(getSynthesisDetail(id, 'overview').activeVersionId, natalId, '备份恢复后本命仍独立');
      check(getConversation(getSynthesisSession(id)!.conversationId) && getBaziChartVersion(getSynthesisSession(id)!.baziChartId), '恢复关联底盘完整');
      equal((getDatabase().pragma('foreign_key_check') as unknown[]).length, 0, '动态快照外键完整');
      closeDatabaseConnection();
      equal(getDynamicSynthesisDetail(id, 'overview', selection()).versions.length, count, '连接重开仍可回看');

      // 模拟方法升级前的真实保存记录：完整保留旧事实，只更换其独立方法版本和阶段键。
      legacyId = createSynthesisSession({ ...input, displayName: '旧动态方法合成快照' }).session.id;
      saveDynamicSynthesisSnapshot(legacyId, 'overview', selection());
      await generateDynamicSynthesisReport(legacyId, 'overview', selection());
      legacyKey = `older-dynamic-version:month:${selection().dateTime}`;
      const legacyRows = getDatabase().prepare('SELECT id, facts_json FROM synthesis_report_versions WHERE session_id = ?').all(legacyId) as Array<{ id: string; facts_json: string }>;
      const legacyStored = new Map<string, string>();
      for (const row of legacyRows) {
        const facts = JSON.parse(row.facts_json) as SynthesisDynamicFacts;
        facts.dynamic.version = 'older-dynamic-version'; facts.dynamic.key = legacyKey;
        facts.dynamic.label = '旧方法独有已存标签，不允许当前引擎重算';
        facts.dynamic.boundaries.push('合成旧口径保存标记');
        const raw = JSON.stringify(facts);
        getDatabase().prepare('UPDATE synthesis_report_versions SET facts_json = ?, facts_fingerprint = ? WHERE id = ?').run(raw, fingerprintSynthesis(facts), row.id);
        legacyStored.set(row.id, raw);
      }
      const oldDetail = getDynamicSynthesisDetail(legacyId, 'overview', selection(), legacyKey);
      equal(oldDetail.facts.dynamic.version, 'older-dynamic-version', '按已存key读取旧方法版本');
      equal(oldDetail.facts.dynamic.label, '旧方法独有已存标签，不允许当前引擎重算', '按已存key保留旧事实而不重算');
      check(oldDetail.activeVersionId && oldDetail.versions.every(v => v.facts.dynamic?.key === legacyKey), '旧阶段报告与事实一并回看');
      equal(getDynamicSynthesisDetail(legacyId, 'overview').facts.dynamic.key, legacyKey, '默认回看使用历史真实key而非当前版本重建key');
      check(getDynamicSynthesisDetail(legacyId, 'overview').facts.dynamic.boundaries.includes('合成旧口径保存标记'), '默认回看保留旧口径内容');
      const legacyCalls = calls;
      equal(saveDynamicSynthesisSnapshot(legacyId, 'overview', selection(), legacyKey).facts.dynamic.key, legacyKey, '旧阶段再次保存仍使用旧key');
      const cachedOld = await generateDynamicSynthesisReport(legacyId, 'overview', selection(), false, undefined, legacyKey);
      equal(cachedOld.activeVersionId, oldDetail.activeVersionId, '旧阶段报告缓存可复用');
      equal(calls, legacyCalls, '旧阶段保存和缓存回看不调用模型');
      const regeneratedOld = await generateDynamicSynthesisReport(legacyId, 'overview', selection(), true, undefined, legacyKey);
      equal(regeneratedOld.facts.dynamic.version, 'older-dynamic-version', '对旧依据重生成保留旧方法版本');
      equal(received.at(-1)?.dynamic?.key, legacyKey, '模拟供应商收到实际旧阶段事实');
      check(regeneratedOld.activeVersionId !== oldDetail.activeVersionId, '旧阶段重生成新增版本');
      for (const [versionId, raw] of legacyStored) equal((getDatabase().prepare('SELECT facts_json FROM synthesis_report_versions WHERE id = ?').get(versionId) as { facts_json: string }).facts_json, raw, '重生成不改已存旧事实原文');
      for (const operation of [() => getDynamicSynthesisDetail(legacyId, 'career', selection(), legacyKey), () => saveDynamicSynthesisSnapshot(legacyId, 'career', selection(), legacyKey), () => getDynamicSynthesisDetail(id, 'overview', selection(), legacyKey), () => getDynamicSynthesisDetail(legacyId, 'overview', selection(), 'unknown-key')]) rejects(operation, '旧key不跨主题或session读取且未知key拒绝');
      rejects(() => getDynamicSynthesisDetail(legacyId, 'overview', selection('2026-10-15T10:30:01'), legacyKey), '已存key与观察秒不一致拒绝');
      rejects(() => getDynamicSynthesisDetail(legacyId, 'overview', selection(undefined, 'year'), legacyKey), '已存key与观察层级不一致拒绝');
      await rejectsAsync(() => generateDynamicSynthesisReport(legacyId, 'career', selection(), false, undefined, legacyKey), '旧key不能向其他主题发布报告');
    });

    const { GET, POST } = await import('../app/api/synthesis/[id]/dynamic/route');
    const ctx = { params: Promise.resolve({ id }) };
    function request(token?: string, method = 'GET', body?: unknown, query = '', origin?: string) {
      return new Request(`http://local/api/synthesis/${id}/dynamic${query}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...(origin ? { origin } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    }
    const query = `?topic=overview&level=month&dateTime=${encodeURIComponent(selection().dateTime)}`;
    for (const [token, expected] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      for (const operation of ['read', 'save', 'generate'] as const) {
        const response = operation === 'read' ? await GET(request(token, 'GET', undefined, query), ctx) : await POST(request(token, 'POST', { topic: 'overview', selection: selection(), action: operation }), ctx);
        equal(response.status, expected, '匿名及跨账号动态读写隔离');
        check(/private/.test(response.headers.get('Cache-Control') ?? '') && /no-store/.test(response.headers.get('Cache-Control') ?? ''), '动态响应禁止共享缓存');
        await response.json();
      }
    }
    for (const q of ['?topic=wrong', '?topic=constructor', '?topic=overview&level=month', `?topic=overview&dateTime=${selection().dateTime}`, '?topic=overview&level=day&dateTime=2026-10-15T10:30:00', '?topic=overview&level=month&dateTime=2026-02-29T10:30:00']) { const r = await GET(request(tokenA, 'GET', undefined, q), ctx); equal(r.status, 400, '无效动态查询拒绝'); await r.json(); }
    for (const body of [null, [], {}, { topic: 'wrong', selection: selection(), action: 'save' }, { topic: 'overview', selection: selection(), action: 'wrong' }, { topic: 'overview', action: 'save' }, { topic: 'overview', selection: { level: 'day', dateTime: selection().dateTime }, action: 'save' }, { topic: 'overview', selection: selection(), action: 'generate', regenerate: 1 }]) { const r = await POST(request(tokenA, 'POST', body), ctx); equal(r.status, 400, '无效动态请求体拒绝'); await r.json(); }
    const malformed = new Request(`http://local/api/synthesis/${id}/dynamic`, { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${tokenA}`, 'Content-Type': 'application/json' }, body: '{' });
    const broken = await POST(malformed, ctx); equal(broken.status, 400, '损坏JSON安全拒绝'); await broken.json();
    const foreignOrigin = await middleware(new NextRequest(`http://local/api/synthesis/${id}/dynamic`, { method: 'POST', headers: { host: 'local', origin: 'https://foreign.example', cookie: `${SESSION_COOKIE}=${tokenA}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'overview', selection: selection(), action: 'save' }) }));
    equal(foreignOrigin.status, 403, '外站来源不能保存动态快照'); await foreignOrigin.json();
    const legacyContext = { params: Promise.resolve({ id: legacyId }) };
    const oldQuery = `${query}&stageKey=${encodeURIComponent(legacyKey)}`;
    const oldResponse = await GET(request(tokenA, 'GET', undefined, oldQuery), legacyContext);
    equal(oldResponse.status, 200, '旧阶段key的GET成功');
    equal((await oldResponse.json()).detail.facts.dynamic.version, 'older-dynamic-version', 'GET返回旧方法事实');
    const defaultOldResponse = await GET(request(tokenA, 'GET', undefined, '?topic=overview'), legacyContext);
    equal(defaultOldResponse.status, 200, '旧阶段默认GET成功');
    equal((await defaultOldResponse.json()).detail.facts.dynamic.key, legacyKey, '默认GET按history真实旧key回看');
    for (const action of ['save', 'generate']) {
      const r = await POST(request(tokenA, 'POST', { topic: 'overview', selection: selection(), stageKey: legacyKey, action }), legacyContext);
      equal(r.status, 200, '旧key的POST保存及报告回看成功');
      equal((await r.json()).detail.facts.dynamic.key, legacyKey, 'POST保持已存旧key');
    }
    for (const [key, topic, selected, status] of [['missing', 'overview', selection(), 404], [legacyKey, 'career', selection(), 404], [legacyKey, 'overview', selection('2026-10-15T10:30:01'), 400], [legacyKey, 'overview', selection(undefined, 'year'), 400], ['', 'overview', selection(), 400], ['a'.repeat(201), 'overview', selection(), 400]] as const) {
      const q = `?topic=${topic}&level=${selected.level}&dateTime=${encodeURIComponent(selected.dateTime)}&stageKey=${encodeURIComponent(key)}`;
      const readOld = await GET(request(tokenA, 'GET', undefined, q), legacyContext);
      equal(readOld.status, status, 'GET拒绝未知key、错主题、不一致条件和无效key长度'); await readOld.json();
      const postOld = await POST(request(tokenA, 'POST', { topic, selection: selected, stageKey: key, action: 'save' }), legacyContext);
      equal(postOld.status, status, 'POST拒绝未知key、错主题、不一致条件和无效key长度'); await postOld.json();
    }
    const numericKey = await POST(request(tokenA, 'POST', { topic: 'overview', selection: selection(), stageKey: 1, action: 'save' }), legacyContext);
    equal(numericKey.status, 400, '非字符串stageKey拒绝'); await numericKey.json();
    for (const token of [undefined, tokenB]) {
      const expected = token ? 404 : 401;
      const oldRead = await GET(request(token, 'GET', undefined, oldQuery), legacyContext);
      equal(oldRead.status, expected, '旧stageKey不能绕过账号读取隔离'); await oldRead.json();
      const oldSave = await POST(request(token, 'POST', { topic: 'overview', selection: selection(), stageKey: legacyKey, action: 'save' }), legacyContext);
      equal(oldSave.status, expected, '旧stageKey不能绕过账号保存隔离'); await oldSave.json();
    }
    await runAsUser(b, async () => {
      rejects(() => getDynamicSynthesisDetail(id, 'overview', selection()), '服务层其他账号无读取权限');
      rejects(() => saveDynamicSynthesisSnapshot(id, 'overview', selection()), '服务层其他账号无保存权限');
      await rejectsAsync(() => generateDynamicSynthesisReport(id, 'overview', selection()), '服务层其他账号无报告权限');
      equal((getDatabase().prepare('SELECT COUNT(*) AS n FROM synthesis_report_versions').get() as { n: number }).n, 0, '其他账号没有合参版本副本');
    });
    await runAsUser(a, async () => {
      for (const kind of ['ziwei', 'bazi', 'synthesis']) {
        const session = createSynthesisSession({ ...input, displayName: `动态级联清理${kind}` }).session;
        const saved = saveDynamicSynthesisSnapshot(session.id, 'overview', selection());
        if (kind === 'ziwei') deleteConversation(session.conversationId);
        else if (kind === 'bazi') deleteBaziChartVersion(session.baziChartId);
        else deleteSynthesisSession(session.id);
        check(!getDatabase().prepare('SELECT id FROM synthesis_report_versions WHERE id = ?').get(saved.savedSnapshotId), '删除底盘或合参级联清理动态记录');
        if (kind === 'synthesis') check(getConversation(session.conversationId) && getBaziChartVersion(session.baziChartId), '移除合参保留独立底盘');
      }
    });
    console.log(`动态紫微八字合参专项通过：${checks} 项；精确观察秒、双历法与节交边界、闰月真实观察、十神、八步交运、未知时辰与太阳时撤回、阶段/主题/本命隔离、并发过期与脱敏、备份级联和账号路由安全。`);
  } finally {
    runAsUser(a, closeDatabaseConnection); runAsUser(b, closeDatabaseConnection); closeAccountConnections();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('测试清理目标未留在临时目录内');
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
