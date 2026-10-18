import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { calculateQimen, buildQimenBoard, normalizeQimenInput } from '../lib/qimen/engine';
import { elementRelation, monthState, starMonthState, resolveQimenStem, analyzeQimenReading, readingEvidence } from '../lib/qimen/reading-engine';
import { QIMEN_READING_VERSION, QIMEN_FOCUS_TARGETS, type QimenElementRelation } from '../lib/qimen/reading-types';
import { QIMEN_VERSION, type Element, type QimenInput, type QimenResult } from '../lib/qimen/types';
import { createQimenSession, getQimenSession, deleteQimenSession, claimQimenTurn, finishQimenTurn } from '../lib/db/qimen';
import { buildQimenMessages, validateQimenReply } from '../lib/qimen/chat';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { GET as read, DELETE as remove } from '../app/api/qimen/[id]/route';
import { POST as preview } from '../app/api/qimen/preview/route';
import { POST as create } from '../app/api/qimen/route';

// 账号、盘面和备份全部使用独立临时目录；专项不请求任何模型供应商。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-qimen-reading-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.DEEPSEEK_API_KEY = '';
process.env.OPENAI_API_KEY = '';
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
const elements: Element[] = ['木', '火', '土', '金', '水'];
const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const hiddenInstruments = ['戊', '己', '庚', '辛', '壬', '癸'];
const ganzhi = Array.from({ length: 60 }, (_, n) => stems[n % 10] + branches[n % 12]);
// 下列关系、五行、刑墓和宫位表独立列值，不导入待测引擎的规则表。
const relationTable: readonly (readonly QimenElementRelation[])[] = [
  ['same', 'generates', 'controls', 'controlled_by', 'generated_by'],
  ['generated_by', 'same', 'generates', 'controls', 'controlled_by'],
  ['controlled_by', 'generated_by', 'same', 'generates', 'controls'],
  ['controls', 'controlled_by', 'generated_by', 'same', 'generates'],
  ['generates', 'controls', 'controlled_by', 'generated_by', 'same'],
];
const monthElements: Record<string, Element> = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const palaceElements: Record<number, Element> = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
const palaceBranches: Record<number, string[]> = { 1: ['子'], 2: ['未', '申'], 3: ['卯'], 4: ['辰', '巳'], 5: [], 6: ['戌', '亥'], 7: ['酉'], 8: ['丑', '寅'], 9: ['午'] };
const doorElements: Record<string, Element> = { 休门: '水', 生门: '土', 死门: '土', 伤门: '木', 杜门: '木', 景门: '火', 惊门: '金', 开门: '金' };
const starElements: Record<string, Element> = { 天蓬: '水', 天芮: '土', 天禽: '土', 天任: '土', 天冲: '木', 天辅: '木', 天心: '金', 天柱: '金', 天英: '火' };
const punishmentPalaces: Record<string, number> = { 戊: 3, 己: 2, 庚: 8, 辛: 9, 壬: 4, 癸: 4 };
const tombPalaces: Record<string, number> = { 乙: 2, 丙: 6, 丁: 8 };
const combinations = ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'];
const knownPatterns: Record<string, string> = { 乙辛: '龙逃走', 辛乙: '虎猖狂', 癸丁: '蛇', 丁癸: '雀投江' };
const opposites: Record<number, number> = { 1: 9, 2: 8, 3: 7, 4: 6, 6: 4, 7: 3, 8: 2, 9: 1 };
const ordinaryStates: Record<QimenElementRelation, string> = { same: '旺', generates: '休', generated_by: '相', controls: '囚', controlled_by: '死' };
const starStates: Record<QimenElementRelation, string> = { same: '相', generates: '旺', generated_by: '死', controls: '废', controlled_by: '囚' };
const baseInput: QimenInput = { method: 'chaibu', dateTime: '2026-10-15T12:00:00', lateZiPolicy: 'midnight' };
function expectedRelation(a: Element, b: Element) { return relationTable[elements.indexOf(a)][elements.indexOf(b)]; }
function expectedStem(gz: string) { const i = ganzhi.indexOf(gz); return { stem: gz[0], matchedStem: gz[0] === '甲' ? hiddenInstruments[Math.floor(i / 10)] : gz[0], hiddenJia: gz[0] === '甲', xun: ganzhi[Math.floor(i / 10) * 10] }; }
function request(token?: string, method = 'GET', body?: unknown) {
  return new Request('http://local/api/qimen', { method, headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function main() {
  const users: Awaited<ReturnType<typeof registerUser>>[] = [];
  try {
    for (const [i, source] of elements.entries()) for (const [j, target] of elements.entries()) {
      equal(elementRelation(source, target), relationTable[i][j], `${source}对${target}五行方向`);
      equal(monthState(source, target), ordinaryStates[relationTable[i][j]], `${source}在${target}月的普通旺相休囚死`);
      equal(starMonthState(source, target), starStates[relationTable[i][j]], `${source}星在${target}月的独立九星口诀`);
    }
    check(monthState('水', '木') !== starMonthState('水', '木'), '普通月令与九星旺相口诀不能共用标签');
    for (const invalid of ['不存在', 'constructor', 'toString', '__proto__']) {
      rejects(() => elementRelation(invalid as Element, '木'), '五行来源拒绝非法或继承属性名');
      rejects(() => elementRelation('木', invalid as Element), '五行目标拒绝非法或继承属性名');
      rejects(() => monthState('木', invalid as Element), '普通月令拒绝非法五行');
      rejects(() => starMonthState('木', invalid as Element), '九星月令拒绝非法五行');
    }
    for (const gz of ganzhi) equal(resolveQimenStem(gz), expectedStem(gz), `六十干支${gz}独立旬首遁仪表`);
    for (const gz of ['', '甲丑', '乙子', '甲', '甲子子', 'constructor', 'toString', '__proto__']) rejects(() => resolveQimenStem(gz), '非法或继承属性名不能定位干支');

    const base = calculateQimen(baseInput);
    check(base.reading?.version === QIMEN_READING_VERSION && base.version === QIMEN_VERSION, '新盘增加独立复核版本且保留基盘版本');
    equal(base.reading!.focus.status, 'unselected', '未指定目标不猜占问对象');
    equal(base.reading!.timing.status, 'needs_focus', '未指定目标不生成应期条件');
    const structuresSeen = new Set<string>();
    let sawCenter = false, sawPunishment = false, sawTomb = false, sawPattern = false, sawLayerDifference = false;
    for (const dun of ['yang', 'yin'] as const) for (let number = 1; number <= 9; number++) for (let n = 0; n < 60; n++) {
      const hour = ganzhi[n], day = ganzhi[(n + 20) % 60], monthBranch = branches[n % 12];
      // 单独替换基盘与干支以覆盖规则，不把这些合成日期当作实际历法盘例。
      const result: QimenResult = { ...copy(base), ...buildQimenBoard(dun, number, hour), calendar: { ...base.calendar, day, hour, month: `甲${monthBranch}` }, input: { ...baseInput, focusTarget: 'day_hour' }, ju: { ...base.ju, dun, number } };
      const before = JSON.stringify(result), reading = analyzeQimenReading(result);
      equal(JSON.stringify(result), before, '复核不会篡改已提供基盘或输入');
      equal(reading.palaces.map(p => p.number), [1, 2, 3, 4, 5, 6, 7, 8, 9], '十八局六十时复核九宫无缺漏');
      equal([reading.month.branch, reading.month.element], [monthBranch, monthElements[monthBranch]], '月五行取已保存月柱实际支');
      const outer = result.palaces.filter(p => p.number !== 5);
      const expectedStructures = { starFuyin: outer.every(p => p.starSource === p.number), doorFuyin: outer.every(p => p.doorSource === p.number), starFanyin: outer.every(p => p.starSource === opposites[p.number]), doorFanyin: outer.every(p => p.doorSource === opposites[p.number]) };
      for (const key of Object.keys(expectedStructures) as Array<keyof typeof expectedStructures>) {
        equal(reading.structures[key], expectedStructures[key], `${key}只对照该层来源宫`);
        if (expectedStructures[key]) structuresSeen.add(key);
      }
      if (expectedStructures.starFuyin !== expectedStructures.doorFuyin || expectedStructures.starFanyin !== expectedStructures.doorFanyin) sawLayerDifference = true;
      for (const review of reading.palaces) {
        const p = result.palaces[review.number - 1];
        equal(review.element, palaceElements[p.number], '宫五行来自方位本宫');
        equal(review.monthState, ordinaryStates[expectedRelation(palaceElements[p.number], monthElements[monthBranch])], '宫月令使用普通五行状态');
        equal(review.branches, palaceBranches[p.number], '地支映射九宫且中央不造地支');
        equal(review.emptyBranches, p.emptyBranches, '时旬空继承当前基盘不重算为日空');
        equal(review.center, p.number === 5, '中心标志与盘面一致');
        equal(review.earthStems, [
          { stem: p.earthStem, origin: p.number, hosted: false },
          ...(p.number === 2 ? [{ stem: result.palaces[4].earthStem, origin: 5, hosted: true }] : []),
        ], '有效地盘干保留原宫及中五寄坤来源');
        if (p.number === 5) {
          check(review.door === null && review.stars.length === 0 && review.stems.length === 0, '中五不另布活动星门干');
          continue;
        }
        const doorElement = doorElements[p.door!], doorRelation = expectedRelation(doorElement, p.element);
        equal(review.door?.element, doorElement, '实际门五行独立映射');
        equal(review.door?.monthState, ordinaryStates[expectedRelation(doorElement, monthElements[monthBranch])], '八门月令与普通五行一致');
        equal(review.door?.relation, doorRelation, '八门关系方向为门到宫');
        equal(review.door?.pressure, doorRelation === 'controls', '只有门克宫为门迫');
        equal(review.door?.controlled, doorRelation === 'controlled_by', '宫克门单列宫制门');
        equal(review.stars.map(s => s.name), p.stars, '天芮与天禽逐个复核不丢寄星');
        for (const star of review.stars) {
          equal(star.element, starElements[star.name], '九星本五行独立定表');
          equal(star.monthState, starStates[expectedRelation(starElements[star.name], monthElements[monthBranch])], '九星口诀独立于普通月令');
          equal(star.relation, expectedRelation(starElements[star.name], p.element), '星与宫生克不替代星月旺衰');
        }
        for (const s of review.stems) {
          check(p.heavenStems.includes(s.heavenStem), '逐项天干只取本宫实际天盘');
          const heavenSource = result.palaces.find(source => source.earthStem === s.heavenStem)!;
          equal(s.heavenOrigin, heavenSource.number, '天盘干来源从原地盘追溯而非误用落宫');
          equal(s.heavenCarriedFromCenter, heavenSource.number === 5, '天盘中五随星与地盘中五寄坤分别标记');
          const earth = result.palaces[s.earthOrigin - 1];
          equal(s.earthStem, earth.earthStem, '地盘比较保留真实原宫来源');
          check(s.earthOrigin === p.number || (p.number === 2 && s.earthOrigin === 5), '中五地盘只寄坤不寄任意落星宫');
          equal(s.carriedFromCenter, s.earthOrigin === 5, '中五寄地盘干标记明确');
          equal(s.sameStem, s.heavenStem === s.earthStem, '同干结构逐项判断');
          equal(s.fiveCombine, combinations.some(pair => pair.includes(s.heavenStem) && pair.includes(s.earthStem) && s.heavenStem !== s.earthStem), '五合不把同干当合');
          const pattern = knownPatterns[s.heavenStem + s.earthStem];
          if (pattern) { sawPattern = true; check(review.patterns.some(item => item.label.includes(pattern)), '明确干组合只按天加地识别'); }
        }
        const expectedPairCount = p.heavenStems.length * (p.number === 2 ? 2 : 1);
        equal(review.stems.length, expectedPairCount, '同宫多天干及坤二寄地盘干逐个配对');
        const hitsPunishment = p.heavenStems.some(stem => punishmentPalaces[stem] === p.number);
        const hitsTomb = p.heavenStems.some(stem => tombPalaces[stem] === p.number);
        equal(review.patterns.some(item => item.label.includes('击刑')), hitsPunishment, '六仪击刑独立宫位表');
        equal(review.patterns.some(item => item.label.includes('入墓')), hitsTomb, '三奇入墓采用乙二丙六丁八');
        equal(review.patterns.filter(item => item.label.includes('击刑')).length, p.heavenStems.filter(stem => punishmentPalaces[stem] === p.number).length, '击刑只按天干落宫一次，不因寄地盘干重复');
        equal(review.patterns.filter(item => item.label.includes('入墓')).length, p.heavenStems.filter(stem => tombPalaces[stem] === p.number).length, '入墓只按天干落宫一次，不把地盘干混入');
        if (hitsPunishment) sawPunishment = true;
        if (hitsTomb) sawTomb = true;
        if (p.number === 8 && p.heavenStems.includes('丁')) check(review.patterns.filter(item => item.label.includes('入墓')).some(item => item.disputed), '丁艮入墓保留原典异文标志');
      }
      equal(reading.focus.items.length, 2, '日时对照保留两个符号而非混同身份');
      for (const [index, gz] of [day, hour].entries()) {
        const actual = reading.focus.items[index], expected = expectedStem(gz), earth = result.palaces.find(p => p.earthStem === expected.matchedStem)!;
        equal(actual.matchedSymbol, expected.matchedStem, '日干时干各自按本柱旬定位');
        equal(actual.hiddenJia, expected.hiddenJia, '甲遁六仪标志明确');
        equal(actual.earthOrigin, earth.number, '干定位保留原地盘宫');
        equal(actual.earthHost, earth.number === 5 ? 2 : earth.number, '原中五寄坤不会覆盖原宫');
        equal(actual.palaces, result.palaces.filter(p => p.heavenStems.includes(expected.matchedStem)).map(p => p.number), '取用天盘实际干落宫');
        if (earth.number === 5) sawCenter = true;
      }
      const dayPalace = reading.focus.items[0].palaces[0], hourPalace = reading.focus.items[1].palaces[0];
      equal(reading.comparison?.relation, expectedRelation(palaceElements[dayPalace], palaceElements[hourPalace]), '日时宫关系方向为日宫到时宫');
      equal(reading.timing.status, 'conditional', '明确定位后只生成条件应期');
      check(reading.timing.conditions.every(c => reading.focus.palaces.includes(c.palace) && c.branches.every(b => branches.includes(b)) && !/\d{4}-\d{2}-\d{2}/.test(c.detail)), '应期限定已选宫及地支条件而非公历断日');
      const evidence = readingEvidence(reading);
      check(evidence.length > 0 && evidence.every(e => e.id.startsWith('reading:') && e.sourceUrl.startsWith('https://zh.wikisource.org/')), '复核依据独立命名空间与原典链接齐备');
      equal(new Set(evidence.map(e => e.id)).size, evidence.length, '复核依据内部不重号');
    }
    equal([...structuresSeen].sort(), ['starFuyin', 'doorFuyin', 'starFanyin', 'doorFanyin'].sort(), '独立遍历覆盖星门各自反吟伏吟');
    check(sawCenter && sawPunishment && sawTomb && sawPattern && sawLayerDifference, '遍历实际覆盖寄宫、刑墓、组合与星门不一致');

    for (let dayXun = 0; dayXun < 6; dayXun++) for (let hourXun = 0; hourXun < 6; hourXun++) {
      const day = ganzhi[dayXun * 10], hour = ganzhi[hourXun * 10];
      const result: QimenResult = { ...copy(base), ...buildQimenBoard('yang', 1, hour), input: { ...baseInput, focusTarget: 'day_hour' }, calendar: { ...base.calendar, day, hour } };
      const reading = analyzeQimenReading(result);
      equal(reading.focus.items.map(item => item.matchedSymbol), [hiddenInstruments[dayXun], hiddenInstruments[hourXun]], '六甲日与六甲时三十六种对照分别查各自旬仪');
      if (dayXun !== hourXun) check(reading.focus.items[0].matchedSymbol !== reading.focus.items[1].matchedSymbol, '不同旬甲日甲时不能一律套用当前时旬仪');
      if (dayXun === 4 && hourXun === 0) {
        equal([reading.focus.items[0].earthOrigin, reading.focus.items[0].earthHost, reading.focus.items[0].palaces], [5, 2, [2]], '阳一甲辰日甲子时：日干甲遁壬原五寄坤，不能改成时旬戊');
      }
    }

    for (const target of Object.keys(QIMEN_FOCUS_TARGETS) as Array<keyof typeof QIMEN_FOCUS_TARGETS>) {
      if (target === 'manual_palace') continue;
      const result = calculateQimen({ ...baseInput, focusTarget: target }), reading = result.reading!;
      equal(reading.focus.target, target, '各定位模板保留明确输入');
      equal(reading.focus.status, target === 'none' ? 'unselected' : 'located', '定位模板不作吉凶裁决');
      if (target === 'opening' || target === 'wealth') equal(reading.focus.palaces, result.palaces.filter(p => p.door === (target === 'opening' ? '开门' : '生门')).map(p => p.number), '事项目板只定位实际门');
      if (target === 'study') equal(reading.focus.palaces, result.palaces.filter(p => p.stars.includes('天辅')).map(p => p.number), '文事模板只定位天辅实际宫');
    }
    for (let focusPalace = 1; focusPalace <= 9; focusPalace++) {
      const reading = calculateQimen({ ...baseInput, focusTarget: 'manual_palace', focusPalace }).reading!;
      equal(reading.focus.palaces, [focusPalace], '手动选宫可保留中五等所有原始宫');
      if (focusPalace === 5) check(reading.timing.conditions.every(c => c.branches.length === 0), '中央无支不补造时支应期');
    }
    for (const focusTarget of ['unknown', '', 'constructor', 'toString', '__proto__', 1, null, false, {}]) rejects(() => calculateQimen({ ...baseInput, focusTarget }), '非法或继承属性名模板被拒绝');
    for (const focusPalace of [undefined, 0, 10, -1, 1.5, '1', null, false, {}]) rejects(() => calculateQimen({ ...baseInput, focusTarget: 'manual_palace', focusPalace }), '手动宫位必须为一至九整数');
    for (const focusTarget of ['none', 'day_stem', 'opening']) rejects(() => calculateQimen({ ...baseInput, focusTarget, focusPalace: 1 }), '非手动模板不能携带遗留手动宫位');
    equal(normalizeQimenInput(baseInput).focusTarget ?? 'none', 'none', '旧输入缺少定位目标兼容默认未选');
    const original = calculateQimen({ ...baseInput, focusTarget: 'day_hour' }), preserved = JSON.stringify(original);
    analyzeQimenReading(original); readingEvidence(original.reading!);
    equal(JSON.stringify(original), preserved, '重新复核不修改保存结果和依据');
    equal(new Set(original.evidence.map(e => e.id)).size, original.evidence.length, '基盘与新复核依据全量不重号');
    for (const policy of ['midnight', 'zi_start'] as const) {
      const result = calculateQimen({ ...baseInput, dateTime: '2026-10-14T23:30:00', lateZiPolicy: policy, focusTarget: 'day_hour' });
      equal(result.reading!.focus.items.map(item => item.matchedSymbol), [expectedStem(result.calendar.day).matchedStem, expectedStem(result.calendar.hour).matchedStem], '日时取用同步当前换日口径');
      for (const p of result.reading!.palaces) equal(p.emptyBranches, result.palaces[p.number - 1].emptyBranches, '晚子时复核继承当前时旬空');
    }

    const userA = await registerUser({ username: `qr-a-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '奇门复核合成甲' }); users.push(userA);
    const userB = await registerUser({ username: `qr-b-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '奇门复核合成乙' }); users.push(userB);
    const tokenA = createSession(userA.id), tokenB = createSession(userB.id);
    let id = '', oldId = '', snapshot = '';
    await runAsUser(userA, async () => {
      const created = createQimenSession({ title: '复核条件合成占问', question: '合成测试：如何核对当前项目安排？', input: { ...baseInput, focusTarget: 'day_hour' }, reading: { version: '客户端伪造' } });
      id = created.session.id; snapshot = JSON.stringify(created.session.result);
      equal(created.session.result.reading?.version, QIMEN_READING_VERSION, '保存复核由服务端计算不接受客户端伪造');
      check(createQimenSession({ title: created.session.title, question: created.session.question, input: { ...baseInput, focusTarget: 'day_hour' } }).reused, '相同取用条件幂等复用');
      const other = createQimenSession({ title: created.session.title, question: created.session.question, input: { ...baseInput, focusTarget: 'wealth' } });
      check(other.session.id !== id, '改变取用目标生成独立快照');
      const messages = buildQimenMessages(created.session, [], '解释这些待核条件');
      equal(JSON.parse(messages.at(-1)!.content).result, created.session.result, 'AI严格使用已保存复核快照');
      check(messages[0].content.includes('复核') && messages[0].content.includes('不可信'), '新提示同步复核能力与不可信输入边界');
      const newEvidence = created.session.result.evidence.find(e => e.id.startsWith('reading:'))!;
      const reply = { content: '当前为合成测试，只解释当前固定盘面的复核依据和仍需确认的条件。', evidenceIds: [newEvidence.id] };
      equal(validateQimenReply(JSON.stringify(reply), created.session).evidenceIds, [newEvidence.id], '新复核依据允许有效引用');
      const turn = claimQimenTurn({ sessionId: id, message: '合成历史追问', requestId: randomUUID(), retryOf: null, provider: 'synthetic', model: 'synthetic', promptVersion: 'synthetic' });
      check(finishQimenTurn(turn.turn.id, turn.token!, reply, 0, 0), '复核依据随合成历史回复固定保存');
      const legacy = createQimenSession({ title: '旧版合成占问', question: '合成旧快照', input: baseInput }); oldId = legacy.session.id;
      const oldResult = copy(legacy.session.result); delete oldResult.reading; delete oldResult.input.focusTarget; delete oldResult.input.focusPalace;
      oldResult.evidence = oldResult.evidence.filter(e => !e.id.startsWith('reading:'));
      getDatabase().prepare('UPDATE qimen_sessions SET result_json=? WHERE id=?').run(JSON.stringify(oldResult), oldId);
      const legacyRead = getQimenSession(oldId)!;
      equal(legacyRead.result, oldResult, '读取旧快照不补算新复核与依据');
      const oldMessages = buildQimenMessages(legacyRead, [], '请解释原来这份盘面');
      check(oldMessages[0].content !== messages[0].content, '旧提示不能冒充具有新复核能力');
      equal(JSON.parse(oldMessages.at(-1)!.content).result, oldResult, '旧AI仍只收到旧快照');
      rejects(() => validateQimenReply(JSON.stringify(reply), legacyRead), '旧记录不能引用后来新增的复核ID');
      const archive = await createLocalBackupArchive();
      check(deleteQimenSession(id) && deleteQimenSession(oldId), '合成新旧占问可删除');
      await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      equal(JSON.stringify(getQimenSession(id)!.result), snapshot, '备份还原逐字保留新复核快照');
      equal(getQimenSession(oldId)!.result, oldResult, '备份还原不会升级旧快照内容');
      check((getDatabase().pragma('foreign_key_check') as unknown[]).length === 0, '备份后的外键完整性');
      closeDatabaseConnection();
      equal(JSON.stringify(getQimenSession(id)!.result), snapshot, '关闭连接重读仍保留原复核快照');
    });
    const context = { params: Promise.resolve({ id }) };
    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await read(request(token), context); equal(response.status, status, '复核占问匿名与跨账号访问隔离');
      const body = await response.json();
      if (status === 200) { check(/no-store/.test(response.headers.get('cache-control') ?? ''), '复核响应禁止共享缓存'); equal(JSON.stringify(body.detail.session.result), snapshot, '接口读取固定复核结果'); }
      else check(!JSON.stringify(body).includes('奇门复核合成甲') && !JSON.stringify(body).includes(QIMEN_READING_VERSION), '拒绝响应不泄漏复核内容');
    }
    equal((await remove(request(tokenB, 'DELETE'), context)).status, 404, '跨账号不能删除复核占问');
    equal((await preview(request(undefined, 'POST', { ...baseInput, focusTarget: 'day_hour' }))).status, 401, '匿名不能调用复核预览');
    const previewResponse = await preview(request(tokenA, 'POST', { ...baseInput, focusTarget: 'day_hour' }));
    equal(previewResponse.status, 200, '当前账号可预览复核');
    equal((await previewResponse.json()).result.reading.version, QIMEN_READING_VERSION, '预览返回新复核');
    const forgedResponse = await create(request(tokenA, 'POST', { title: '伪造输入合成', question: '合成验算', input: { ...baseInput, focusTarget: 'opening' }, userId: userB.id, result: { reading: { version: '伪造版本' } } }));
    equal(forgedResponse.status, 201, '服务端接受有效起盘输入');
    const forged = await forgedResponse.json(); equal(forged.session.result.reading.version, QIMEN_READING_VERSION, '伪造账号或复核不能覆盖服务端结果');
    await runAsUser(userB, () => check(getQimenSession(forged.session.id) === null, '伪造userId不能转存到其他账号库'));
    const oldResponse = await read(request(tokenA), { params: Promise.resolve({ id: oldId }) });
    check(!(await oldResponse.json()).detail.session.result.reading, 'HTTP回看旧快照不补算新复核');
    console.log(`奇门断局复核专项通过：${checks}项；独立五行与刑墓表、十八局×六十时、寄宫与双干取用、星门反伏分层、输入拒绝、历史快照、备份及账号隔离；未调用AI服务。`);
  } finally {
    for (const user of users) runAsUser(user, closeDatabaseConnection);
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-qimen-reading-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
