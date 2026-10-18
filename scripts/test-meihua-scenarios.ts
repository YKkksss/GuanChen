import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { closeAccountConnections, createSession, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createMeihuaSession, deleteMeihuaSession, getMeihuaSession } from '../lib/db/meihua';
import {
  buildMeihuaMessages, getMeihuaDetail, MEIHUA_BASE_PROMPT_VERSION, MEIHUA_IMAGERY_PROMPT_VERSION,
  MEIHUA_PROMPT_VERSION, MEIHUA_SEASON_PROMPT_VERSION, resolveMeihuaPromptVersion,
  sendMeihuaMessage, validateMeihuaReply,
} from '../lib/meihua/chat';
import { calculateMeihua, normalizeMeihuaInput } from '../lib/meihua/engine';
import { LEGACY_MEIHUA_IMAGERY_READING_VERSION, LEGACY_MEIHUA_READING_VERSION, MEIHUA_READING_VERSION } from '../lib/meihua/reading-types';
import { buildMeihuaScenario, meihuaScenarioEvidence } from '../lib/meihua/scenario-engine';
import { MEIHUA_SCENARIOS, MEIHUA_SCENARIO_VERSION, type MeihuaScenarioKey } from '../lib/meihua/scenario-types';
import type { MeihuaInput, MeihuaResult, MeihuaSession } from '../lib/meihua/types';
import { GET as read, DELETE as remove } from '../app/api/meihua/[id]/route';
import { POST as preview } from '../app/api/meihua/preview/route';
import { POST as save } from '../app/api/meihua/route';
import { POST as chat } from '../app/api/meihua/[id]/messages/route';
import { POST as cancel } from '../app/api/meihua/[id]/cancel/route';

// 账号、业务库、备份只使用独立临时目录；AI仅连接本脚本的本机模拟供应商。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-meihua-scenarios-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'synthetic-meihua-scenarios-key';
process.env.DEEPSEEK_MODEL = 'synthetic-meihua-scenarios-model';

