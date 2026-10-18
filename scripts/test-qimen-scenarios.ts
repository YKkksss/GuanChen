import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { claimQimenTurn, createQimenSession, deleteQimenSession, finishQimenTurn, getQimenSession } from '../lib/db/qimen';
import { buildQimenMessages, qimenPromptVersionFor, QIMEN_PROMPT_VERSION, validateQimenReply } from '../lib/qimen/chat';
import { buildQimenBoard, calculateQimen, normalizeQimenInput } from '../lib/qimen/engine';
import { analyzeQimenReading, readingEvidence } from '../lib/qimen/reading-engine';
import { LEGACY_QIMEN_READING_VERSION, QIMEN_FOCUS_TARGETS, QIMEN_READING_VERSION, type QimenElementRelation } from '../lib/qimen/reading-types';
import { QIMEN_SCENARIO_VERSION, type QimenScenarioComparison, type QimenScenarioLocation, type QimenScenarioReview, type QimenScenarioRole } from '../lib/qimen/scenario-types';
import { QIMEN_VERSION, type Element, type QimenInput, type QimenResult } from '../lib/qimen/types';
import { GET as read, DELETE as remove } from '../app/api/qimen/[id]/route';
import { POST as preview } from '../app/api/qimen/preview/route';
import { POST as create } from '../app/api/qimen/route';

// 所有账号、盘面与备份均只存在于本专项的临时目录，不读取正式账号或调用供应商。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-qimen-scenarios-'));
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
// 行为来源，列为目标；独立定表，不调用待测函数推导期望值。
const relations: QimenElementRelation[][] = [
  ['same', 'generates', 'controls', 'controlled_by', 'generated_by'],
  ['generated_by', 'same', 'generates', 'controls', 'controlled_by'],
  ['controlled_by', 'generated_by', 'same', 'generates', 'controls'],
  ['controls', 'controlled_by', 'generated_by', 'same', 'generates'],
  ['generates', 'controls', 'controlled_by', 'generated_by', 'same'],
];
const stars: Record<string, Element> = { 天蓬: '水', 天芮: '土', 天冲: '木', 天辅: '木', 天禽: '土', 天心: '金', 天柱: '金', 天任: '土', 天英: '火' };
const representativeStar: Record<Element, string> = { 木: '天辅', 火: '天英', 土: '天芮', 金: '天心', 水: '天蓬' };
const palaceElements: Record<number, Element> = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
const punishmentPalaces: Record<string, number> = { 戊: 3, 己: 2, 庚: 8, 辛: 9, 壬: 4, 癸: 4 };
const tombPalaces: Record<string, number> = { 乙: 2, 丙: 6, 丁: 8 };
const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ganzhi = Array.from({ length: 60 }, (_, index) => stems[index % 10] + branches[index % 12]);
const hiddenInstruments = ['戊', '己', '庚', '辛', '壬', '癸'];
const baseInput: QimenInput = { method: 'chaibu', dateTime: '2026-10-16T12:00:00', lateZiPolicy: 'midnight' };
const scenarioKeys = ['wealth', 'study', 'travel'] as const;

