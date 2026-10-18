import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Solar } from 'lunar-javascript';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { closeAccountConnections, createSession, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createBaziBirthProfile } from '../lib/db/bazi';
import { claimBaziReading, finishBaziReading, fingerprintBaziReading, listBaziReadings } from '../lib/db/bazi-readings';
import { calculateBazi } from '../lib/bazi/engine';
import { analyzeBaziInterpretation } from '../lib/bazi/interpretation-engine';
import { auditBaziPatternConditions } from '../lib/bazi/pattern-condition-engine';
import { buildBaziNatalEffectReview, reviewBaziNatalPeriod } from '../lib/bazi/natal-effect-engine';
import { analyzeBaziClimate, buildBaziReadingChatSnapshot, buildBaziReadingFacts } from '../lib/bazi/reading-engine';
import { buildBaziMonthCommandReview, describeBaziMonthCommandReview } from '../lib/bazi/month-command-engine';
import { BAZI_MONTH_COMMAND_POLICY, BAZI_MONTH_COMMAND_VERSION } from '../lib/bazi/month-command-types';
import { BAZI_INTAKE_READING_PROMPT_VERSION, BAZI_READING_PROMPT_VERSION, buildBaziReadingMessages, resolveBaziReadingPromptVersion, validateBaziReadingContent } from '../lib/bazi/reading-interpretation';
import { generateBaziReading, getBaziReadingDetail } from '../lib/bazi/reading-service';
import { BAZI_READING_SECTIONS, type BaziReadingContent, type BaziReadingFacts } from '../lib/bazi/reading-types';
import type { BaziCalculationResult, BaziElement } from '../lib/bazi/types';
import type { BaziStrengthCompositeResult } from '../lib/bazi/strength-composite-types';
import { GET as read, POST as generate } from '../app/api/bazi/charts/[id]/reading/route';

