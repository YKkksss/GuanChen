import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { calculateLiuyao, normalizeLiuyaoInput } from '../lib/liuyao/engine';
import { elementRelation, lineContext, progressionFor, analyzeLiuyaoReading, readingEvidence } from '../lib/liuyao/reading-engine';
import { LIUYAO_READING_VERSION, LIUYAO_FOCUS_TARGETS, LIUYAO_TARGET_KIN } from '../lib/liuyao/reading-types';
import { LIUYAO_VERSION, KINDS, type Element, type Kin, type LineValue, type LiuyaoInput, type LiuyaoResult } from '../lib/liuyao/types';
import { createLiuyaoSession, getLiuyaoSession, deleteLiuyaoSession, claimLiuyaoTurn, finishLiuyaoTurn } from '../lib/db/liuyao';
import { buildLiuyaoMessages, validateLiuyaoReply } from '../lib/liuyao/chat';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { GET as read, DELETE as remove } from '../app/api/liuyao/[id]/route';
import { POST as preview } from '../app/api/liuyao/preview/route';
import { POST as create } from '../app/api/liuyao/route';

// 所有账号和业务库均落在本次独立临时目录；本专项不发送任何 AI 请求。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-liuyao-reading-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.DEEPSEEK_API_KEY = '';
process.env.OPENAI_API_KEY = '';