function expectedStem(gz: string) { const index = ganzhi.indexOf(gz); return gz[0] === '甲' ? hiddenInstruments[Math.floor(index / 10)] : gz[0]; }
function expectedRelation(from: Element, to: Element) { return relations[elements.indexOf(from)][elements.indexOf(to)]; }
function scenario(result: QimenResult): QimenScenarioReview {
  const value = analyzeQimenReading(result).scenario;
  assert.ok(value, '新复核须有独立占类对象');
  return value;
}
function location(review: QimenScenarioReview, roleId: string, locationId: string): QimenScenarioLocation {
  const value = review.roles.find(role => role.id === roleId)?.locations.find(item => item.id === locationId);
  assert.ok(value, '比较端点必须属于实际角色');
  return value;
}
function comparisonLocations(review: QimenScenarioReview, comparison: QimenScenarioComparison) {
  return { from: location(review, comparison.fromRole, comparison.fromLocation), to: location(review, comparison.toRole, comparison.toLocation) };
}
function boardFacts(result: QimenResult) {
  const { version, ju, calendar, palaces, chief, starSteps, doorSteps, hourOffset, emptyBranches, trace } = result;
  return { version, ju, calendar, palaces, chief, starSteps, doorSteps, hourOffset, emptyBranches, trace };
}
function roleContaining(review: QimenScenarioReview, symbol: string): QimenScenarioRole {
  const value = review.roles.find(role => role.symbol === symbol);
  assert.ok(value, `应存在${symbol}角色`);
  return value;
}
function request(token?: string, method = 'GET', body?: unknown) {
  return new Request('http://local/api/qimen', { method, headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function responseBody(response: Response, status: number, label: string) { equal(response.status, status, label); return response.json(); }

async function main() {
  const users: Awaited<ReturnType<typeof registerUser>>[] = [];
  try {
    equal(LEGACY_QIMEN_READING_VERSION, 'qimen-reading-v1-focus-palace-door-star', '保留原条件复核版本常量');
    check(String(QIMEN_READING_VERSION) !== String(LEGACY_QIMEN_READING_VERSION), '占类复核独立升级版本');
    check(QIMEN_PROMPT_VERSION.startsWith('qimen-chat-v3-'), '新占类问答独立使用第三代策略');
    equal(normalizeQimenInput(baseInput), normalizeQimenInput({ ...baseInput, scenario: 'none' }), '明确暂不指定与缺省统一为同一原始输入');
    check(!Object.hasOwn(normalizeQimenInput({ ...baseInput, scenario: 'none' }), 'scenario'), 'none不残留为兼容指纹的额外字段');
    for (const invalid of ['unknown', '', 'constructor', 'toString', '__proto__', 1, null, false, {}, []]) rejects(() => calculateQimen({ ...baseInput, scenario: invalid }), '场景键严格校验并拒绝继承属性名');
    for (const key of scenarioKeys) equal(normalizeQimenInput({ ...baseInput, scenario: key }).scenario, key, '明确支持场景通过规范化');
    const unselected = calculateQimen(baseInput).reading!.scenario!;
    equal({ key: unselected.key, status: unselected.status, roles: unselected.roles, comparisons: unselected.comparisons }, { key: 'none', status: 'unselected', roles: [], comparisons: [] }, '不选占类时不从占问或日时干猜出角色');

    // 仅定向测试星自身五行至生门宫五行，不把构造夹具当作真实九星排布。
    for (const from of elements) for (const to of elements) {
      const result = copy(calculateQimen({ ...baseInput, scenario: 'wealth' })), palace = result.palaces.find(item => item.door === '生门')!;
      palace.element = to; palace.stars = [representativeStar[from]];
      const review = scenario(result);
      equal(review.comparisons.length, 1, '单星关系夹具只产生一个星用至宫体比较');
      const comparison = review.comparisons[0], endpoints = comparisonLocations(review, comparison);
      equal([endpoints.from.comparisonBasis, endpoints.to.comparisonBasis], ['star', 'palace'], '求财用星自身五行，不能将两侧都替换成宫五行');
      equal([endpoints.from.comparisonElement, endpoints.to.comparisonElement, comparison.relation], [from, to, expectedRelation(from, to)], '星至宫方向符合独立二十五对五行表');
      check(comparison.samePalace, '星用与生门宫体同宫标记保留，不能因此强制同五行');
    }

    const base = calculateQimen(baseInput), preserved = JSON.stringify(boardFacts(base));
    for (const target of Object.keys(QIMEN_FOCUS_TARGETS) as Array<keyof typeof QIMEN_FOCUS_TARGETS>) {
      const extra = target === 'manual_palace' ? { focusPalace: 5 } : {};
      const original = calculateQimen({ ...baseInput, focusTarget: target, ...extra });
      for (const key of scenarioKeys) {
        const withScenario = calculateQimen({ ...baseInput, focusTarget: target, ...extra, scenario: key });
        equal(boardFacts(withScenario), boardFacts(original), '占类选择不改变原始局数、干支、九宫与时旬空');
        equal(withScenario.reading!.focus, original.reading!.focus, '原参考对象与新占类独立，旧wealth/study不被改成占类取用');
        equal(withScenario.reading!.comparison, original.reading!.comparison, '原日时干对照保持原有方向和语义');
      }
    }
    equal(JSON.stringify(boardFacts(base)), preserved, '独立场景计算不改写原基盘');

    let sawDoubleStar = false, sawSamePalace = false, sawCenterOrigin = false, sawOwnPattern = false, sawOtherPalacePattern = false;
    const hours = new Set<string>();
    // 每两个小时取一次固定墙钟文本，覆盖连续五日的六十时干支；Date仅用于枚举，不作时区换算。
    const dateTimes = Array.from({ length: 60 }, (_, index) => new Date(Date.UTC(2026, 9, 16, 0) + index * 7_200_000).toISOString().slice(0, 19));
    for (const dun of ['yang', 'yin'] as const) for (let ju = 1; ju <= 9; ju++) for (const dateTime of dateTimes) {
      const raw = calculateQimen({ method: 'manual', manualDun: dun, manualJu: ju, dateTime, lateZiPolicy: 'midnight' });
      hours.add(raw.calendar.hour);
      const fixedFacts = JSON.stringify(boardFacts(raw));
      for (const key of scenarioKeys) {
        const result = copy(raw); result.input.scenario = key;
        const before = JSON.stringify(result), reading = analyzeQimenReading(result), review = reading.scenario!;
        equal([review.version, review.key, review.status], [QIMEN_SCENARIO_VERSION, key, 'located'], '十八局六十时的每个支持场景能定位实际对象');
        equal(JSON.stringify(result), before, '纯复核不修改原结果、原输入或原依据');
        equal(JSON.stringify(boardFacts(result)), fixedFacts, '场景不回写或改变基盘事实');
        const rolesById = new Map(review.roles.map(role => [role.id, role]));
        equal(rolesById.size, review.roles.length, '同宫或同符号角色仍有独立标识');
        const allLocations = review.roles.flatMap(role => role.locations);
        equal([...new Set(allLocations.map(item => item.palace))].sort((a, b) => a - b), [...review.palaceNumbers].sort((a, b) => a - b), '可联动宫位准确覆盖所有实际角色');
        check(allLocations.every(item => result.palaces.some(palace => palace.number === item.palace) && item.palace !== 5), '活动角色不补造中五活动星门干');
        check(review.comparisons.every(comparison => { const { from, to } = comparisonLocations(review, comparison); return comparison.relation === expectedRelation(from.comparisonElement, to.comparisonElement) && comparison.samePalace === (from.palace === to.palace); }), '所有角色关系方向及同宫标记符合独立表');
        equal(new Set(review.comparisons.map(item => item.id)).size, review.comparisons.length, '占类比较标识唯一');
        for (const role of review.roles) for (const item of role.locations) {
          const ownStem = role.stemFocus?.matchedSymbol;
          const expected = ownStem ? [punishmentPalaces[ownStem] === item.palace ? `punishment:${ownStem}` : null, tombPalaces[ownStem] === item.palace ? `tomb:${ownStem}` : null].filter(Boolean) : [];
          equal(item.ownPatterns.map(pattern => pattern.id).sort(), expected.sort(), '自身刑墓只属于本角色匹配天盘干，非干角色不得继承同宫格局');
          sawOwnPattern ||= item.ownPatterns.length > 0;
          sawOtherPalacePattern ||= !ownStem && reading.palaces.find(palace => palace.number === item.palace)!.patterns.length > 0;
        }
        if (key === 'wealth') {
          const bodyPalace = result.palaces.find(palace => palace.door === '生门')!, starComparisons = review.comparisons.map(comparison => comparisonLocations(review, comparison));
          equal(starComparisons.map(pair => pair.from.symbol).sort(), [...bodyPalace.stars].sort(), '生门宫内天芮、天禽等各星单列，不因同五行合并');
          check(starComparisons.every(pair => pair.from.comparisonBasis === 'star' && pair.from.comparisonElement === stars[pair.from.symbol] && pair.to.palace === bodyPalace.number && pair.to.comparisonElement === palaceElements[bodyPalace.number] && pair.to.comparisonBasis === 'palace'), '求财比较使用实际星用至生门宫体，不用生门本身土五行代替宫体');
          sawDoubleStar ||= bodyPalace.stars.length === 2;
        } else if (key === 'study') {
          const student = review.roles.find(role => role.id === 'exam_day')!;
          check(student, '考试日干角色保留原柱定位信息');
          const matched = expectedStem(result.calendar.day), earth = result.palaces.find(palace => palace.earthStem === matched)!;
          equal([student.stemFocus!.matchedSymbol, student.stemFocus!.earthOrigin, student.stemFocus!.earthHost], [matched, earth.number, earth.number === 5 ? 2 : earth.number], '考试士子日干按本柱甲旬定位，保留原宫与寄宫');
          equal(student.locations.map(item => item.palace), result.palaces.filter(palace => palace.heavenStems.includes(matched)).map(palace => palace.number), '日干实际天盘落宫与保存盘面一致');
          equal(review.comparisons.length, 2, '考试分别比较文宗与文章至士子，不合并两对象');
          check(review.comparisons.every(comparison => comparison.toRole === student.id && comparisonLocations(review, comparison).from.comparisonBasis === 'palace' && comparisonLocations(review, comparison).to.comparisonBasis === 'palace'), '考试比较两侧宫五行，不混用天辅木或丁火自身五行');
          const article = review.roles.find(role => role.id !== student.id && role.symbol === '丁')!;
          check(article, '考试文章明确按天盘丁定位');
          equal(article.locations.map(item => item.palace), result.palaces.filter(palace => palace.heavenStems.includes('丁')).map(palace => palace.number), '文章丁取实际天盘宫位');
          equal(roleContaining(review, '天辅').locations.map(item => item.palace), result.palaces.filter(palace => palace.stars.includes('天辅')).map(palace => palace.number), '文宗只定位天辅实际宫');
          sawCenterOrigin ||= earth.number === 5;
        } else {
          const endpoints = review.comparisons.map(comparison => comparisonLocations(review, comparison));
          equal(endpoints.length, 2, '水陆出行分别保留两种路线结构比较');
          equal(endpoints.map(pair => pair.to.palace).sort((a, b) => a - b), [1, 8], '水路固定坎一、陆路固定艮八，不把随盘休生门错当固定路线');
          check(endpoints.every(pair => pair.from.palace === result.chief.doorPalace && pair.from.comparisonBasis === 'palace' && pair.to.comparisonBasis === 'palace'), '出行由值使门当前落宫比较两固定路线宫');
          equal(roleContaining(review, '休门').locations.map(item => item.palace), result.palaces.filter(palace => palace.door === '休门').map(palace => palace.number), '休门辅助位置保留实际转动落宫');
          equal(roleContaining(review, '生门').locations.map(item => item.palace), result.palaces.filter(palace => palace.door === '生门').map(palace => palace.number), '生门辅助位置不改成固定艮八');
        }
        sawSamePalace ||= review.comparisons.some(comparison => comparison.samePalace);
        const evidence = readingEvidence(reading).filter(item => item.id.startsWith('reading:scenario:'));
        check(evidence.length > 0 && evidence.every(item => item.sourceUrl.startsWith('https://zh.wikisource.org/')), '新占类依据有独立标识及可核对原典来源');
        equal(new Set(evidence.map(item => item.id)).size, evidence.length, '场景依据不会重号');
        check(review.pending.length > 0 && review.sources.length > 0 && review.boundaries.length > 0 && !Object.hasOwn(review, 'score') && !Object.hasOwn(review, 'verdict'), '每场景保留待核与边界，不增加吉凶分数或结果裁决');
      }
    }
    equal(hours.size, 60, '十八局矩阵确实覆盖全部六十时干支');
    check(sawDoubleStar && sawSamePalace && sawCenterOrigin && sawOwnPattern && sawOtherPalacePattern, '真实矩阵覆盖双星、同宫多角色、中五来源及同宫别干格局反例');

    const sameSymbolResult = copy(base);
    sameSymbolResult.input.scenario = 'study'; sameSymbolResult.calendar.day = '丁卯';
    const sameSymbolReview = scenario(sameSymbolResult), studentRole = sameSymbolReview.roles.find(role => role.id === 'exam_day')!;
    const articleRole = sameSymbolReview.roles.find(role => role.id !== studentRole.id && role.symbol === '丁')!;
    check(studentRole.id !== articleRole.id, '丁日士子与文章同符号仍保留两个独立角色');
    equal(studentRole.locations.map(item => item.palace), articleRole.locations.map(item => item.palace), '丁日士子与文章共享实际落宫，不伪造第二位置');
    check(sameSymbolReview.comparisons.some(item => item.fromRole === articleRole.id && item.toRole === studentRole.id && item.samePalace && item.relation === 'same'), '同宫双角色保持真实宫比较，不因同符号吞掉关系');
    equal([articleRole.stemFocus!.key, articleRole.stemFocus!.symbol, articleRole.stemFocus!.matchedSymbol, articleRole.stemFocus!.hiddenJia], ['exam_article', '丁', '丁', false], '固定文章丁不冒充日柱或借时柱遁仪');
    const articleEarth = sameSymbolResult.palaces.find(palace => palace.earthStem === '丁')!;
    equal([articleRole.stemFocus!.earthOrigin, articleRole.stemFocus!.earthHost], [articleEarth.number, articleEarth.number === 5 ? 2 : articleEarth.number], '固定丁独立保留地盘原宫与寄宫');

    // 缺项夹具只检查部分定位的降级行为，不冒充有效的完整传统盘面。
    const missingExamResult = copy(base); missingExamResult.input.scenario = 'study';
    missingExamResult.palaces.forEach(palace => { palace.stars = palace.stars.filter(star => star !== '天辅'); palace.heavenStems = palace.heavenStems.filter(stem => stem !== '丁'); });
    const missingExam = scenario(missingExamResult);
    equal(missingExam.status, 'partial', '缺少文宗或文章时明确部分定位');
    equal(missingExam.roles.filter(role => ['exam_examiner', 'exam_article'].includes(role.id)).map(role => role.locations), [[], []], '缺角色保留空位置，不拿其他星干或邻宫代替');
    check(missingExam.comparisons.every(item => !['exam_examiner', 'exam_article'].includes(item.fromRole)), '缺少来源不补造场景比较');
    const missingWealthResult = copy(base); missingWealthResult.input.scenario = 'wealth';
    missingWealthResult.palaces.forEach(palace => { if (palace.door === '生门') palace.door = null; });
    const missingWealth = scenario(missingWealthResult);
    equal([missingWealth.status, missingWealth.comparisons.length], ['partial', 0], '缺生门时不默认以艮八或别门替代宫体');
    const missingChiefResult = copy(base); missingChiefResult.input.scenario = 'travel'; missingChiefResult.chief.doorPalace = 5;
    const missingChief = scenario(missingChiefResult);
    equal([missingChief.status, missingChief.comparisons.length], ['partial', 0], '无法定位活动值使时保留缺项，不给中五造门或擅自改宫');
    check(missingChief.roles.flatMap(role => role.locations).every(item => item.palace !== 5), '部分定位仍不添加中五活动角色');

    // 此处直接指定日柱和时柱，专查跨旬甲遁，不作为日期到干支换算测试。
    for (let dayXun = 0; dayXun < 6; dayXun++) for (let hourXun = 0; hourXun < 6; hourXun++) {
      const result: QimenResult = { ...copy(base), ...buildQimenBoard('yang', 1, ganzhi[hourXun * 10]), input: { ...baseInput, scenario: 'study' }, calendar: { ...base.calendar, day: ganzhi[dayXun * 10], hour: ganzhi[hourXun * 10] } };
      const review = scenario(result), student = review.roles.find(role => role.id === 'exam_day')!;
      equal(student.stemFocus!.matchedSymbol, hiddenInstruments[dayXun], '六甲日各按自身旬仪，不偷用当前时旬首仪');
      if (dayXun !== hourXun) check(student.stemFocus!.matchedSymbol !== hiddenInstruments[hourXun], '跨旬甲日与甲时明确保留不同遁仪');
      if (dayXun === 4 && hourXun === 0) equal([student.stemFocus!.earthOrigin, student.stemFocus!.earthHost, student.locations.map(item => item.palace)], [5, 2, [2]], '甲辰日甲子时原中五壬寄坤，再按实际天盘定位');
    }
    for (const policy of ['midnight', 'zi_start'] as const) {
      const result = calculateQimen({ ...baseInput, dateTime: '2026-10-16T23:30:00', lateZiPolicy: policy, scenario: 'study' });
      const student = result.reading!.scenario!.roles.find(role => role.id === 'exam_day')!;
      equal(student.stemFocus!.matchedSymbol, expectedStem(result.calendar.day), '场景日干随明确午夜或子初口径定位');
      check(result.reading!.palaces.every(palace => JSON.stringify(palace.emptyBranches) === JSON.stringify(result.palaces[palace.number - 1].emptyBranches)), '占类不改写时旬空支，也不将部分支空扩成全宫');
    }

    const userA = await registerUser({ username: `qs-a-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '奇门占类合成甲' }); users.push(userA);
    const userB = await registerUser({ username: `qs-b-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '奇门占类合成乙' }); users.push(userB);
    const tokenA = createSession(userA.id), tokenB = createSession(userB.id);
    let id = '', v1Id = '', oldId = '', snapshot = '', v1Snapshot = '', oldSnapshot = '';
    await runAsUser(userA, async () => {
      const created = createQimenSession({ title: '占类条件合成验收', question: '合成测试：核对考试结构条件', input: { ...baseInput, scenario: 'study' }, result: { reading: { scenario: { version: '伪造' } } } });
      id = created.session.id; snapshot = JSON.stringify(created.session.result);
      equal(created.session.result.reading!.scenario!.version, QIMEN_SCENARIO_VERSION, '保存的占类由服务端计算，客户端伪造结果无效');
      check(createQimenSession({ title: created.session.title, question: created.session.question, input: { ...baseInput, scenario: 'study' } }).reused, '同场景同原始条件保持保存幂等');
      check(createQimenSession({ title: created.session.title, question: created.session.question, input: { ...baseInput, scenario: 'wealth' } }).session.id !== id, '更换占类生成独立固定快照');
      const messages = buildQimenMessages(created.session, [], '解释保存的对象条件');
      equal(qimenPromptVersionFor(created.session), QIMEN_PROMPT_VERSION, '新版完整场景明确选用v3提示策略');
      equal(JSON.parse(messages.at(-1)!.content).result, created.session.result, 'AI只消费已保存占类快照');
      check(/占类|场景/.test(messages[0].content) && /同宫|角色/.test(messages[0].content), '新提示含占类角色及适用边界');
      const noScenario = copy(created.session); delete noScenario.result.reading!.scenario;
      equal(qimenPromptVersionFor(noScenario), 'qimen-chat-v2-conditional-reading', '新版缺场景字段不冒称完整v3占类能力');
      const unknownScenario = copy(created.session); unknownScenario.result.reading!.scenario!.version = '未知占类版本';
      equal(qimenPromptVersionFor(unknownScenario), 'qimen-chat-v2-conditional-reading', '未知占类版本退回已有基础复核');
      const unknownReading = copy(created.session); unknownReading.result.reading!.version = '未知条件版本';
      equal(qimenPromptVersionFor(unknownReading), 'qimen-chat-v1', '未知条件版本不借新版能力');
      const citation = created.session.result.evidence.find(item => item.id.startsWith('reading:scenario:'))!;
      const reply = { content: '这里只复核合成盘面已保存的占类角色、比较方向和相反条件，不据此判断现实考试结果。', evidenceIds: [citation.id] };
      equal(validateQimenReply(JSON.stringify(reply), created.session).evidenceIds, [citation.id], '实际保存的占类依据可引用');
      rejects(() => validateQimenReply(JSON.stringify({ ...reply, evidenceIds: ['reading:scenario:不存在'] }), created.session), '拒绝编造场景依据');
      rejects(() => validateQimenReply(JSON.stringify({ ...reply, evidenceIds: Array(9).fill(citation.id) }), created.session), '占类引用仍遵守八条上限');
      const turn = claimQimenTurn({ sessionId: id, message: '合成占类追问', requestId: randomUUID(), retryOf: null, provider: 'synthetic', model: 'synthetic', promptVersion: QIMEN_PROMPT_VERSION });
      check(finishQimenTurn(turn.turn.id, turn.token!, reply, 0, 0), '已完成对话固定保存新依据');

      const v1 = createQimenSession({ title: 'v1条件结构合成', question: '原日时干条件快照', input: { ...baseInput, focusTarget: 'day_hour' } }); v1Id = v1.session.id;
      const v1Result = copy(v1.session.result); v1Result.reading!.version = LEGACY_QIMEN_READING_VERSION; delete v1Result.reading!.scenario;
      v1Result.evidence = v1Result.evidence.filter(item => !item.id.startsWith('reading:scenario:')); v1Snapshot = JSON.stringify(v1Result);
      getDatabase().prepare('UPDATE qimen_sessions SET result_json=? WHERE id=?').run(v1Snapshot, v1Id);
      const v1Read = getQimenSession(v1Id)!;
      equal(JSON.stringify(v1Read.result), v1Snapshot, '完整v1条件快照回看不补占类');
      equal(qimenPromptVersionFor(v1Read), 'qimen-chat-v2-conditional-reading', 'v1条件快照保留v2提示策略');
      const v1Messages = buildQimenMessages(v1Read, [], '原条件');
      check(v1Messages[0].content !== messages[0].content && !v1Messages[0].content.includes('本记录是第一版固定快照，未含当前深化复核'), 'v1不会误称完全没有深化');
      equal(JSON.parse(v1Messages.at(-1)!.content).result, v1Result, 'v1问答只接收原来的条件对象');
      rejects(() => validateQimenReply(JSON.stringify(reply), v1Read), 'v1不得引用后来增加的占类依据');
      const oldCitation = v1Read.result.evidence.find(item => item.id.startsWith('reading:'))!;
      equal(validateQimenReply(JSON.stringify({ ...reply, evidenceIds: [oldCitation.id] }), v1Read).evidenceIds, [oldCitation.id], '原v1条件依据仍可正常引用');

      const legacy = createQimenSession({ title: '无reading基础合成', question: '基础九宫旧快照', input: baseInput }); oldId = legacy.session.id;
      const oldResult = copy(legacy.session.result); delete oldResult.reading; delete oldResult.input.focusTarget; delete oldResult.input.focusPalace; delete oldResult.input.scenario;
      oldResult.evidence = oldResult.evidence.filter(item => !item.id.startsWith('reading:')); oldSnapshot = JSON.stringify(oldResult);
      getDatabase().prepare('UPDATE qimen_sessions SET result_json=? WHERE id=?').run(oldSnapshot, oldId);
      const oldRead = getQimenSession(oldId)!;
      equal(qimenPromptVersionFor(oldRead), 'qimen-chat-v1', '基础旧盘使用原v1能力');
      equal(JSON.stringify(oldRead.result), oldSnapshot, '基础旧盘不补任何深化');
      const oldMessages = buildQimenMessages(oldRead, [], '解释基础九宫');
      check(oldMessages[0].content !== v1Messages[0].content && oldMessages[0].content !== messages[0].content, '三代快照各有准确能力提示');
      rejects(() => validateQimenReply(JSON.stringify(reply), oldRead), '基础旧盘不得引用占类依据');
      rejects(() => validateQimenReply(JSON.stringify({ ...reply, evidenceIds: [oldCitation.id] }), oldRead), '基础旧盘不得引用v1复核依据');
      const archive = await createLocalBackupArchive();
      check([id, v1Id, oldId].every(value => deleteQimenSession(value)), '三代合成快照可各自删除');
      await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      equal(JSON.stringify(getQimenSession(id)!.result), snapshot, '备份恢复逐字保留新版占类');
      equal(JSON.stringify(getQimenSession(v1Id)!.result), v1Snapshot, '备份恢复逐字保留v1条件');
      equal(JSON.stringify(getQimenSession(oldId)!.result), oldSnapshot, '备份恢复逐字保留基础旧盘');
      equal(getDatabase().pragma('foreign_key_check'), [], '三代还原后无外键错误');
      closeDatabaseConnection();
      equal(JSON.stringify(getQimenSession(id)!.result), snapshot, '重新打开连接仍使用保存快照');
    });

    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await read(request(token), { params: Promise.resolve({ id }) });
      check(/no-store/.test(response.headers.get('cache-control') ?? ''), '新场景或拒绝响应均禁止共享缓存');
      const body = await responseBody(response, status, '占类快照读回遵守匿名和账号边界');
      if (status === 200) equal(JSON.stringify(body.detail.session.result), snapshot, 'API读取固定占类快照');
      else check(!JSON.stringify(body).includes('奇门占类合成甲') && !JSON.stringify(body).includes(QIMEN_SCENARIO_VERSION), '拒绝响应不泄露占类结构或姓名');
    }
    await responseBody(await remove(request(tokenB, 'DELETE'), { params: Promise.resolve({ id }) }), 404, '另一账号不能删除占类记录');
    await responseBody(await preview(request(undefined, 'POST', { ...baseInput, scenario: 'study' })), 401, '匿名不能预览占类');
    const previewed = await responseBody(await preview(request(tokenA, 'POST', { ...baseInput, scenario: 'study', reading: { scenario: { version: '伪造' } } })), 200, '当前账号可预览，伪造结果被忽略');
    equal(previewed.result.reading.scenario.version, QIMEN_SCENARIO_VERSION, '预览仍由服务端按原始输入重算');
    await responseBody(await preview(request(tokenA, 'POST', { ...baseInput, scenario: '__proto__' })), 400, 'API拒绝继承键占类');
    const forged = await responseBody(await create(request(tokenA, 'POST', { title: '占类防伪合成新盘', question: '合成接口验证', input: { ...baseInput, scenario: 'travel' }, userId: userB.id, result: { reading: { scenario: { version: '伪造' } } } })), 201, '当前账号可保存有效原始资料');
    equal(forged.session.result.reading.scenario.version, QIMEN_SCENARIO_VERSION, '伪造场景或账号不能覆盖计算');
    await runAsUser(userB, () => check(getQimenSession(forged.session.id) === null, '客户端userId不能向另一账号写入'));
    const v1Read = await responseBody(await read(request(tokenA), { params: Promise.resolve({ id: v1Id }) }), 200, 'v1 API仍可回看');
    equal(JSON.stringify(v1Read.detail.session.result), v1Snapshot, 'v1 API不补场景对象');
    const oldRead = await responseBody(await read(request(tokenA), { params: Promise.resolve({ id: oldId }) }), 200, '基础旧盘API仍可回看');
    equal(JSON.stringify(oldRead.detail.session.result), oldSnapshot, '基础旧盘API不补reading');
    console.log(`奇门占类专项通过：${checks}项；独立五行表、阴阳十八局×六十时×三占类、甲日跨旬和中五寄宫、双星与同宫角色、刑墓归属、旧参考兼容、三代快照和备份、账号隔离与接口防伪；未调用AI服务。`);
  } finally {
    for (const user of users) runAsUser(user, closeDatabaseConnection);
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-qimen-scenarios-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