// 所有账号、命盘、报告及备份只在本次临时空间，模型请求只指向本机模拟服务。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-bazi-month-command-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'synthetic-bazi-month-command-key';
process.env.DEEPSEEK_MODEL = 'synthetic-bazi-month-command-model';
let checks = 0, calls = 0, mode: 'normal' | 'old-only' = 'normal';
function check(value: unknown, label: string): asserts value { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
async function rejectsAsync(work: () => Promise<unknown>, label: string) { await assert.rejects(work, label); checks++; }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function epoch(at: string) { return Date.parse(at.replace(' ', 'T') + 'Z'); }
function wall(at: number) { return new Date(at).toISOString().slice(0, 19).replace('T', ' '); }
function shift(at: string, seconds: number) { return wall(epoch(at) + seconds * 1000); }
function chartAt(at: string, unknownTime = false, timeZoneId = 'Etc/GMT-8') {
  return calculateBazi({ birthDate: at.slice(0, 10), birthTime: unknownTime ? undefined : at.slice(11), gender: 'female', timeZoneId, unknownTime });
}

// 逐行独立录入《三命通会》卷二“论人元司事”主段，不导入待测生产规则表。
// 艮土、坤土和已/巳土不擅自补成具体天干；墓库阳干也不替换成现代藏干表。
type SourceRow = { text: string; stem: string | null; element: BaziElement; days: number };
const sourceRows: Array<[string, SourceRow[]]> = [
  ['寅', [{ text: '艮土', stem: null, element: '土', days: 5 }, { text: '丙', stem: '丙', element: '火', days: 5 }, { text: '甲', stem: '甲', element: '木', days: 20 }]],
  ['卯', [{ text: '甲', stem: '甲', element: '木', days: 7 }, { text: '乙', stem: '乙', element: '木', days: 23 }]],
  ['辰', [{ text: '乙', stem: '乙', element: '木', days: 7 }, { text: '壬', stem: '壬', element: '水', days: 5 }, { text: '戊', stem: '戊', element: '土', days: 18 }]],
  ['巳', [{ text: '戊', stem: '戊', element: '土', days: 7 }, { text: '庚', stem: '庚', element: '金', days: 5 }, { text: '丙', stem: '丙', element: '火', days: 18 }]],
  ['午', [{ text: '丙', stem: '丙', element: '火', days: 7 }, { text: '丁', stem: '丁', element: '火', days: 23 }]],
  ['未', [{ text: '丁', stem: '丁', element: '火', days: 7 }, { text: '甲', stem: '甲', element: '木', days: 5 }, { text: '已/巳土', stem: null, element: '土', days: 18 }]],
  ['申', [{ text: '坤土', stem: null, element: '土', days: 5 }, { text: '壬', stem: '壬', element: '水', days: 5 }, { text: '庚', stem: '庚', element: '金', days: 20 }]],
  ['酉', [{ text: '庚', stem: '庚', element: '金', days: 7 }, { text: '辛', stem: '辛', element: '金', days: 23 }]],
  ['戌', [{ text: '辛', stem: '辛', element: '金', days: 7 }, { text: '丙', stem: '丙', element: '火', days: 5 }, { text: '戊', stem: '戊', element: '土', days: 18 }]],
  ['亥', [{ text: '戊', stem: '戊', element: '土', days: 5 }, { text: '甲', stem: '甲', element: '木', days: 5 }, { text: '壬', stem: '壬', element: '水', days: 20 }]],
  ['子', [{ text: '壬', stem: '壬', element: '水', days: 7 }, { text: '癸', stem: '癸', element: '水', days: 23 }]],
  ['丑', [{ text: '癸', stem: '癸', element: '水', days: 7 }, { text: '庚', stem: '庚', element: '金', days: 5 }, { text: '已/巳土', stem: null, element: '土', days: 18 }]],
];
const termNames = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒', '立春'];
const dayStems = [...'甲乙丙丁戊己庚辛壬癸'];
// 行为日主、列为被观察干；十神定表独立于生产判断函数。
const tenGods = [
  ['比肩','劫财','食神','伤官','偏财','正财','七杀','正官','偏印','正印'],
  ['劫财','比肩','伤官','食神','正财','偏财','正官','七杀','正印','偏印'],
  ['偏印','正印','比肩','劫财','食神','伤官','偏财','正财','七杀','正官'],
  ['正印','偏印','劫财','比肩','伤官','食神','正财','偏财','正官','七杀'],
  ['七杀','正官','偏印','正印','比肩','劫财','食神','伤官','偏财','正财'],
  ['正官','七杀','正印','偏印','劫财','比肩','伤官','食神','正财','偏财'],
  ['偏财','正财','七杀','正官','偏印','正印','比肩','劫财','食神','伤官'],
  ['正财','偏财','正官','七杀','正印','偏印','劫财','比肩','伤官','食神'],
  ['食神','伤官','偏财','正财','七杀','正官','偏印','正印','比肩','劫财'],
  ['伤官','食神','正财','偏财','正官','七杀','正印','偏印','劫财','比肩'],
];
function termAt(year: number, name: string) {
  const terms = (Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar() as unknown as { getJieQiTable(): Record<string, { toYmdHms(): string }> }).getJieQiTable();
  return terms[name].toYmdHms();
}
function yearMonths(year: number) {
  const starts = termNames.map((name, index) => termAt(index >= 11 ? year + 1 : year, name));
  return sourceRows.map(([branch, rows], index) => ({ branch, rows, start: starts[index], untilExclusive: starts[index + 1], startTerm: termNames[index], endTerm: termNames[index + 1] }));
}
function factsFor(chart: BaziCalculationResult) {
  const interpretation = analyzeBaziInterpretation(chart);
  const staticContext = { methodologyVersion: 'unit-static-context', engineVersion: 'unit-static-context', staticBaseline: interpretation.strength } as unknown as BaziStrengthCompositeResult;
  return buildBaziReadingFacts(chart, interpretation, auditBaziPatternConditions(chart, interpretation, staticContext), 'synthetic-month-command');
}
function contentFor(facts: BaziReadingFacts, oldOnly = false): BaziReadingContent {
  return { summary: '合成人元司事复核摘要，分别保留原书分日、工程时钟与原盘透藏及格局候选，不把位置或分段当作实际效力。', sections: (Object.keys(BAZI_READING_SECTIONS) as Array<keyof typeof BAZI_READING_SECTIONS>).map((key, index) => {
    const prefix = !oldOnly && facts.monthCommandReview && (key === 'strength' || key === 'pattern') ? `${key}:month-command:` : `${key}:`;
    const evidence = key === 'action' ? 'chart:policy' : facts.evidence.find(item => item.id.startsWith(prefix) && (!oldOnly || !item.id.includes(':month-command:')))!.id;
    const intake = !oldOnly && facts.monthCommandReview && facts.monthIntake && key === 'pattern' ? facts.evidence.find(item => item.id.startsWith('pattern:month-intake:'))?.id : undefined;
    return { key, content: `第${index + 1}节${key}合成解释，逐项区分保存的参考、原盘位置和未确定条件，不作最终效力与结果判断。`, evidenceIds: intake ? [evidence, intake] : [evidence] };
  }) };
}
const received: BaziReadingFacts[] = [];
const server = createServer(async (request, response) => {
  calls++; let raw = ''; for await (const chunk of request) raw += chunk;
  const messages = JSON.parse(raw).messages as Array<{ content: string }>;
  const facts = JSON.parse(messages.at(-1)!.content) as BaziReadingFacts; received.push(facts);
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(contentFor(facts, mode === 'old-only')) } }], usage: { prompt_tokens: 50, completion_tokens: 70 } }));
});
function request(id: string, token?: string, body?: unknown) {
  return new Request(`http://local/api/bazi/charts/${id}/reading`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function responseBody(response: Response, status: number, label: string) { equal(response.status, status, label); return response.json(); }

async function main() {
  const users: Awaited<ReturnType<typeof registerUser>>[] = [];
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('本机模拟端口不存在');
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  try {
    equal(BAZI_MONTH_COMMAND_POLICY, 'sanming-main-paragraph-30-fixed-days', '只用主段原文30日口径，不混玉井或其他分日歌');
    check(BAZI_READING_PROMPT_VERSION.startsWith('bazi-reading-report-v5-'), '新增能力有独立第五代报告策略');
    const months = yearMonths(2026), independentWindows = [...yearMonths(2025), ...months, ...yearMonths(2027)];
    let realCharts = 0, sawShort = false, sawLong = false;
    for (const month of months) {
      equal(month.rows.reduce((sum, row) => sum + row.days, 0), 30, '独立原典表每月30日');
      const seenDays = new Set<string>();
      for (let day = 12; day < 22; day++) {
        const chart = chartAt(shift(month.start, day * 86400)), before = JSON.stringify(chart);
        const period = reviewBaziNatalPeriod(chart), patterns = factsFor(chart).patterns;
        const originals = JSON.stringify({ period, patterns, climate: analyzeBaziClimate(chart) });
        const review = buildBaziMonthCommandReview(chart, patterns, period); realCharts++; seenDays.add(chart.dayMaster.stem);
        equal([review.version, review.policy, review.savedMonthBranch, review.status], [BAZI_MONTH_COMMAND_VERSION, BAZI_MONTH_COMMAND_POLICY, month.branch, 'resolved'], '120真实月支日主组合的分日能力与来源一致');
        equal(JSON.stringify(chart), before, '复核不改变排盘输入、四柱和藏干');
        equal(JSON.stringify({ period, patterns, climate: analyzeBaziClimate(chart) }), originals, '分日层不改写旧月内分支、格局候选或调候');
        equal(buildBaziMonthCommandReview(chart, patterns, period), review, '相同输入确定，不补当前时间');
        equal(review.months.map(item => [item.branch, item.startTerm, item.start, item.endTerm, item.untilExclusive, item.actualDurationSeconds]), [[month.branch, month.startTerm, month.start, month.endTerm, month.untilExclusive, (epoch(month.untilExclusive) - epoch(month.start)) / 1000]], '十二节真实起止独立核对，不用公历月或中气替代');
        equal(review.segments.length, month.rows.length, '主段全分段保留，不筛掉与当前藏干不同的原文项');
        let cumulative = 0;
        for (let index = 0; index < month.rows.length; index++) {
          const expected = month.rows[index], segment = review.segments[index], fromDay = cumulative, from = shift(month.start, cumulative * 86400); cumulative += expected.days;
          const until = shift(month.start, cumulative * 86400) < month.untilExclusive ? shift(month.start, cumulative * 86400) : month.untilExclusive;
          equal([segment.monthBranch, segment.order, segment.stem, segment.element, segment.sourceDays, segment.from, segment.untilExclusive], [month.branch, index + 1, expected.stem, expected.element, expected.days, from, until], '各段天数次序、原文对象和86400秒工程边界独立核对');
          equal([segment.fromDay, segment.untilDay], [fromDay, cumulative], '原文日数累计使用0基半开区间，与短月截断分别保存');
          check(expected.text === '已/巳土' ? /[已巳]土/.test(segment.sourceText) && !segment.sourceText.includes('己土') : segment.sourceText.includes(expected.text), '原文艮坤与异文土不强行改成现代藏干');
          equal(segment.stemStatus, expected.stem ? 'explicit' : 'text_ambiguous', '只有原文明示准确天干才开放干级链接');
          const pillars = Object.values(chart.pillars).filter(pillar => pillar !== null);
          equal(segment.tenGod, expected.stem ? tenGods[dayStems.indexOf(chart.dayMaster.stem)][dayStems.indexOf(expected.stem)] : null, '独立十神矩阵核对原文明干，含混土不冒认比财官印食');
          equal(segment.dayMasterSameStem, expected.stem === chart.dayMaster.stem, '日主同干单列，不能重复当透出');
          equal(segment.surface, expected.stem ? pillars.filter(pillar => pillar.key !== 'day' && pillar.stem === expected.stem).map(pillar => `${pillar.label}${expected.stem}`) : [], '透出只匹配原盘其他表干，日主不自充');
          equal(segment.exactRoots, expected.stem ? pillars.flatMap(pillar => pillar.hiddenStems.filter(hidden => hidden.stem === expected.stem).map(() => `${pillar.label}${pillar.branch}藏${expected.stem}`)) : [], '严格根只来自实际同干藏根，书表不注入原局');
          equal(segment.sameElementRoots, expected.stem ? pillars.flatMap(pillar => pillar.hiddenStems.filter(hidden => hidden.element === expected.element && hidden.stem !== expected.stem).map(hidden => `${pillar.label}${pillar.branch}藏${hidden.stem}`)) : [], '同五行异干根独立列出，含混土不冒用干级支持');
          equal(segment.monthHiddenMatch, Boolean(expected.stem && chart.pillars.month.hiddenStems.some(hidden => hidden.stem === expected.stem)), '分日干与本月现有藏干可以不相同');
          equal(segment.patternCandidates.map(item => item.id), expected.stem ? patterns.candidates.filter(candidate => candidate.sourceStem === expected.stem).map(candidate => candidate.id) : [], '格局只链接现有同来源干候选，不新取格或补造候选');
        }
        const active = review.segments.filter(segment => segment.from <= review.observation!.from && review.observation!.from < segment.untilExclusive);
        equal(review.candidateSegmentIds, active.map(segment => segment.id), '精确观察秒按半开交集命中唯一候选');
        equal(review.activeSegmentId, active[0].id, '准确定位不依表项顺序随意选首项');
        equal(review.comparisons.monthHiddenStems, chart.pillars.month.hiddenStems, '比较列原样保留现有藏干，不按司事表改写');
        equal(review.comparisons.climatePeriod.status, period.status, '本月原调候分支状态原样保留');
        check(review.sources.length > 0 && review.boundaries.length > 0 && describeBaziMonthCommandReview(review).includes(review.policyLabel), '来源、工程口径与边界进入同源描述');
      }
      equal([...seenDays].sort(), [...dayStems].sort(), '每一节月实际出生日期均覆盖十个日主，不用替换日干夹具冒充');
      const duration = (epoch(month.untilExclusive) - epoch(month.start)) / 1000;
      const end30 = shift(month.start, 30 * 86400);
      sawShort ||= duration < 30 * 86400; sawLong ||= duration > 30 * 86400;
      let cumulative = 0;
      for (const row of month.rows) {
        const boundary = shift(month.start, cumulative * 86400); cumulative += row.days;
        for (const delta of [-1, 0, 1]) {
          const at = shift(boundary, delta), chart = chartAt(at), review = buildBaziMonthCommandReview(chart);
          const active = review.segments.find(segment => segment.from <= at && at < segment.untilExclusive);
          const actualWindow = independentWindows.find(item => item.start <= at && at < item.untilExclusive)!;
          const outsideSource = epoch(at) - epoch(actualWindow.start) >= 30 * 86400 * 1000;
          check(outsideSource ? !active && review.activeSegmentId === null && review.status === 'uncovered_tail' : active && review.activeSegmentId === active.id && review.status === 'resolved', '每段开始前当后秒按原表覆盖，交节前长月尾段仍未覆盖');
        }
        const unknown = buildBaziMonthCommandReview(chartAt(boundary, true));
        equal(unknown.observation, { from: boundary.slice(0, 10) + ' 00:00:00', untilExclusive: shift(boundary.slice(0, 10) + ' 00:00:00', 86400), precision: 'day', timeZone: 'UTC+08:00' }, '未知时辰按整个出生日期区间，不用中午试排选段');
        const overlapping = unknown.segments.filter(segment => segment.from < unknown.observation!.untilExclusive && segment.untilExclusive > unknown.observation!.from);
        equal(unknown.candidateSegmentIds, overlapping.map(segment => segment.id), '整日候选按真实半开区间交集保留');
        check(unknown.activeSegmentId === null && unknown.status === 'uncertain_time', '真实非午夜分界日不能用试排定单段');
        check(unknown.segments.every(segment => segment.tenGod === null), '未知时辰不把保存试排日主的十神关系当成全日固定');
      }
      for (const delta of [-1, 0, 1]) {
        const at = shift(month.untilExclusive, delta), review = buildBaziMonthCommandReview(chartAt(at));
        if (delta < 0 && duration > 30 * 86400) check(review.status === 'uncovered_tail' && review.activeSegmentId === null && review.candidateSegmentIds.length === 0, '长节月末秒位于原表未覆盖尾段，不能延长末干');
        else check(review.status === 'resolved' && review.activeSegmentId !== null, '短月末秒截断，下一节秒准确开启新月');
      }
      if (duration > 30 * 86400) {
        for (const delta of [-1, 0, 1]) {
          const review = buildBaziMonthCommandReview(chartAt(shift(end30, delta)));
          equal(review.status, delta < 0 ? 'resolved' : 'uncovered_tail', '超过30日表立即未覆盖，不比例伸缩或延长');
          check(review.months[0].uncoveredTail?.from === end30 && review.months[0].uncoveredTail.untilExclusive === month.untilExclusive, '未覆盖尾段明确给出真实起止');
        }
        const unknown = buildBaziMonthCommandReview(chartAt(end30, true));
        check(unknown.status === 'uncertain_time' && !unknown.activeSegmentId && unknown.months.some(item => item.uncoveredTail?.overlapsObservation), '未知整日跨入未覆盖尾段不能选末段');
        const lastWholeDay = month.untilExclusive.slice(0, 10) + ' 00:00:00';
        if (lastWholeDay > end30) {
          const whollyTail = buildBaziMonthCommandReview(chartAt(shift(lastWholeDay, -86400), true));
          if (whollyTail.observation!.from >= end30) equal(whollyTail.status, 'uncovered_tail', '整日均在表外时明确未覆盖');
        }
      }
    }
    equal(realCharts, 120, '十二节月×十日主均为真实历法计算');
    check(sawShort && sawLong, '真实年度同时覆盖不足与超过30日的节月');
    for (const [branch, stem] of [['辰','壬'], ['未','甲'], ['戌','丙'], ['丑','庚']]) {
      const month = months.find(item => item.branch === branch)!, chart = chartAt(shift(month.start, 8 * 86400)), before = JSON.stringify(chart);
      const review = buildBaziMonthCommandReview(chart), entry = review.segments.find(segment => segment.stem === stem)!;
      check(entry && !entry.monthHiddenMatch && !entry.exactRoots.some(root => root.startsWith('月柱')), '原书阳墓干不改成当前月支阴藏干，也不能凭分日注入月根');
      equal(JSON.stringify(chart), before, '差异原典表不污染当前四柱藏干');
    }
    for (const [stem, branch] of [['乙','午'], ['壬','丑'], ['癸','未']]) {
      const month = months.find(item => item.branch === branch)!, chart = chartAt(shift(month.start, 15 * 86400));
      // 这里只构造特定《穷通宝鉴》组合入口，不计入120真实月支日主矩阵。
      chart.dayMaster = { stem, element: stem === '乙' ? '木' : '水' };
      chart.pillars.day.stem = stem; chart.pillars.day.stemElement = chart.dayMaster.element;
      const period = reviewBaziNatalPeriod(chart), before = JSON.stringify(period);
      const review = buildBaziMonthCommandReview(chart, undefined, period);
      equal(period.status, 'source_ambiguous', '原含混半月入口仍保持待核');
      equal([JSON.stringify(period), review.comparisons.climatePeriod.status, review.comparisons.climatePeriod.activeStems], [before, 'source_ambiguous', []], '其他书分日表不能替原调候条文定上下半月');
    }
    for (const [at, zone] of [['1988-07-01 12:00:00','Asia/Shanghai'], ['1988-09-20 12:00:00','Asia/Shanghai'], ['1900-02-20 12:00:00','Asia/Shanghai'], ['2026-02-20 12:00:00','America/New_York']]) {
      const review = buildBaziMonthCommandReview(chartAt(at, false, zone));
      equal([review.status, review.activeSegmentId, review.candidateSegmentIds], ['unsupported_clock', null, []], '历史DST、节月端点DST、历史时差及其他区均不混北京墙钟');
    }
    const supported = chartAt('2026-02-20 12:00:00', false, 'Asia/Shanghai');
    equal(buildBaziMonthCommandReview(supported).status, 'resolved', '现代上海与固定东八区均支持');
    const apparent = copy(supported); apparent.input.timeStandard = 'apparent_solar_time'; apparent.effectiveTime.standard = 'apparent_solar_time';
    equal(buildBaziMonthCommandReview(apparent).status, 'unsupported_clock', '太阳时不与民用节月直接比较');
    const inconsistent = copy(supported); inconsistent.pillars.month.branch = '酉';
    equal(buildBaziMonthCommandReview(inconsistent).status, 'inconsistent_chart', '保存月支与真实观察时间不符时撤回定位，不重排原盘');
    const unknownChart = chartAt('2026-02-20 12:00:00', true), unknownChartBefore = JSON.stringify(unknownChart);
    const unknownStable = buildBaziMonthCommandReview(unknownChart);
    check(unknownStable.status === 'resolved' && unknownStable.observation?.precision === 'day' && unknownStable.segments.every(segment => segment.tenGod === null), '缺时整日稳定可定位司事段，仍不裁固定十神');
    equal(unknownStable.comparisons.monthHiddenStems.map(item => [item.stem, item.element]), unknownChart.pillars.month.hiddenStems.map(item => [item.stem, item.element]), '缺时新层仍保留原月藏字和五行');
    check(unknownStable.comparisons.monthHiddenStems.every(item => item.tenGod === null), '缺时新层月藏十神也撤回，不把试排角色当作全日唯一');
    equal(JSON.stringify(unknownChart), unknownChartBefore, '撤回新层十神不改写原盘保存的试排藏干与角色');
    const lateA = chartAt('2026-02-20 23:30:00');
    const lateB = calculateBazi({ birthDate: '2026-02-20', birthTime: '23:30:00', gender: 'female', timeZoneId: 'Etc/GMT-8', lateZiPolicy: 'same_day' });
    equal(buildBaziMonthCommandReview(lateA).months, buildBaziMonthCommandReview(lateB).months, '晚子换日口径不移动节月或司令边界');

    const userA = await registerUser({ username: `mc-a-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '分日合成甲' }); users.push(userA);
    const userB = await registerUser({ username: `mc-b-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '分日合成乙' }); users.push(userB);
    const tokenA = createSession(userA.id), tokenB = createSession(userB.id); let chartId = '';
    await runAsUser(userA, async () => {
      const profile = createBaziBirthProfile({ displayName: '人元司事合成资料', birthDate: '2026-02-20', birthTime: '12:00', gender: 'female', timeZoneId: 'Etc/GMT-8', initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'next_day' } });
      chartId = profile.charts[0].id;
      const facts = getBaziReadingDetail(chartId).facts, snapshot = JSON.stringify(facts);
      equal(facts.monthCommandReview!.version, BAZI_MONTH_COMMAND_VERSION, '新层进入完整服务端事实');
      equal(calls, 0, '保存命盘与读取新层不调用模型');
      equal(new Set(facts.evidence.map(item => item.id)).size, facts.evidence.length, '新增与原依据ID无冲突');
      check(facts.evidence.some(item => item.id.startsWith('strength:month-command:')) && facts.evidence.some(item => item.id.startsWith('pattern:month-command:')), '旺衰和格局分别有可引用新证据');
      equal(resolveBaziReadingPromptVersion(facts), BAZI_INTAKE_READING_PROMPT_VERSION, '已支持入口层时选用当前最高代能力，司令依据仍完整保留');
      equal(JSON.parse(buildBaziReadingMessages(facts)[1].content).monthCommandReview, facts.monthCommandReview, '报告输入只取保存的同版复核');
      const valid = contentFor(facts);
      equal(validateBaziReadingContent(JSON.stringify(valid), facts).sections.length, 5, '五章合法内容同时满足两个新引用门槛');
      for (const text of ['司令分日已定位，因此**最终身强**。', '人元司令已定位。由此**最终用神**是火。', '司令复核把`艮土`改为`戊土`。', '司令分日把30日后自动归入末段。']) rejects(() => validateBaziReadingContent(JSON.stringify({ ...valid, summary: text }), facts), 'Markdown格式不能绕过司令越权结论门控');
      for (const text of ['司令定位不代表**最终身强**，全局承载仍待核。', '人元司令不能把`艮土`改为`戊土`。', '司令定位不等于已经成格，格局条件仍待核。']) { validateBaziReadingContent(JSON.stringify({ ...valid, summary: text }), facts); checks++; }
      rejects(() => validateBaziReadingContent(JSON.stringify(contentFor(facts, true)), facts), '新层回复不能只引旧层');
      for (const section of ['strength', 'pattern']) {
        const invalid = copy(valid); invalid.sections.find(item => item.key === section)!.evidenceIds = [facts.evidence.find(item => item.id.startsWith(section + ':') && !item.id.includes(':month-command:'))!.id];
        rejects(() => validateBaziReadingContent(JSON.stringify(invalid), facts), '两章新依据门槛分别校验，不以一章代另一章');
      }
      for (const field of ['version', 'policy'] as const) {
        const unknown = copy(facts); unknown.monthCommandReview![field] = 'future-unsupported'; const raw = JSON.stringify(unknown);
        equal(resolveBaziReadingPromptVersion(unknown), 'bazi-reading-report-v4-method-premises', '未知版本或政策只降至原有分方法能力');
        const sent = JSON.parse(buildBaziReadingMessages(unknown)[1].content) as BaziReadingFacts;
        check(!sent.monthCommandReview && sent.evidence.every(item => !item.id.includes(':month-command:')), '未知新层及其证据同步从模型载荷撤回');
        rejects(() => validateBaziReadingContent(JSON.stringify(valid), unknown), '未知层不能借已撤回新依据通过');
        validateBaziReadingContent(JSON.stringify(contentFor(sent)), unknown); checks++;
        equal(JSON.stringify(unknown), raw, '消息过滤与校验不修改保存原文');
      }
      check(buildBaziReadingChatSnapshot(facts.chart, '请核对人元司令与月令分日', { interpretation: facts.interpretation, patterns: facts.patterns }).includes(describeBaziMonthCommandReview(facts.monthCommandReview!)), '当前原局问题问答复用同源司事描述');
      check(!buildBaziReadingChatSnapshot(facts.chart, '解释2026年的流月十神', { interpretation: facts.interpretation, patterns: facts.patterns }).includes(describeBaziMonthCommandReview(facts.monthCommandReview!)), '纯岁运问题不强塞本命司事层');
      equal(fingerprintBaziReading(facts), fingerprintBaziReading(getBaziReadingDetail(chartId).facts), '反复预览不引入当前时间与随机指纹');
      equal(JSON.stringify(facts), snapshot, '所有生成前校验不改变事实原文');
      const generated = await generateBaziReading(chartId), current = generated.versions[0];
      equal(current.status, 'completed', '新层报告完成并固定保存');
      equal((getDatabase().prepare('SELECT prompt_version FROM bazi_reading_versions WHERE id=?').get(current.id) as { prompt_version: string }).prompt_version, BAZI_INTAKE_READING_PROMPT_VERSION, '新版本记录真实最高代提示策略，司令层仍由第五代起继承');
      const once = calls; await generateBaziReading(chartId); equal(calls, once, '新层仍保持报告缓存幂等');
      mode = 'old-only'; await rejectsAsync(() => generateBaziReading(chartId, true), '供应商漏新引用时完整服务链拒绝发布');
      equal(getBaziReadingDetail(chartId).versions[0].status, 'failed', '错误引用不发布正文，原完成版本保留');
      mode = 'normal'; await generateBaziReading(chartId, true);

      const oldSnapshots = new Map<string, string>();
      const methodology = ['bazi-reading-v1-seasonal-cross-method', 'bazi-reading-v2-monthly-conditional-review', 'bazi-reading-v3-natal-period-contact-review', 'bazi-reading-v4-method-premise-review'];
      const prompts = ['bazi-reading-report-v1', 'bazi-reading-report-v2-monthly-conditions', 'bazi-reading-report-v3-natal-period-contact', 'bazi-reading-report-v4-method-premises'];
      for (let generation = 1; generation <= 4; generation++) {
        // 显式历史夹具只移除后来层，绝不把当前事实伪装成旧报告。
        const old = copy(facts); old.methodologyVersion = methodology[generation - 1]; delete old.monthCommandReview; delete old.monthIntake;
        old.evidence = old.evidence.filter(item => !item.id.includes(':month-command:') && !item.id.includes(':month-intake:'));
        if (generation < 4) { delete old.methodReview; old.evidence = old.evidence.filter(item => !item.id.includes(':method-') && !item.id.startsWith('pattern:method:')); }
        if (generation < 3) { delete old.natalReview; old.evidence = old.evidence.filter(item => !item.id.includes(':natal-')); }
        if (generation < 2) { delete old.fineReview; old.climate.reference = undefined; old.evidence = old.evidence.filter(item => !item.id.startsWith('climate:check:') && !item.id.startsWith('pattern:special:')); }
        equal(resolveBaziReadingPromptVersion(old), prompts[generation - 1], '四代历史按实际保存能力选原提示');
        const messages = JSON.parse(buildBaziReadingMessages(old)[1].content) as BaziReadingFacts;
        check(!messages.monthCommandReview && !messages.monthIntake && messages.evidence.every(item => !item.id.includes(':month-command:') && !item.id.includes(':month-intake:')), '四代旧消息不补入新司事层或入口层');
        validateBaziReadingContent(JSON.stringify(contentFor(old)), old); checks++;
        const claimed = claimBaziReading({ chartId, facts: old, regenerate: true, provider: 'synthetic-local', model: '历史格式合成', promptVersion: prompts[generation - 1] });
        check(claimed.requestId && finishBaziReading(claimed.version.id, claimed.requestId, contentFor(old), 0, 0), '旧格式报告可完整保存回看');
        oldSnapshots.set(claimed.version.id, JSON.stringify(listBaziReadings(chartId).find(item => item.id === claimed.version.id)));
      }
      getBaziReadingDetail(chartId);
      for (const [id, original] of oldSnapshots) equal(JSON.stringify(listBaziReadings(chartId).find(item => item.id === id)), original, '当前预览不补写四代历史快照原文');
      const beforeBackup = JSON.stringify(listBaziReadings(chartId));
      const archive = await createLocalBackupArchive(); getDatabase().prepare('DELETE FROM bazi_reading_versions WHERE chart_version_id=?').run(chartId);
      await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      equal(JSON.stringify(listBaziReadings(chartId)), beforeBackup, '新旧五代报告与原JSON经备份还原不升级');
      closeDatabaseConnection(); equal(JSON.stringify(listBaziReadings(chartId)), beforeBackup, '重开连接保持所有报告事实与正文');
      equal(getDatabase().pragma('foreign_key_check'), [], '多代恢复外键完整');
    });
    const context = { params: Promise.resolve({ id: chartId }) };
    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await read(request(chartId, token), context);
      check(/no-store/.test(response.headers.get('cache-control') ?? ''), '新层读取和拒绝响应禁止共享缓存');
      const body = await responseBody(response, status, '新旧报告遵守当前账号隔离');
      if (status !== 200) check(!JSON.stringify(body).includes(BAZI_MONTH_COMMAND_VERSION), '拒绝响应不泄漏司事快照');
    }
    await responseBody(await generate(request(chartId, tokenB, { regenerate: true }), context), 404, '另一账号不能生成本命报告');
    const forged = await responseBody(await generate(request(chartId, tokenA, { regenerate: true, userId: userB.id, facts: { monthCommandReview: { version: 'FORGED', policy: 'FORGED' } } }), context), 200, '客户端事实不能覆盖服务器生成');
    check(forged.detail.facts.monthCommandReview.version === BAZI_MONTH_COMMAND_VERSION && !JSON.stringify(forged).includes('FORGED'), '报告只从当前账号保存命盘计算，伪造层不进入快照');
    const foreign = await middleware(new NextRequest(`http://127.0.0.1:30001/api/bazi/charts/${chartId}/reading`, { method: 'POST', headers: { host: '127.0.0.1:30001', origin: 'http://untrusted.invalid', 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, body: JSON.stringify({ regenerate: true }) }));
    equal(foreign.status, 403, '异源新层写入在中间件拒绝'); await foreign.json();
    equal(received.length, calls, '本机模拟请求计数与实际接收一致，不计入静态历史fixture');
    console.log(`八字人元司事与月令分日专项通过：${checks}项；120真实月支日主、原典十二支分段、独立十神矩阵、逐秒及整日边界、短月截断长月未覆盖、异文土与实际透藏、旧调候边界、时区降级、六代报告引用保存与备份、账号同源防伪；本机模拟供应商${calls}次，真实供应商0次。`);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const user of users) runAsUser(user, closeDatabaseConnection);
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-bazi-month-command-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