let checks = 0, calls = 0, mode: 'normal' | 'imagery-only' = 'normal';
function check(value: unknown, label: string): asserts value { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
async function rejectsAsync(work: () => Promise<unknown>, label: string) { await assert.rejects(work, label); checks++; }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

// 独立定表：不从待测八卦目录、生克函数或占类引擎取得期望值。
const trigrams = [
  { name: '乾', element: '金', lines: [1, 1, 1] }, { name: '兑', element: '金', lines: [1, 1, 0] },
  { name: '离', element: '火', lines: [1, 0, 1] }, { name: '震', element: '木', lines: [1, 0, 0] },
  { name: '巽', element: '木', lines: [0, 1, 1] }, { name: '坎', element: '水', lines: [0, 1, 0] },
  { name: '艮', element: '土', lines: [0, 0, 1] }, { name: '坤', element: '土', lines: [0, 0, 0] },
];
const elements = ['木', '火', '土', '金', '水'];
const matrix = [
  ['比和', '体生用', '体克用', '用克体', '用生体'],
  ['用生体', '比和', '体生用', '体克用', '用克体'],
  ['用克体', '用生体', '比和', '体生用', '体克用'],
  ['体克用', '用克体', '用生体', '比和', '体生用'],
  ['体生用', '体克用', '用克体', '用生体', '比和'],
];
const nodeKeys = ['body', 'primary', 'mutual_lower', 'mutual_upper', 'changed'] as const;
const scenarioKeys: MeihuaScenarioKey[] = ['none', 'planning', 'wealth', 'travel'];
const primaryObjects = { planning: '所谋事项', wealth: '所问财物', travel: '所行之应' };
const anchors = { planning: '求謀占第八', wealth: '求財占第十', travel: '出行占第十二' };
const input: MeihuaInput = { method: 'manual', upper: 1, lower: 5, movingLine: 4, mutualPolicy: 'pure_changed', contextDateTime: '2026-10-17T12:00:00', timingTarget: 'changed_use' };
const replyText = '## 合成占类复核\n\n只按保存的明确占类区分主方、本用和互变辅助位置，结构条件与现实条件分别核对，不能把共享卦爻重复计为独立支持。';
function replyFor(result: MeihuaResult, imageryOnly = false) {
  const ids = result.reading?.scenario && !imageryOnly
    ? ['reading:scenario:policy', 'reading:imagery:policy']
    : result.reading?.imagery ? ['reading:imagery:policy']
      : result.reading ? ['reading:relations'] : ['gua:primary'];
  return { content: replyText, evidenceIds: ids };
}
const received: MeihuaResult[] = [];
const server = createServer(async (request, response) => {
  calls++; let raw = ''; for await (const chunk of request) raw += chunk;
  const messages = JSON.parse(raw).messages as Array<{ content: string }>;
  const result = JSON.parse(messages.at(-1)!.content).result as MeihuaResult;
  received.push(result);
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(replyFor(result, mode === 'imagery-only')) } }], usage: { prompt_tokens: 40, completion_tokens: 60 } }));
});
function request(token?: string, method = 'GET', body?: unknown) {
  return new Request('http://local/api/meihua', { method, headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function bodyOf(response: Response, status: number, label: string) { equal(response.status, status, label); return response.json(); }
function withoutScenario(result: MeihuaResult) {
  const value = copy(result); delete value.input.scenario; delete value.reading!.scenario;
  value.evidence = value.evidence.filter(item => !item.id.startsWith('reading:scenario:'));
  return value;
}
function payload(session: MeihuaSession) { return JSON.parse(buildMeihuaMessages(session, [], '按保存条件复核').at(-1)!.content).result as MeihuaResult; }
function promptVersion(id: string) {
  return (getDatabase().prepare('SELECT prompt_version FROM meihua_turns WHERE id=?').get(getMeihuaDetail(id).turns.at(-1)!.id) as { prompt_version: string }).prompt_version;
}

async function main() {
  const users: Awaited<ReturnType<typeof registerUser>>[] = [];
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('本机模拟供应商端口不存在');
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  try {
    equal([LEGACY_MEIHUA_READING_VERSION, LEGACY_MEIHUA_IMAGERY_READING_VERSION, MEIHUA_READING_VERSION], ['meihua-reading-v1-season-conditional-timing', 'meihua-reading-v2-imagery-provenance', 'meihua-reading-v3-explicit-scenarios'], '三代复核真实版本不能重命名历史');
    equal([MEIHUA_BASE_PROMPT_VERSION, MEIHUA_SEASON_PROMPT_VERSION, MEIHUA_IMAGERY_PROMPT_VERSION, MEIHUA_PROMPT_VERSION], ['meihua-chat-v1', 'meihua-chat-v2-season-conditional-timing', 'meihua-chat-v3-imagery-provenance', 'meihua-chat-v4-explicit-scenarios'], '四代提示策略分别保留');
    equal(Object.keys(MEIHUA_SCENARIOS), scenarioKeys, '占类仅支持明确四项，不隐含行人或求名');
    const seen = new Map<MeihuaScenarioKey, Set<string>>(scenarioKeys.map(key => [key, new Set()]));
    const primaryDirections = new Map<string, Set<string>>(), conflicting = new Set<MeihuaScenarioKey>();
    let combinations = 0, repeated = false, changedMutual = false;
    for (let upper = 1; upper <= 8; upper++) for (let lower = 1; lower <= 8; lower++) for (let movingLine = 1; movingLine <= 6; movingLine++) for (const mutualPolicy of ['middle_lines', 'pure_changed'] as const) {
      const baseline = calculateMeihua({ method: 'manual', upper, lower, movingLine, mutualPolicy });
      const original = [...trigrams[lower - 1].lines, ...trigrams[upper - 1].lines];
      const changed = original.map((value, index) => index === movingLine - 1 ? 1 - value : value);
      const exception = mutualPolicy === 'pure_changed' && upper === lower && (upper === 1 || upper === 8);
      const positions = { body: movingLine <= 3 ? [4, 5, 6] : [1, 2, 3], primary: movingLine <= 3 ? [1, 2, 3] : [4, 5, 6], mutual_lower: [2, 3, 4], mutual_upper: [3, 4, 5], changed: movingLine <= 3 ? [1, 2, 3] : [4, 5, 6] };
      const body = trigrams[(movingLine <= 3 ? upper : lower) - 1];
      let sharedConditions: unknown;
      for (const scenarioKey of scenarioKeys) {
        combinations++;
        const raw: MeihuaInput = { method: 'manual', upper, lower, movingLine, mutualPolicy, scenario: scenarioKey }, rawBefore = JSON.stringify(raw);
        const result = calculateMeihua(raw), reading = result.reading!, scenario = reading.scenario!, before = JSON.stringify(result);
        equal(JSON.stringify(raw), rawBefore, '占类计算不修改调用者输入');
        equal(withoutScenario(result), withoutScenario(baseline), '切换占类不改起卦、固定体、互变、季节、取象或原应期');
        equal([scenario.version, scenario.key, scenario.label, scenario.status], [MEIHUA_SCENARIO_VERSION, scenarioKey, MEIHUA_SCENARIOS[scenarioKey], scenarioKey === 'none' ? 'unspecified' : 'selected'], '占类版本、显式选择和状态一致');
        equal(buildMeihuaScenario(result, reading), scenario, '独立调用纯占类引擎与保存层一致');
        const scenarioEvidence = meihuaScenarioEvidence(scenario), ids = new Set(result.evidence.map(item => item.id));
        equal(JSON.stringify(result), before, '生成占类及其依据不修改原固定事实');
        equal(ids.size, result.evidence.length, '占类与旧依据全局无重号');
        check(scenarioEvidence.every(item => item.id.startsWith('reading:scenario:') && ids.has(item.id) && item.sourceUrl.startsWith('https://zh.wikisource.org/wiki/梅花易數/卷二')), '新依据仅用独立命名空间及原典来源');
        check(scenario.checks.length > 0 && scenario.boundaries.length > 0, '明确列出待核现实条件及层能力边界');
        if (scenarioKey === 'none') {
          equal([scenario.roles, scenario.primaryCondition, scenario.supplements], [[], null, []], '未指定时不凭卦象或占问补角色');
          equal(scenarioEvidence.map(item => item.id), ['reading:scenario:policy'], '未指定只保存口径依据，不编造场景条件');
          check(!Object.hasOwn(result.input, 'scenario'), '显式none规范为省略');
          continue;
        }
        equal(scenario.roles.map(role => role.nodeKey), [...nodeKeys], '五个身份均保留，不因同卦而合并');
        equal(scenario.roles.map(role => role.role), ['主方（固定体）', primaryObjects[scenarioKey], '辅助用位（不另指派现实对象）', '辅助用位（不另指派现实对象）', '辅助用位（不另指派现实对象）'], '只有本用采用所选占类角色，互变不自动认定财物人物或阶段');
        for (const role of scenario.roles) {
          const source = role.nodeKey === 'changed' || (role.nodeKey.startsWith('mutual_') && exception) ? 'changed' : 'primary';
          const lines = positions[role.nodeKey].map(position => (source === 'changed' ? changed : original)[position - 1]);
          const expected = trigrams.find(trigram => trigram.lines.join() === lines.join())!;
          equal([role.trigram.name, role.trigram.element, role.trigram.lines, role.sourceBoard, role.sourceLinePositions], [expected.name, expected.element, lines, source, positions[role.nodeKey]], '占类角色沿独立爻画与源板取值，不以占类另换体用');
          equal(role.seasonState, null, '缺少明确时刻不借占类补现在旺衰');
          check(ids.has(role.evidenceId) && ids.has(role.imageryEvidenceId) && role.imageryEvidenceId.startsWith('reading:imagery:'), '角色同时有实际占类依据与取象来源');
          changedMutual ||= source === 'changed' && role.nodeKey.startsWith('mutual_');
        }
        const conditions = [scenario.primaryCondition!, ...scenario.supplements];
        equal(conditions.map(condition => [condition.nodeKey, condition.ruleScope]), [['primary', 'selected_scenario_primary'], ['mutual_lower', 'shared_body_use_reference'], ['mutual_upper', 'shared_body_use_reference'], ['changed', 'shared_body_use_reference']], '本用独占场景规则，三辅助用位采用通用体用依据');
        for (const condition of conditions) {
          const role = scenario.roles.find(item => item.nodeKey === condition.nodeKey)!;
          const direction = matrix[elements.indexOf(body.element)][elements.indexOf(role.trigram.element)];
          equal([condition.body.name, condition.counterpart.name, condition.relationship, condition.bodySeasonState, condition.seasonState], [body.name, role.trigram.name, direction, null, null], '逐位关系方向由独立25格矩阵核对，季节不改生克');
          check(ids.has(condition.evidenceId) && ids.has(condition.imageryEvidenceId) && scenario.sources.some(source => source.id === condition.sourceId), '每个条件绑定实际证据与来源');
          check(condition.focus.length > 0 && condition.observation.length > 0 && condition.pending.length > 0, '每个条件有传统侧重与未确认条件，不只给结论标签');
          const expectedAnchor = condition.nodeKey === 'primary' ? anchors[scenarioKey] : '體用總訣';
          check(scenario.sources.find(source => source.id === condition.sourceId)!.url.endsWith('#' + expectedAnchor), '本用引用所选占类原典，互变只引用共享规则');
          seen.get(scenarioKey)!.add(direction);
        }
        const primary = scenario.primaryCondition!;
        const directionKey = primary.relationship, texts = primaryDirections.get(directionKey) ?? new Set<string>();
        texts.add(primary.focus); primaryDirections.set(directionKey, texts);
        if (scenario.supplements.some(condition => condition.relationship !== primary.relationship)) conflicting.add(scenarioKey);
        repeated ||= new Set(scenario.roles.map(role => role.trigram.number)).size < 5;
        const shared = scenario.supplements.map(({ focus, observation, relationship }) => ({ focus, observation, relationship }));
        if (sharedConditions === undefined) sharedConditions = shared;
        else equal(shared, sharedConditions, '同一卦的互变通用关系不随本用占类机械改写');
      }
    }
    equal(combinations, 64 * 6 * 2 * 4, '3072真实组合全部执行，不用构造数据替代矩阵');
    for (const key of ['planning', 'wealth', 'travel'] as const) equal([...seen.get(key)!].sort(), ['体克用', '体生用', '比和', '用克体', '用生体'].sort(), '三个占类分别实际覆盖五种关系');
    equal(primaryDirections.size, 5, '三个占类的本用实际覆盖全部五种关系');
    for (const [direction, texts] of primaryDirections) equal(texts.size, 3, `${direction}三场景侧重点不能共用标签`);
    equal([...conflicting].sort(), ['planning', 'travel', 'wealth'], '三个占类均涵盖本用与互变相反条件，不能覆盖或抵消');
    check(repeated && changedMutual, '真实矩阵包含同卦多角色与纯乾坤变板取互');

    const defaultInput = normalizeMeihuaInput(input);
    equal(defaultInput, normalizeMeihuaInput({ ...input, scenario: 'none' }), 'none与省略统一，避免重复保存同条件');
    for (const invalid of [null, '', ' ', '财富', 'Wealth', 'travel ', 'unknown', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 1, true, [], {}]) rejects(() => normalizeMeihuaInput({ ...input, scenario: invalid }), '非法或继承键占类严格拒绝，不默认none');
    const allTimeInputs: MeihuaInput[] = [input, { method: 'numbers', numbers: ['1', '5'], movingRule: 'sum', mutualPolicy: 'pure_changed' }, { method: 'numbers', numbers: ['1', '5'], movingRule: 'sum_hour', dateTime: '2026-10-17T12:00:00', mutualPolicy: 'pure_changed' }, { method: 'time', dateTime: '2026-10-17T12:00:00', mutualPolicy: 'middle_lines' }, { method: 'objects', objectCount: '11', dateTime: '2026-10-17T12:00:00', mutualPolicy: 'middle_lines' }];
    for (const raw of allTimeInputs) for (const key of ['planning', 'wealth', 'travel'] as const) {
      const baseline = calculateMeihua(raw), result = calculateMeihua({ ...raw, scenario: key });
      equal(withoutScenario(result), withoutScenario(baseline), '四种起卦及报数两口径切场景均不改变旧事实');
      const scenario = result.reading!.scenario!, known = Boolean(raw.dateTime || raw.contextDateTime);
      equal(scenario.roles.map(role => role.seasonState === null), Array(5).fill(!known), '明确时间与缺时间沿用原季节条件');
      equal(scenario.primaryCondition!.bodySeasonState, result.reading!.rows[0].state, '主方季节独立保留，不拿本用旺衰替代');
    }
    const restrictive = ['planning', 'wealth', 'travel'].map(key => calculateMeihua({ ...input, upper: 1, lower: 4, movingLine: 1, scenario: key }).reading!.scenario!);
    equal(restrictive.map(scenario => scenario.primaryCondition!.relationship), ['体克用', '体克用', '体克用'], '真实同卦三场景体克用反例');
    check(/迟缓|缓/.test(restrictive[0].primaryCondition!.focus), '求谋体克用保留推进迟缓侧重');
    check(/财/.test(restrictive[1].primaryCondition!.focus) && !/迟缓/.test(restrictive[1].primaryCondition!.focus), '求财体克用不能照搬求谋迟缓');
    check(/行|应/.test(restrictive[2].primaryCondition!.focus) && !/财/.test(restrictive[2].primaryCondition!.focus), '出行体克用不能照搬求财制财');

    const userA = await registerUser({ username: `ms-a-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '梅花占类合成甲' }); users.push(userA);
    const userB = await registerUser({ username: `ms-b-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '梅花占类合成乙' }); users.push(userB);
    const tokenA = createSession(userA.id), tokenB = createSession(userB.id);
    const snapshots = new Map<string, string>(); let id = '', noneId = '';
    await runAsUser(userA, async () => {
      const made = createMeihuaSession({ title: '明确求财合成', question: '合成占问只验证角色与条件，不代表现实预测。', input: { ...input, scenario: 'wealth' }, userId: userB.id, result: { reading: { scenario: { key: 'travel', version: '伪造' } } } });
      id = made.session.id;
      equal(made.session.result.reading!.scenario!.key, 'wealth', '服务端由明确原始输入生成占类，伪造result与账号无效');
      check(createMeihuaSession({ title: made.session.title, question: made.session.question, input: { ...input, scenario: 'wealth' } }).reused, '明确占类同条件保存幂等');
      const separate = createMeihuaSession({ title: made.session.title, question: made.session.question, input: { ...input, scenario: 'planning' } });
      check(!separate.reused && separate.session.id !== id, '相同卦象不同明确占类不能合并');
      const noScene = createMeihuaSession({ title: '未指定不猜占类', question: '求财求谋出行只是合成自由文字，未选择占类。', input }); noneId = noScene.session.id;
      equal(noScene.session.result.reading!.scenario!.key, 'none', '自由占问关键词不能推定占类');
      check(createMeihuaSession({ title: noScene.session.title, question: noScene.session.question, input: { ...input, scenario: 'none' } }).reused, '省略与显式none数据库指纹相同');
      equal(calls, 0, '所有计算、预览和保存不调用模型');
      equal(resolveMeihuaPromptVersion(made.session), MEIHUA_PROMPT_VERSION, '新选择场景使用v4能力');
      equal(resolveMeihuaPromptVersion(noScene.session), MEIHUA_PROMPT_VERSION, '支持的未指定口径同样使用明确边界策略');
      equal(payload(made.session), made.session.result, '已支持完整快照直接进入模型载荷，不重算');
      const valid = replyFor(made.session.result);
      equal(validateMeihuaReply(JSON.stringify(valid), made.session).evidenceIds, valid.evidenceIds, '新回复同时引用真实占类与取象依据');
      for (const ids of [['gua:primary'], ['reading:imagery:policy'], ['reading:scenario:policy'], ['reading:scenario:missing', 'reading:imagery:policy']]) rejects(() => validateMeihuaReply(JSON.stringify({ content: replyText, evidenceIds: ids }), made.session), 'v4拒绝只引用旧层、单层或伪造占类依据');
      const currentSnapshot = JSON.stringify(made.session.result);
      const cases: Array<{ label: string; change: (session: MeihuaSession) => void; expected: string; keepImagery: boolean; keepReading: boolean }> = [
        { label: '缺少占类', change: session => { delete session.result.reading!.scenario; }, expected: MEIHUA_IMAGERY_PROMPT_VERSION, keepImagery: true, keepReading: true },
        { label: '未知占类版本', change: session => { session.result.reading!.scenario!.version = 'future-scenario'; }, expected: MEIHUA_IMAGERY_PROMPT_VERSION, keepImagery: true, keepReading: true },
        { label: '未知占类键', change: session => { session.result.reading!.scenario!.key = 'constructor' as MeihuaScenarioKey; }, expected: MEIHUA_IMAGERY_PROMPT_VERSION, keepImagery: true, keepReading: true },
        { label: '占类与输入不一致', change: session => { session.result.reading!.scenario!.key = 'travel'; }, expected: MEIHUA_IMAGERY_PROMPT_VERSION, keepImagery: true, keepReading: true },
        { label: '占类状态不一致', change: session => { session.result.reading!.scenario!.status = 'unspecified'; }, expected: MEIHUA_IMAGERY_PROMPT_VERSION, keepImagery: true, keepReading: true },
        { label: '缺少取象', change: session => { delete session.result.reading!.imagery; }, expected: MEIHUA_SEASON_PROMPT_VERSION, keepImagery: false, keepReading: true },
        { label: '未知取象版本', change: session => { session.result.reading!.imagery!.version = 'future-imagery'; }, expected: MEIHUA_SEASON_PROMPT_VERSION, keepImagery: false, keepReading: true },
        { label: '未知取象目录', change: session => { session.result.reading!.imagery!.catalogVersion = 'future-catalog'; }, expected: MEIHUA_SEASON_PROMPT_VERSION, keepImagery: false, keepReading: true },
        { label: '未知复核版本', change: session => { session.result.reading!.version = 'future-reading'; }, expected: MEIHUA_BASE_PROMPT_VERSION, keepImagery: false, keepReading: false },
      ];
      for (const entry of cases) {
        // 这里只为失败边界显式构造矛盾或未知保存值；不计入3072真实起卦矩阵。
        const unknown = copy(made.session); entry.change(unknown); const original = JSON.stringify(unknown);
        equal(resolveMeihuaPromptVersion(unknown), entry.expected, `${entry.label}按能力逐层降级`);
        const sent = payload(unknown);
        check(!sent.reading?.scenario && sent.evidence.every(item => !item.id.startsWith('reading:scenario:')), `${entry.label}的占类与对应依据同时撤回`);
        equal(Boolean(sent.reading?.imagery), entry.keepImagery, `${entry.label}正确保留或撤回取象`);
        equal(Boolean(sent.reading), entry.keepReading, `${entry.label}正确保留或撤回复核`);
        if (!entry.keepImagery) check(sent.evidence.every(item => !item.id.startsWith('reading:imagery:')), `${entry.label}无幽灵取象引用`);
        if (!entry.keepReading) check(sent.evidence.every(item => !item.id.startsWith('reading:')), `${entry.label}无幽灵复核引用`);
        rejects(() => validateMeihuaReply(JSON.stringify(valid), unknown), `${entry.label}不能借已撤回占类证据通过校验`);
        validateMeihuaReply(JSON.stringify(replyFor(sent)), unknown); checks++;
        equal(JSON.stringify(unknown), original, `${entry.label}载荷过滤不改保存原文`);
      }
      equal(JSON.stringify(made.session.result), currentSnapshot, '所有能力探测不污染实际当前快照');
      const requestId = randomUUID(), message = '请复核保存的财物本用与辅助条件';
      await sendMeihuaMessage(id, { message, requestId });
      equal(getMeihuaDetail(id).turns.at(-1)!.status, 'completed', '明确占类问答完整保存');
      equal(promptVersion(id), MEIHUA_PROMPT_VERSION, '新问答记录实际v4提示版本');
      const beforeCalls = calls;
      await sendMeihuaMessage(id, { message, requestId });
      equal(calls, beforeCalls, '新能力保持请求幂等，不重复供应商调用');
      await rejectsAsync(() => sendMeihuaMessage(id, { message: '不同消息', requestId }), '同请求标识不接受另一消息');
      mode = 'imagery-only';
      await rejectsAsync(() => sendMeihuaMessage(id, { message: '合成遗漏占类引用', requestId: randomUUID() }), '服务生成链路拒绝只引用上一代取象层');
      const failed = getMeihuaDetail(id).turns.at(-1)!;
      equal([failed.status, failed.content], ['failed', null], '错误引用不发布正文，只保留失败问题');
      mode = 'normal';
      await sendMeihuaMessage(id, { message: failed.message, retryOf: failed.id, requestId: randomUUID() });
      equal(getMeihuaDetail(id).turns.at(-1)!.retryOf, failed.id, '正确双层引用可重试失败轮次');
      await sendMeihuaMessage(noneId, { message: '请按未指定状态解释口径，不从这些词猜占类', requestId: randomUUID() });
      equal(promptVersion(noneId), MEIHUA_PROMPT_VERSION, '未指定场景的策略记录一致');
      equal(received.at(-1)!.reading!.scenario!.roles, [], '未指定模型载荷没有自动生成场景角色');
      snapshots.set(id, currentSnapshot); snapshots.set(noneId, JSON.stringify(noScene.session.result));

      // 历史夹具从当前实际卦象移除后来层，并明确写入当代真实版本与证据集合。
      for (const generation of ['imagery', 'season', 'base'] as const) {
        const old = createMeihuaSession({ title: `历史${generation}合成`, question: '只回看保存能力，不补占类', input }).session;
        const result = copy(old.result); delete result.reading!.scenario;
        result.evidence = result.evidence.filter(item => !item.id.startsWith('reading:scenario:'));
        if (generation === 'imagery') result.reading!.version = LEGACY_MEIHUA_IMAGERY_READING_VERSION;
        if (generation === 'season') {
          result.reading!.version = LEGACY_MEIHUA_READING_VERSION; delete result.reading!.imagery;
          result.evidence = result.evidence.filter(item => !item.id.startsWith('reading:imagery:'));
        }
        if (generation === 'base') { delete result.reading; result.evidence = result.evidence.filter(item => !item.id.startsWith('reading:')); }
        const snapshot = JSON.stringify(result); snapshots.set(old.id, snapshot);
        getDatabase().prepare('UPDATE meihua_sessions SET result_json=? WHERE id=?').run(snapshot, old.id);
        const stored = getMeihuaSession(old.id)!, expected = generation === 'imagery' ? MEIHUA_IMAGERY_PROMPT_VERSION : generation === 'season' ? MEIHUA_SEASON_PROMPT_VERSION : MEIHUA_BASE_PROMPT_VERSION;
        equal(JSON.stringify(stored.result), snapshot, '历史快照读取不追加当前占类或能力');
        equal(resolveMeihuaPromptVersion(stored), expected, '三代历史分别使用真实原提示策略');
        equal(payload(stored), result, '历史模型载荷不补算新事实');
        equal(validateMeihuaReply(JSON.stringify(replyFor(result)), stored).evidenceIds, replyFor(result).evidenceIds, '旧回复保持其原有引用契约');
        rejects(() => validateMeihuaReply(JSON.stringify(valid), stored), '旧快照不能引用新占类依据');
        await sendMeihuaMessage(old.id, { message: '仅解释历史已保存能力', requestId: randomUUID() });
        equal(promptVersion(old.id), expected, '历史新轮次记录当代实际提示版本');
        equal(JSON.stringify(getMeihuaSession(old.id)!.result), snapshot, '历史继续问答不升级结果原文');
      }
      for (const [sessionId, snapshot] of snapshots) equal(JSON.stringify(getMeihuaSession(sessionId)!.result), snapshot, '四代成功失败问答均不改固定事实');
      const archive = await createLocalBackupArchive();
      check([...snapshots.keys()].every(sessionId => deleteMeihuaSession(sessionId)), '四代保存记录可独立删除');
      await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      for (const [sessionId, snapshot] of snapshots) equal(JSON.stringify(getMeihuaSession(sessionId)!.result), snapshot, '备份恢复四代原文不升级');
      equal(getDatabase().pragma('foreign_key_check'), [], '四代恢复无外键破坏');
      closeDatabaseConnection();
      equal(JSON.stringify(getMeihuaSession(id)!.result), currentSnapshot, '重开连接保留场景及原始条件');
    });
    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await read(request(token), { params: Promise.resolve({ id }) });
      check(/no-store/.test(response.headers.get('cache-control') ?? ''), '场景响应及拒绝响应都禁止共享缓存');
      const body = await bodyOf(response, status, '四代场景会话遵守当前账号隔离');
      if (status === 200) equal(JSON.stringify(body.detail.session.result), snapshots.get(id), 'API回看场景与依据原文一致');
      else check(!JSON.stringify(body).includes(MEIHUA_SCENARIO_VERSION), '拒绝响应不泄漏私有占类快照');
    }
    for (const [sessionId, snapshot] of snapshots) {
      const response = await bodyOf(await read(request(tokenA), { params: Promise.resolve({ id: sessionId }) }), 200, '四代快照都可API回看');
      equal(JSON.stringify(response.detail.session.result), snapshot, '四代API原文不补算');
    }
    for (const action of [chat, cancel]) await bodyOf(await action(request(tokenB, 'POST', action === chat ? { message: '越权场景问答', requestId: randomUUID() } : { turnId: randomUUID() }), { params: Promise.resolve({ id }) }), 404, '另一账号不能发问或停止当前场景');
    await bodyOf(await remove(request(tokenB, 'DELETE'), { params: Promise.resolve({ id }) }), 404, '另一账号不能删除场景');
    await bodyOf(await preview(request(undefined, 'POST', { ...input, scenario: 'wealth' })), 401, '匿名不能生成场景预览');
    for (const scenario of ['constructor', null, 'unknown']) await bodyOf(await preview(request(tokenA, 'POST', { ...input, scenario })), 400, 'API对非法占类不降为默认');
    const previewed = await bodyOf(await preview(request(tokenA, 'POST', { ...input, scenario: 'travel', reading: { scenario: '伪造' } })), 200, '场景预览由服务端计算');
    equal(previewed.result.reading.scenario.key, 'travel', '伪造结果不能覆盖预览场景');
    const saved = await bodyOf(await save(request(tokenA, 'POST', { title: 'API场景防伪合成', question: '合成资料', input: { ...input, scenario: 'planning' }, userId: userB.id, result: { reading: { scenario: { key: 'wealth', version: '伪造' } } } })), 201, 'API保存原始场景输入');
    equal([saved.session.result.reading.scenario.key, saved.session.result.reading.scenario.version], ['planning', MEIHUA_SCENARIO_VERSION], 'API忽略客户端伪造的占类结果');
    await runAsUser(userB, () => check(getMeihuaSession(saved.session.id) === null, '伪造账号不能将场景写给另一用户'));
    const callCount = calls;
    const foreign = await middleware(new NextRequest('http://127.0.0.1:30001/api/meihua', { method: 'POST', headers: { host: '127.0.0.1:30001', origin: 'http://untrusted.invalid', 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, body: JSON.stringify({ input: { ...input, scenario: 'wealth' } }) }));
    equal(foreign.status, 403, '异源场景写入在中间件拒绝'); await foreign.json();
    equal(calls, callCount, '隔离、回看、保存与异源失败都不触发额外模型调用');
    console.log(`梅花占类复核专项通过：${checks}项；3072真实卦变与明确四占类、独立五行与来源、体克用三场景差异、本用与辅助规则隔离、默认与非法参数、四代快照提示与证据撤回、保存幂等、防伪、账号、同源及备份；本机模拟供应商${calls}次，真实供应商0次。`);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const user of users) runAsUser(user, closeDatabaseConnection);
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-meihua-scenarios-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