let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const elements: Element[] = ['木', '火', '土', '金', '水'];
const branchElements: Record<string, Element> = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const combinations = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
const advances = ['亥子', '寅卯', '巳午', '申酉', '丑辰', '辰未', '未戌'];
// 行为“来源”，列为“目标”；独立定表，避免复用待测引擎的生克算法。
const relationTable = [
  ['same', 'generates', 'controls', 'controlled_by', 'generated_by'],
  ['generated_by', 'same', 'generates', 'controls', 'controlled_by'],
  ['controlled_by', 'generated_by', 'same', 'generates', 'controls'],
  ['controls', 'controlled_by', 'generated_by', 'same', 'generates'],
  ['generates', 'controls', 'controlled_by', 'generated_by', 'same'],
] as const;
const baseInput: LiuyaoInput = { method: 'lines', lineValues: [7, 7, 7, 7, 7, 7], dateTime: '2026-10-15T12:00:00', lateZiPolicy: 'midnight', focusKind: 'none' };
function inputFor(bits: number, mask = 0, extra: Partial<LiuyaoInput> = {}): LiuyaoInput {
  return { ...baseInput, lineValues: Array.from({ length: 6 }, (_, i) => ((bits >> i) & 1 ? ((mask >> i) & 1 ? 9 : 7) : ((mask >> i) & 1 ? 6 : 8))) as LineValue[], ...extra };
}
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function focused(result: LiuyaoResult, kind: Kin) {
  result.input.focusKind = kind; result.input.focusTarget = 'manual'; delete result.input.focusPosition;
  result.focus = { kind, visible: result.lines.filter(l => l.kin === kind).map(l => l.position), hidden: result.lines.filter(l => l.hidden?.kin === kind).map(l => l.position) };
  return result;
}
function sample(branch: string, month: string, day: string, options: { moving?: boolean; empty?: boolean; helper?: boolean } = {}) {
  // 定向关系夹具只测试单一条件：不用于检验纳甲或历法，真实卦覆盖在后面的4096组合。
  const result = calculateLiuyao(baseInput);
  result.calendar = { ...result.calendar, monthBranch: month, month: `甲${month}`, dayBranch: day, day: `甲${day}`, emptyBranches: options.empty ? [branch] : [] };
  result.lines = result.lines.map((line, i) => ({ ...line, moving: i === 0 ? Boolean(options.moving) : i === 1 && Boolean(options.helper), branch: i === 0 ? branch : i === 1 && options.helper ? '亥' : '午', element: i === 0 ? branchElements[branch] : i === 1 && options.helper ? '水' : '火', kin: '官鬼' as Kin, hidden: null }));
  result.movingLines = result.lines.filter(l => l.moving).map(l => l.position);
  focused(result, '官鬼');
  return analyzeLiuyaoReading(result).lines[0];
}
function request(token?: string, method = 'GET', body?: unknown) {
  return new Request('http://local/api/liuyao', { method, headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function main() {
  const users: Awaited<ReturnType<typeof registerUser>>[] = [];
  try {
    elements.forEach((source, i) => elements.forEach((target, j) => equal(elementRelation(source, target), relationTable[i][j], `${source}对${target}的生克方向`)));
    for (const from of branches) for (const to of branches) {
      equal(progressionFor(from, to), advances.includes(from + to) ? 'advance' : advances.includes(to + from) ? 'retreat' : 'none', `${from}变${to}的独立进退表`);
    }
    equal(progressionFor('戌', '丑'), 'none', '土支进神不首尾循环');
    equal(progressionFor('丑', '戌'), 'none', '土支退神不跨两级');
    const calendar = calculateLiuyao(baseInput).calendar;
    rejects(() => lineContext('不存在', calendar), '非法爻支不能参与月日关系');
    rejects(() => lineContext('子', { ...calendar, monthBranch: '不存在' }), '非法月支不能参与月日关系');
    rejects(() => lineContext('子', { ...calendar, dayBranch: '不存在' }), '非法日支不能参与月日关系');
    for (const inherited of ['constructor', 'toString', '__proto__']) {
      rejects(() => lineContext(inherited, calendar), '爻支拒绝继承属性名');
      rejects(() => lineContext('子', { ...calendar, monthBranch: inherited }), '月支拒绝继承属性名');
      rejects(() => lineContext('子', { ...calendar, dayBranch: inherited }), '日支拒绝继承属性名');
    }
    for (const month of branches) for (const day of branches) for (const branch of branches) {
      const rawCalendar = { ...calendar, monthBranch: month, dayBranch: day, emptyBranches: ['子', '丑'] };
      const context = lineContext(branch, rawCalendar), monthIndex = elements.indexOf(branchElements[month]), lineIndex = elements.indexOf(branchElements[branch]);
      equal({ element: context.element, monthState: context.monthState, empty: context.empty, monthClash: context.monthClash, dayClash: context.dayClash, monthCombine: context.monthCombine, dayCombine: context.dayCombine }, {
        element: branchElements[branch], monthState: monthIndex === lineIndex ? '旺' : relationTable[monthIndex][lineIndex] === 'generates' ? '相' : '休囚', empty: ['子', '丑'].includes(branch), monthClash: (branches.indexOf(month) + 6) % 12 === branches.indexOf(branch), dayClash: (branches.indexOf(day) + 6) % 12 === branches.indexOf(branch), monthCombine: combinations.some(pair => pair.includes(month) && pair.includes(branch) && month !== branch), dayCombine: combinations.some(pair => pair.includes(day) && pair.includes(branch) && day !== branch),
      }, `${month}月${day}日${branch}爻的月日事实矩阵`);
      check(Boolean(context.monthRelation) && Boolean(context.dayRelation), '月日关系均有可读说明');
    }
    check(sample('卯', '寅', '酉').activation.status === 'hidden_movement_candidate', '月旺静卯被酉日冲为暗动候选');
    check(sample('丑', '寅', '未').activation.status === 'hidden_movement_candidate', '月休囚丑土得未日同类扶仍有暗动候选');
    check(sample('卯', '申', '酉').activation.status === 'day_break_candidate', '月克且日克无助静卯日冲为日破候选');
    check(sample('卯', '寅', '酉', { empty: true }).activation.status === 'conflicting', '旬空与日冲并见不得直接判暗动');
    check(sample('卯', '酉', '酉').activation.status === 'conflicting', '月破与日冲并见保留冲突');
    check(sample('卯', '寅', '酉', { moving: true }).activation.status === 'moving_day_clash', '明动日冲不能当暗动');
    check(sample('卯', '申', '酉', { helper: true }).activation.status === 'conflicting', '月休囚静卯日冲有其他明动水爻潜在生扶时不直接日破');
    check(sample('申', '寅', '申').context.monthClash && sample('申', '寅', '申').context.supports.length > 0, '月破日临保留相反支持事实');
    check(sample('卯', '寅', '午').activation.status === 'none', '无日冲不制造暗动');

    let sawHidden = false, sawMultiple = false, sawSingle = false;
    for (let bits = 0; bits < 64; bits++) {
      for (let mask = 0; mask < 64; mask++) {
        const result = calculateLiuyao(inputFor(bits, mask)), reading = result.reading;
        check(reading?.version === LIUYAO_READING_VERSION && result.version === LIUYAO_VERSION, '复核独立版本不更改基盘版本');
        equal(reading!.lines.map(l => l.position), [1, 2, 3, 4, 5, 6], '复核六爻从初爻至上爻无缺漏');
        equal(reading!.lines.filter(l => l.change !== null).map(l => l.position), result.movingLines, '只有实际动爻存在动变复核');
        for (const review of reading!.lines) {
          if (!review.change) continue;
          const original = result.lines[review.position - 1], from = original.branch, to = original.changed.branch;
          equal([review.change.from, review.change.to], [from, to], '回头关系只比较本位动爻与实际变爻');
          equal(review.change.relation, relationTable[elements.indexOf(original.changed.element)][elements.indexOf(original.element)], '回头生克方向为变爻到本位原爻');
          equal(review.change.progression, advances.includes(from + to) ? 'advance' : advances.includes(to + from) ? 'retreat' : 'none', '所有动变使用独立进退表');
        }
        const evidence = readingEvidence(reading!);
        check(evidence.length > 0 && evidence.every(e => e.id.startsWith('reading:') && e.sourceUrl.startsWith('https://zh.wikisource.org/')), '复核依据命名空间和原典链接完整');
        equal(new Set(result.evidence.map(e => e.id)).size, result.evidence.length, '基盘与新增复核依据不重号');
        equal(reading!.focus.status, 'unselected', '未选用神不从占问猜测');
        equal(reading!.timing.status, 'needs_selection', '未定用神不生成应期条件');
        equal(reading!.roles.length, 0, '未指定用神不猜测元忌仇类别');
      }
      for (const kind of KINDS) {
        const result = calculateLiuyao(inputFor(bits, 0, { focusKind: kind, focusTarget: 'manual' })), reading = result.reading!;
        const candidates = [...result.lines.filter(l => l.kin === kind).map(l => ({ position: l.position, hidden: false })), ...result.lines.filter(l => l.hidden?.kin === kind).map(l => ({ position: l.position, hidden: true }))];
        equal(reading.focus.candidates.map(c => ({ position: c.position, hidden: c.hidden })).sort((a, b) => a.position - b.position), candidates.sort((a, b) => a.position - b.position), '用神可见/伏神候选来自实际六亲');
        check(reading.focus.candidates.every(c => c.kin === kind), '候选六亲不混入其他类别');
        const targetElement = reading.focus.candidates[0]?.element;
        if (targetElement) {
          equal(reading.roles.length, result.lines.length + result.lines.filter(l => l.hidden).length, '元忌仇只含本爻和实际伏神，不把变爻跨位加入');
          for (const role of reading.roles) {
            const relation = relationTable[elements.indexOf(role.element)][elements.indexOf(targetElement)];
            equal(role.role, relation === 'same' ? '用神同类' : relation === 'generates' ? '元神' : relation === 'controls' ? '忌神' : relation === 'controlled_by' ? '仇神' : '其他', '元忌仇定义相对用神五行且方向正确');
            if (role.hidden) check(!role.moving, '伏神类别不能冒充实际发动');
          }
        }
        if (candidates.length > 1) { sawMultiple = true; check(reading.focus.status === 'multiple' && reading.focus.selected === null, '用神多现不自动优选唯一爻'); }
        if (candidates.length === 1) { sawSingle = true; equal(reading.focus.selected, { ...candidates[0], method: 'single' }, '唯一候选自动定位并标明方式'); }
        for (const candidate of candidates) {
          if (candidate.hidden) sawHidden = true;
          const selected = calculateLiuyao(inputFor(bits, 0, { focusKind: kind, focusTarget: 'manual', focusPosition: candidate.position })).reading!;
          equal(selected.focus.selected, { ...candidate, method: 'manual' }, '显式选择可见或伏神爻位固定定位');
          equal(selected.timing.status, 'conditional', '选定用神后仅列条件应期');
          check(selected.timing.conditions.every(c => c.branches.every(b => branches.includes(b)) && !/\d{4}-\d{2}-\d{2}/.test(c.detail)), '应期条件只列合法地支不伪造公历日期');
        }
        const notCandidate = result.lines.find(l => !candidates.some(c => c.position === l.position));
        if (notCandidate) rejects(() => calculateLiuyao(inputFor(bits, 0, { focusKind: kind, focusTarget: 'manual', focusPosition: notCandidate.position })), '不得手动指定其他六亲爻位');
      }
      for (const target of Object.keys(LIUYAO_FOCUS_TARGETS) as Array<keyof typeof LIUYAO_FOCUS_TARGETS>) {
        if (target === 'manual') continue;
        const result = calculateLiuyao(inputFor(bits, 0, { focusTarget: target, focusKind: 'none' })), focus = result.reading!.focus;
        if (target === 'self') {
          const shi = result.lines.find(l => l.role === '世')!;
          equal(focus.selected, { position: shi.position, hidden: false, method: 'self' }, '自占模板固定本卦世爻');
          equal(focus.kind, shi.kin, '自占用神六亲取世爻实际六亲');
          rejects(() => calculateLiuyao(inputFor(bits, 0, { focusTarget: 'self', focusPosition: shi.position === 1 ? 2 : 1 })), '自占不能选其他爻代替世爻');
        } else equal(focus.kind, LIUYAO_TARGET_KIN[target], '明确事项目板按固定六亲映射');
      }
    }
    check(sawHidden && sawMultiple && sawSingle, '独立遍历覆盖伏神、多现与唯一候选');
    const invalidInputs = [
      ...[0, 7, -1, 1.5, '1', null, false, {}].map(focusPosition => ({ focusPosition })),
      ...['unknown', '', 'constructor', 'toString', '__proto__', 1, null, false].map(focusTarget => ({ focusTarget })),
      { focusKind: 'none', focusPosition: 1 },
    ];
    for (const extra of invalidInputs) rejects(() => calculateLiuyao({ ...baseInput, ...extra }), '不合法的用神目标或爻位输入被拒绝');
    equal(normalizeLiuyaoInput(baseInput).focusKind, 'none', '旧输入省略复核目标仍兼容');
    const original = calculateLiuyao({ ...baseInput, focusTarget: 'self' }), savedResult = JSON.stringify(original);
    analyzeLiuyaoReading(original); readingEvidence(original.reading!);
    equal(JSON.stringify(original), savedResult, '纯复核不会修改原结果或原依据');
    const changeReferences = calculateLiuyao(inputFor(63, 63)).evidence.filter(e => e.id.startsWith('reading:change:'));
    check(changeReferences.length === 6 && changeReferences.every(e => e.sourceUrl.endsWith('/15')), '回头生克引用动变章，不以进退章节代替其来源');
    for (const policy of ['midnight', 'zi_start'] as const) {
      const result = calculateLiuyao({ ...baseInput, dateTime: '2026-10-15T23:30:00', lateZiPolicy: policy, focusTarget: 'self' });
      for (const line of result.reading!.lines) equal(line.context.empty, result.calendar.emptyBranches.includes(line.context.branch), '复核旬空沿用已选换日后的基盘日辰');
    }

    const userA = await registerUser({ username: `lr-a-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '六爻复核合成甲' }); users.push(userA);
    const userB = await registerUser({ username: `lr-b-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '六爻复核合成乙' }); users.push(userB);
    const tokenA = createSession(userA.id), tokenB = createSession(userB.id);
    let id = '', oldId = '', snapshot = '';
    await runAsUser(userA, async () => {
      const created = createLiuyaoSession({ title: '复核条件合成占问', question: '合成测试：如何核对项目安排？', input: { ...baseInput, focusTarget: 'self' }, reading: { version: '客户端伪造' } });
      id = created.session.id; snapshot = JSON.stringify(created.session.result);
      check(created.session.result.reading?.version === LIUYAO_READING_VERSION, '保存复核由服务端计算不接受客户端伪造');
      check(createLiuyaoSession({ title: '复核条件合成占问', question: created.session.question, input: { ...baseInput, focusTarget: 'self' } }).reused, '相同复核条件幂等复用');
      const other = createLiuyaoSession({ title: created.session.title, question: created.session.question, input: { ...baseInput, focusTarget: 'wealth' } });
      check(other.session.id !== id, '改变用神目标生成独立快照');
      const messages = buildLiuyaoMessages(created.session, [], '解释这些待核条件');
      equal(JSON.parse(messages.at(-1)!.content).result, created.session.result, 'AI严格使用已保存复核快照');
      check(messages[0].content.includes('复核') && messages[0].content.includes('候选'), '新提示词同步复核条件与候选边界');
      const newEvidence = created.session.result.evidence.find(e => e.id.startsWith('reading:'))!;
      const reply = { content: '当前为合成测试，只解释当前固定卦象的复核依据和仍需确认的条件。', evidenceIds: [newEvidence.id] };
      equal(validateLiuyaoReply(JSON.stringify(reply), created.session).evidenceIds, [newEvidence.id], '新复核依据允许有效引用');
      const turn = claimLiuyaoTurn({ sessionId: id, message: '合成历史追问', requestId: randomUUID(), retryOf: null, provider: 'synthetic', model: 'synthetic', promptVersion: 'synthetic' });
      check(finishLiuyaoTurn(turn.turn.id, turn.token!, reply, 0, 0), '复核依据随合成历史回复固定保存');

      const legacy = createLiuyaoSession({ title: '旧版合成占问', question: '合成旧快照', input: baseInput }); oldId = legacy.session.id;
      const oldResult = copy(legacy.session.result); delete oldResult.reading;
      delete oldResult.input.focusTarget; delete oldResult.input.focusPosition;
      oldResult.evidence = oldResult.evidence.filter(e => !e.id.startsWith('reading:'));
      getDatabase().prepare('UPDATE liuyao_sessions SET result_json=? WHERE id=?').run(JSON.stringify(oldResult), oldId);
      const legacyRead = getLiuyaoSession(oldId)!;
      equal(legacyRead.result, oldResult, '读取旧快照不补算新复核或依据');
      const oldMessages = buildLiuyaoMessages(legacyRead, [], '请解释原来这份卦象');
      check(oldMessages[0].content !== messages[0].content, '旧版提示词不能冒充具有新复核');
      equal(JSON.parse(oldMessages.at(-1)!.content).result, oldResult, '旧AI仍只收到旧快照');
      rejects(() => validateLiuyaoReply(JSON.stringify(reply), legacyRead), '旧记录不能引用后来新增的复核ID');

      const archive = await createLocalBackupArchive();
      check(deleteLiuyaoSession(id) && deleteLiuyaoSession(oldId), '合成新旧占问可删除');
      await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      equal(JSON.stringify(getLiuyaoSession(id)!.result), snapshot, '备份还原逐字保留新复核快照');
      equal(getLiuyaoSession(oldId)!.result, oldResult, '备份还原不升级旧快照内容');
      check((getDatabase().pragma('foreign_key_check') as unknown[]).length === 0, '备份后的外键完整性');
      closeDatabaseConnection();
      equal(JSON.stringify(getLiuyaoSession(id)!.result), snapshot, '关闭连接再读仍使用原复核快照');
    });
    const context = { params: Promise.resolve({ id }) };
    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await read(request(token), context);
      equal(response.status, status, '复核占问匿名与跨账号访问被隔离');
      const body = await response.json();
      if (status === 200) { check(/no-store/.test(response.headers.get('cache-control') ?? ''), '复核响应禁止共享缓存'); equal(JSON.stringify(body.detail.session.result), snapshot, '接口读取固定复核结果'); }
      else check(!JSON.stringify(body).includes('六爻复核合成甲') && !JSON.stringify(body).includes(LIUYAO_READING_VERSION), '拒绝响应不泄漏复核内容');
    }
    equal((await remove(request(tokenB, 'DELETE'), context)).status, 404, '跨账号不能删除复核占问');
    equal((await preview(request(undefined, 'POST', { ...baseInput, focusTarget: 'self' }))).status, 401, '匿名不能调用复核预览');
    const previewResponse = await preview(request(tokenA, 'POST', { ...baseInput, focusTarget: 'self' }));
    equal(previewResponse.status, 200, '当前账号可预览复核');
    check((await previewResponse.json()).result.reading.version === LIUYAO_READING_VERSION, '预览返回新复核');
    const forgedResponse = await create(request(tokenA, 'POST', { title: '伪造输入合成', question: '合成验算', input: { ...baseInput, focusTarget: 'self' }, userId: userB.id, result: { reading: { version: '伪造版本' } } }));
    equal(forgedResponse.status, 201, '服务端接受有效起卦输入');
    const forged = await forgedResponse.json();
    check(forged.session.result.reading.version === LIUYAO_READING_VERSION, '客户端伪造账号或复核结果不能覆盖服务端结果');
    await runAsUser(userB, () => check(getLiuyaoSession(forged.session.id) === null, '伪造userId不会转存到另一账号库'));
    const oldResponse = await read(request(tokenA), { params: Promise.resolve({ id: oldId }) });
    check(!(await oldResponse.json()).detail.session.result.reading, 'HTTP回看旧快照也不会补算新复核');
    console.log(`六爻条件复核专项通过：${checks}项；生克/进退独立表、月日事实矩阵、64卦×64动变、用神模板与位次、空破日扶、历史快照、备份与账号隔离；未调用AI服务。`);
  } finally {
    for (const user of users) runAsUser(user, closeDatabaseConnection);
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-liuyao-reading-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
