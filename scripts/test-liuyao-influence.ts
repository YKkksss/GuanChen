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
import { claimLiuyaoTurn, createLiuyaoSession, deleteLiuyaoSession, finishLiuyaoTurn, getLiuyaoSession } from '../lib/db/liuyao';
import { buildLiuyaoMessages, liuyaoPromptVersionFor, LIUYAO_PROMPT_VERSION, validateLiuyaoReply } from '../lib/liuyao/chat';
import { calculateLiuyao } from '../lib/liuyao/engine';
import { LIUYAO_INFLUENCE_VERSION, type LiuyaoInfluenceNode, type LiuyaoInfluenceReview } from '../lib/liuyao/influence-types';
import { analyzeLiuyaoReading, readingEvidence } from '../lib/liuyao/reading-engine';
import { LEGACY_LIUYAO_READING_VERSION, LIUYAO_READING_VERSION, type LiuyaoElementRelation, type LiuyaoRoleReference } from '../lib/liuyao/reading-types';
import { KINDS, LIUYAO_VERSION, type Element, type Kin, type LineValue, type LiuyaoInput, type LiuyaoResult } from '../lib/liuyao/types';
import { GET as read, DELETE as remove } from '../app/api/liuyao/[id]/route';
import { POST as preview } from '../app/api/liuyao/preview/route';
import { POST as create } from '../app/api/liuyao/route';

// 本专项只用合成账号和独立临时数据库，不读取正式档案，也不调用供应商。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-liuyao-influence-'));
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
const representative: Record<Element, string> = { 木: '卯', 火: '午', 土: '丑', 金: '酉', 水: '亥' };
// 行为来源，列为目标。手工列五行表，不调用待测引擎推导期望值。
const relations: LiuyaoElementRelation[][] = [
  ['same', 'generates', 'controls', 'controlled_by', 'generated_by'],
  ['generated_by', 'same', 'generates', 'controls', 'controlled_by'],
  ['controlled_by', 'generated_by', 'same', 'generates', 'controls'],
  ['controls', 'controlled_by', 'generated_by', 'same', 'generates'],
  ['generates', 'controls', 'controlled_by', 'generated_by', 'same'],
];
const roles: Record<LiuyaoElementRelation, LiuyaoRoleReference['role']> = {
  same: '用神同类', generates: '元神', controls: '忌神', controlled_by: '仇神', generated_by: '其他',
};
const baseInput: LiuyaoInput = { method: 'lines', lineValues: [7, 7, 7, 7, 7, 7], dateTime: '2026-10-16T12:00:00', lateZiPolicy: 'midnight', focusKind: 'none' };
function inputFor(bits: number, mask = 0, extra: Partial<LiuyaoInput> = {}): LiuyaoInput {
  return { ...baseInput, lineValues: Array.from({ length: 6 }, (_, i) => ((bits >> i) & 1 ? ((mask >> i) & 1 ? 9 : 7) : ((mask >> i) & 1 ? 6 : 8))) as LineValue[], ...extra };
}
function influence(result: LiuyaoResult): LiuyaoInfluenceReview {
  const value = analyzeLiuyaoReading(result).influence;
  assert.ok(value, '新复核需要有作用路径对象');
  return value;
}
function nodeAt(review: LiuyaoInfluenceReview, position: number, hidden = false): LiuyaoInfluenceNode {
  const value = review.nodes.find(node => node.position === position && node.hidden === hidden);
  assert.ok(value, `应存在第${position}爻${hidden ? '伏神' : '本爻'}`);
  return value;
}
function targetKind(result: LiuyaoResult, kind: Kin = '官鬼', focusPosition?: number) {
  result.input.focusTarget = 'manual'; result.input.focusKind = kind;
  if (focusPosition === undefined) delete result.input.focusPosition;
  else result.input.focusPosition = focusPosition;
  result.focus = { kind, visible: result.lines.filter(line => line.kin === kind).map(line => line.position), hidden: result.lines.filter(line => line.hidden?.kin === kind).map(line => line.position) };
  return result;
}
function fixture(assigned: Element[], moving: number[] = []) {
  // 关系夹具由真实结果克隆后定向覆盖，不将这类构造称为纳甲或历法正确性验证。
  const result = copy(calculateLiuyao(baseInput));
  result.lines = result.lines.map((line, index) => {
    const element = assigned[index] ?? '火', branch = representative[element], active = moving.includes(index + 1);
    return { ...line, branch, element, kin: index === 0 ? '官鬼' : '父母', hidden: null, moving: active, value: active ? 9 : 7, changed: { ...line.changed, branch, element, kin: index === 0 ? '官鬼' : '父母' } };
  });
  result.movingLines = [...moving];
  return targetKind(result);
}
function request(token?: string, method = 'GET', body?: unknown) {
  return new Request('http://local/api/liuyao', { method, headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function responseStatus(response: Response, status: number, label: string) {
  equal(response.status, status, label);
  const body = await response.json();
  return body;
}

async function main() {
  const users: Awaited<ReturnType<typeof registerUser>>[] = [];
  try {
    equal(LEGACY_LIUYAO_READING_VERSION, 'liuyao-reading-v1-focus-month-day-change', '保留真实旧版条件复核版本');
    check(String(LIUYAO_READING_VERSION) !== String(LEGACY_LIUYAO_READING_VERSION), '新复核使用独立版本');
    check(LIUYAO_PROMPT_VERSION.startsWith('liuyao-chat-v3-'), '新问答使用第三代提示版本');

    for (let source = 0; source < elements.length; source++) for (let target = 0; target < elements.length; target++) {
      const result = fixture([elements[target], elements[source]], [2]);
      const review = influence(result), from = nodeAt(review, 2), to = nodeAt(review, 1);
      const edge = review.paths.find(item => item.from === from.id && item.to === to.id);
      check(edge, `${elements[source]}至${elements[target]}有实际来源路径`);
      equal(edge!.relation, relations[source][target], '来源至目标的五行方向来自独立矩阵');
      equal(edge!.role, roles[relations[source][target]], '元忌仇分类与关系方向一致');
      equal(edge!.mode, 'moving', '原始明动来源保留发动方式');
      equal(from.context, analyzeLiuyaoReading(result).lines[1].context, '路径节点携带来源自身月日条件');
      check(!review.paths.some(item => item.from === item.to), '不生成自己作用自己的路径');
    }

    const competing = fixture(['木', '水', '金', '土'], [2]);
    competing.lines[1].kin = '官鬼';
    targetKind(competing);
    const many = influence(competing);
    equal(many.selection.status, 'multiple', '多现保持待定位');
    equal(many.selection.selectedId, null, '多现不自动排序选出用神');
    equal(many.candidates.map(item => nodeAt(many, many.nodes.find(node => node.id === item.nodeId)!.position).position), [1, 2], '候选以本位次保序');
    check(many.candidates.every(item => !item.selected), '未手选前候选均不假标已取用');
    check(many.paths.some(item => item.to === nodeAt(many, 1).id) && many.paths.some(item => item.to === nodeAt(many, 2).id), '两候选各自保留来源路径');
    competing.input.focusPosition = 2;
    const manual = influence(competing);
    equal(manual.selection.selectedId, nodeAt(manual, 2).id, '手动选择精确对应候选节点');
    equal(manual.candidates.filter(item => item.selected).map(item => item.nodeId), [nodeAt(manual, 2).id], '手选只改变对应标记');
    equal(manual.candidates.length, many.candidates.length, '手选不删除未选候选');

    const hiddenResult = fixture(['木', '金', '土', '火', '水', '火'], [1, 2]);
    hiddenResult.lines.forEach(line => { line.kin = '父母'; });
    hiddenResult.lines[0].hidden = { ...hiddenResult.lines[0], branch: '亥', element: '水', kin: '官鬼' };
    targetKind(hiddenResult);
    const hidden = influence(hiddenResult), flying = nodeAt(hidden, 1),伏神 = nodeAt(hidden, 1, true);
    check(flying.id !== 伏神.id, '飞爻与伏神同位仍有独立身份');
    equal(伏神.moving, false, '伏神不因飞爻发动而成为原动爻');
    equal(伏神.change, null, '伏神没有借用飞爻变爻');
    equal(伏神.activation, null, '伏神不借用飞爻暗动或日破身份');
    equal(hidden.selection.selectedId, 伏神.id, '缺亲唯一伏神可准确定位');
    check(伏神.flyingHidden, '伏神节点保留飞伏说明');
    check(hidden.paths.some(item => item.from === flying.id && item.to === 伏神.id), '同位飞伏两个身份不被位置去重吞掉');
    const hiddenSource = copy(hiddenResult);
    hiddenSource.lines[1].kin = '官鬼';
    hiddenSource.lines[0].hidden!.kin = '兄弟';
    targetKind(hiddenSource);
    const sourceHidden = influence(hiddenSource), hiddenFrom = nodeAt(sourceHidden, 1, true);
    check(sourceHidden.paths.filter(item => item.from === hiddenFrom.id).every(item => item.mode === 'hidden'), '伏神来源始终以待核身份列出');
    check(hiddenFrom.pending.length > 0, '伏神保留出伏效力尚未判定条件');

    const constrained = fixture(['木', '水', '金', '土'], [2]);
    constrained.calendar = { ...constrained.calendar, monthBranch: '巳', month: '己巳', dayBranch: '子', day: '甲子', emptyBranches: ['亥', '丑'] };
    constrained.lines[1].changed = { ...constrained.lines[1].changed, branch: '丑', element: '土' };
    const opposed = influence(constrained),元神 = nodeAt(opposed, 2);
    check(元神.context.empty && 元神.context.monthClash, '来源同时保留旬空与月破');
    check(元神.context.supports.length > 0, '来源日辰生扶仍独立存在');
    equal(元神.change?.relation, 'controls', '变爻只对来源本位形成回头克');
    check(元神.change?.context.empty, '变爻自身旬空不会丢失');
    check(元神.supportFacts.length > 0 && 元神.constraintFacts.length > 0, '扶助与制约同时保留，不互相擦除');
    check(元神.constraintFacts.some(text => /回头克|变爻|动变/.test(text)), '来源自身动变反证进入节点制约');
    check(opposed.paths.some(item => item.from === 元神.id && item.to === nodeAt(opposed, 1).id && item.role === '元神'), '有制约仍保留元神类别，不假称失效或删除');
    equal(opposed.nodes.length, constrained.lines.length, '变爻不成为新的跨位节点');

    for (let index = 0; index < elements.length; index++) {
      const target = elements[index], yuan = elements[(index + 4) % 5], ji = elements[(index + 3) % 5], chou = elements[(index + 2) % 5];
      const source = fixture([target, yuan, ji, chou], [2, 3, 4]);
      const review = influence(source), to = nodeAt(review, 1);
      for (const [kind, positions, expected] of [['ji_yuan', [3, 2], ['generates', 'generates']], ['chou_ji', [4, 3], ['generates', 'controls']]] as const) {
        const first = nodeAt(review, positions[0]), second = nodeAt(review, positions[1]);
        const chain = review.jointActions.find(item => item.kind === kind && item.target === to.id && item.nodes.includes(first.id) && item.nodes.includes(second.id));
        check(chain, `${target}用神${kind}共同明动保留有节点的链`);
        equal(chain!.segments.map(segment => [segment.from, segment.to, segment.relation]), [[first.id, second.id, expected[0]], [second.id, to.id, expected[1]]], '链条按实际生克方向逐段展开');
        check(chain!.pending.length > 0, '共同发动链仍保留效力前提');
      }
      source.lines[1].moving = false; source.movingLines = [3, 4];
      const staticYuan = influence(source);
      check(!staticYuan.jointActions.some(item => item.kind === 'ji_yuan' && item.target === nodeAt(staticYuan, 1).id), '元神静爻不冒充忌元共同发动');
      source.lines[2].moving = false; source.movingLines = [4];
      const staticJi = influence(source);
      check(!staticJi.jointActions.some(item => item.target === nodeAt(staticJi, 1).id), '忌神静爻不能参与任一共同明动链');
      source.lines[1].moving = true; source.lines[2].moving = true; source.movingLines = [2, 3, 4];
      source.calendar.emptyBranches = [source.lines[1].branch, source.lines[2].branch];
      const emptyChain = influence(source);
      check(emptyChain.jointActions.some(item => item.kind === 'ji_yuan' && item.target === nodeAt(emptyChain, 1).id), '共同发动空爻保留结构链与条件，不自动宣告消失');
      check(emptyChain.nodes.filter(node => [2, 3].includes(node.position)).every(node => node.constraintFacts.length > 0), '共同发动来源各自空破继续保留');
    }

    const noFocus = calculateLiuyao(baseInput).reading!.influence!;
    equal(noFocus.selection.status, 'unselected', '未选用神不凭占问猜测');
    equal(noFocus.candidates.length, 0, '未选用神没有目标候选');
    equal(noFocus.paths.length, 0, '未选用神不造作用路径');
    equal(noFocus.jointActions.length, 0, '未选用神不造共同发动链');
    const missingResult = fixture(['木', '水']); missingResult.lines.forEach(line => { line.kin = '父母'; }); targetKind(missingResult);
    equal(influence(missingResult).selection.status, 'missing', '真实候选缺失不会按五行补造六亲用神');

    // 下面的组合全部使用真实纳甲、历法与四象结果，不使用定向覆盖夹具。
    let sawHidden = false, sawMultiple = false, sawJoint = false;
    for (let bits = 0; bits < 64; bits++) for (let mask = 0; mask < 64; mask++) {
      const input = inputFor(bits, mask, { focusKind: KINDS[bits % KINDS.length], focusTarget: 'manual' }), beforeInput = JSON.stringify(input);
      const result = calculateLiuyao(input), beforeResult = JSON.stringify(result), review = result.reading!.influence!;
      equal(result.version, LIUYAO_VERSION, '作用复核不改变纳甲基盘版本');
      equal(review.version, LIUYAO_INFLUENCE_VERSION, '真实组合保存独立作用版本');
      equal(JSON.stringify(input), beforeInput, '起卦不改写用户原始输入');
      analyzeLiuyaoReading(result); readingEvidence(result.reading!);
      equal(JSON.stringify(result), beforeResult, '复核和依据生成不改写原始事实或固定结果');
      const identities = result.lines.flatMap(line => [{ position: line.position, hidden: false, branch: line.branch, moving: line.moving }, ...(line.hidden ? [{ position: line.position, hidden: true, branch: line.hidden.branch, moving: false }] : [])]);
      equal(review.nodes.map(node => ({ position: node.position, hidden: node.hidden, branch: node.branch, moving: node.moving })), identities, '真实节点只有本爻和实际伏神，无变爻跨位节点');
      equal(new Set(review.nodes.map(node => node.id)).size, review.nodes.length, '节点标识唯一');
      equal(new Set(review.paths.map(edge => edge.id)).size, review.paths.length, '路径标识唯一');
      equal(new Set(review.jointActions.map(chain => chain.id)).size, review.jointActions.length, '共同发动链标识唯一');
      const nodes = new Map(review.nodes.map(node => [node.id, node]));
      const candidateIds = new Set(review.candidates.map(candidate => candidate.nodeId));
      check(review.paths.every(edge => nodes.has(edge.from) && nodes.has(edge.to) && edge.from !== edge.to && candidateIds.has(edge.to)), '来源与目标均真实存在，目标属于实际候选且不自作用');
      check(review.paths.every(edge => { const from = nodes.get(edge.from)!, to = nodes.get(edge.to)!; return edge.relation === relations[elements.indexOf(from.element)][elements.indexOf(to.element)] && edge.role === roles[edge.relation] && edge.mode === (from.hidden ? 'hidden' : from.moving ? 'moving' : 'static'); }), '真实路径方向类别与明伏动静符合独立五行矩阵');
      check(review.nodes.every(node => node.hidden ? !node.moving && !node.change && !node.activation : Boolean(node.change) === node.moving), '伏神不借动，只有原始明动节点携本位变爻');
      check(review.jointActions.every(chain => chain.nodes.includes(chain.target) && chain.nodes.filter(id => id !== chain.target).every(id => { const node = nodes.get(id); return node && !node.hidden && node.moving; }) && candidateIds.has(chain.target) && chain.segments.every(segment => nodes.has(segment.from) && nodes.has(segment.to))), '共同发动只使用实际明动来源和真实端点，目标自身不要求发动');
      const evidence = result.evidence.filter(item => item.id.startsWith('reading:influence:'));
      check(evidence.length > 0 && evidence.every(item => item.sourceUrl.startsWith('https://zh.wikisource.org/')), '作用依据具有固定命名空间和原典来源');
      equal(new Set(result.evidence.map(item => item.id)).size, result.evidence.length, '新旧证据标识不冲突');
      check(review.sources.length > 0 && review.boundaries.length > 0, '每盘保留来源与能力边界');
      check(!Object.hasOwn(review, 'score') && !Object.hasOwn(review, 'rank') && !Object.hasOwn(review, 'verdict'), '不增加总分排序与最终裁决字段');
      sawHidden ||= review.nodes.some(node => node.hidden); sawMultiple ||= review.selection.status === 'multiple'; sawJoint ||= review.jointActions.length > 0;
    }
    check(sawHidden && sawMultiple && sawJoint, '真实组合遍历覆盖伏神、多现与共同发动链');

    for (const policy of ['midnight', 'zi_start'] as const) {
      const result = calculateLiuyao({ ...baseInput, dateTime: '2026-10-16T23:30:00', lateZiPolicy: policy, focusTarget: 'self' });
      check(result.reading!.influence!.nodes.every(node => node.context.empty === result.calendar.emptyBranches.includes(node.branch)), '新复核旬空沿用明确换日后的原盘日辰');
      const selected = result.reading!.influence!.selection.selectedId;
      equal(selected, nodeAt(result.reading!.influence!, result.palace.shi).id, '自占仍固定本卦世爻，不随新路径重取');
    }

    const userA = await registerUser({ username: `li-a-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '六爻路径合成甲' }); users.push(userA);
    const userB = await registerUser({ username: `li-b-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '六爻路径合成乙' }); users.push(userB);
    const tokenA = createSession(userA.id), tokenB = createSession(userB.id);
    let id = '', oldId = '', v1Id = '', snapshot = '', v1Snapshot = '', oldSnapshot = '';
    await runAsUser(userA, async () => {
      const created = createLiuyaoSession({ title: '作用路径合成验收', question: '合成测试：核对安排的条件有哪些？', input: { ...baseInput, focusTarget: 'self' }, result: { reading: { influence: { version: '伪造' } } } });
      id = created.session.id; snapshot = JSON.stringify(created.session.result);
      equal(created.session.result.reading!.influence!.version, LIUYAO_INFLUENCE_VERSION, '保存内容由服务端计算，伪造作用对象不能覆盖');
      check(createLiuyaoSession({ title: created.session.title, question: created.session.question, input: { ...baseInput, focusTarget: 'self' } }).reused, '同样原始条件和新规则保存幂等');
      const messages = buildLiuyaoMessages(created.session, [], '解释来源与目标');
      equal(liuyaoPromptVersionFor(created.session), LIUYAO_PROMPT_VERSION, '新快照明确选择v3提示策略');
      equal(JSON.parse(messages.at(-1)!.content).result, created.session.result, '新问答只消费已保存的新作用快照');
      check(/来源|路径/.test(messages[0].content) && /共同|同动/.test(messages[0].content), '新问答声明来源路径和共同发动的条件能力');
      const incomplete = copy(created.session); delete incomplete.result.reading!.influence;
      equal(liuyaoPromptVersionFor(incomplete), 'liuyao-chat-v2-conditional-reading', 'v2缺少作用字段时仅允许已有基础条件复核');
      const incompleteMessages = buildLiuyaoMessages(incomplete, [], '解释保存内容');
      check(!incompleteMessages[0].content.includes('本快照还包含influence'), 'v2缺字段不能声称存在作用快照');
      equal(JSON.parse(incompleteMessages.at(-1)!.content).result, incomplete.result, '缺字段快照不会为问答补算新对象');
      const unknownInfluence = copy(created.session); unknownInfluence.result.reading!.influence!.version = '未知作用版本';
      equal(liuyaoPromptVersionFor(unknownInfluence), 'liuyao-chat-v2-conditional-reading', '未知作用版本不能冒用v3能力');
      check(!buildLiuyaoMessages(unknownInfluence, [], '核对')[0].content.includes('本快照还包含influence'), '未知作用版本使用保守能力文案');
      const unknownReading = copy(created.session); unknownReading.result.reading!.version = '未知条件版本';
      equal(liuyaoPromptVersionFor(unknownReading), 'liuyao-chat-v1', '未知条件版本不借用v1/v2复核能力');
      const citation = created.session.result.evidence.find(item => item.id.startsWith('reading:influence:'))!;
      const reply = { content: '本轮只核对合成卦象已经保存的来源条件，支持与制约并列，不能代替效力裁决。', evidenceIds: [citation.id] };
      equal(validateLiuyaoReply(JSON.stringify(reply), created.session).evidenceIds, [citation.id], '允许引用真实保存的作用路径依据');
      rejects(() => validateLiuyaoReply(JSON.stringify({ ...reply, evidenceIds: ['reading:influence:不存在'] }), created.session), '拒绝不存在的作用依据');
      rejects(() => validateLiuyaoReply(JSON.stringify({ ...reply, evidenceIds: Array(9).fill(citation.id) }), created.session), '新作用依据仍受八条引用上限约束');
      const claim = claimLiuyaoTurn({ sessionId: id, message: '合成来源追问', requestId: randomUUID(), retryOf: null, provider: 'synthetic', model: 'synthetic', promptVersion: LIUYAO_PROMPT_VERSION });
      check(finishLiuyaoTurn(claim.turn.id, claim.token!, reply, 0, 0), '作用依据随已完成轮次固定保存');

      const v1 = createLiuyaoSession({ title: '真实v1结构合成', question: '旧条件复核快照', input: { ...baseInput, focusTarget: 'self' } }); v1Id = v1.session.id;
      const v1Result = copy(v1.session.result); v1Result.reading!.version = LEGACY_LIUYAO_READING_VERSION; delete v1Result.reading!.influence;
      v1Result.evidence = v1Result.evidence.filter(item => !item.id.startsWith('reading:influence:'));
      v1Snapshot = JSON.stringify(v1Result);
      getDatabase().prepare('UPDATE liuyao_sessions SET result_json=? WHERE id=?').run(v1Snapshot, v1Id);
      const v1Read = getLiuyaoSession(v1Id)!;
      equal(JSON.stringify(v1Read.result), v1Snapshot, '真实v1结构读回不补新作用对象');
      equal(liuyaoPromptVersionFor(v1Read), 'liuyao-chat-v2-conditional-reading', 'v1条件快照准确保留v2提示策略');
      const v1Messages = buildLiuyaoMessages(v1Read, [], '解释原先月日动变条件');
      check(v1Messages[0].content !== messages[0].content, 'v1与v2使用各自能力提示');
      check(/月令/.test(v1Messages[0].content) && !/本记录是旧版固定快照，没有当前深化复核/.test(v1Messages[0].content), '已有v1条件复核不会被误称完全没有reading');
      equal(JSON.parse(v1Messages.at(-1)!.content).result, v1Result, 'v1提示只收到原先完整条件快照');
      rejects(() => validateLiuyaoReply(JSON.stringify(reply), v1Read), 'v1不能引用后来的新作用证据');
      const v1Citation = v1Read.result.evidence.find(item => item.id.startsWith('reading:'))!;
      equal(validateLiuyaoReply(JSON.stringify({ ...reply, evidenceIds: [v1Citation.id] }), v1Read).evidenceIds, [v1Citation.id], 'v1原条件依据仍可引用');

      const legacy = createLiuyaoSession({ title: '无reading旧卦象合成', question: '基础装卦旧快照', input: baseInput }); oldId = legacy.session.id;
      const oldResult = copy(legacy.session.result); delete oldResult.reading; delete oldResult.input.focusTarget; delete oldResult.input.focusPosition;
      oldResult.evidence = oldResult.evidence.filter(item => !item.id.startsWith('reading:')); oldSnapshot = JSON.stringify(oldResult);
      getDatabase().prepare('UPDATE liuyao_sessions SET result_json=? WHERE id=?').run(oldSnapshot, oldId);
      const old = getLiuyaoSession(oldId)!, oldMessages = buildLiuyaoMessages(old, [], '解释装卦依据');
      equal(liuyaoPromptVersionFor(old), 'liuyao-chat-v1', '无reading快照准确保留v1提示策略');
      equal(JSON.stringify(old.result), oldSnapshot, '无reading旧快照不自动补新规则');
      check(oldMessages[0].content !== v1Messages[0].content && oldMessages[0].content !== messages[0].content, '三代快照各有准确能力边界');
      rejects(() => validateLiuyaoReply(JSON.stringify(reply), old), '基础快照不能引用新作用证据');
      rejects(() => validateLiuyaoReply(JSON.stringify({ ...reply, evidenceIds: [v1Citation.id] }), old), '基础快照不能引用v1条件证据');
      const archive = await createLocalBackupArchive();
      check([id, v1Id, oldId].every(value => deleteLiuyaoSession(value)), '三代合成会话能各自删除');
      await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      equal(JSON.stringify(getLiuyaoSession(id)!.result), snapshot, '备份恢复完整新作用快照');
      equal(JSON.stringify(getLiuyaoSession(v1Id)!.result), v1Snapshot, '备份恢复逐字保留v1快照');
      equal(JSON.stringify(getLiuyaoSession(oldId)!.result), oldSnapshot, '备份恢复逐字保留无reading旧盘');
      equal(getDatabase().pragma('foreign_key_check'), [], '新旧快照还原后无外键错误');
      closeDatabaseConnection();
      equal(JSON.stringify(getLiuyaoSession(id)!.result), snapshot, '重新建立连接仍按固定快照回看');
    });

    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await read(request(token), { params: Promise.resolve({ id }) });
      check(/no-store/.test(response.headers.get('cache-control') ?? ''), '作用内容或拒绝响应禁止共享缓存');
      const body = await responseStatus(response, status, '新作用快照受匿名和跨账号读取隔离');
      if (status === 200) equal(JSON.stringify(body.detail.session.result), snapshot, 'API固定返回保存的新作用内容');
      else check(!JSON.stringify(body).includes('六爻路径合成甲') && !JSON.stringify(body).includes(LIUYAO_INFLUENCE_VERSION), '拒绝响应不泄漏姓名和作用快照');
    }
    await responseStatus(await remove(request(tokenB, 'DELETE'), { params: Promise.resolve({ id }) }), 404, '另一账号不能删除作用快照');
    await responseStatus(await preview(request(undefined, 'POST', { ...baseInput, focusTarget: 'self' })), 401, '匿名不能预览作用复核');
    const previewed = await responseStatus(await preview(request(tokenA, 'POST', { ...baseInput, focusTarget: 'self', influence: { version: '客户端伪造' } })), 200, '当前账号可预览并由服务端计算');
    equal(previewed.result.reading.influence.version, LIUYAO_INFLUENCE_VERSION, '顶层伪造作用版本不覆盖服务端计算');
    const forged = await responseStatus(await create(request(tokenA, 'POST', { title: '防伪合成新盘', question: '合成接口验证', input: { ...baseInput, focusTarget: 'self', influence: { version: '伪造' } }, userId: userB.id, result: { reading: { influence: { version: '伪造' } } } })), 201, '有效原始输入可保存，客户端账号及结果字段无效');
    equal(forged.session.result.reading.influence.version, LIUYAO_INFLUENCE_VERSION, '保存不接受客户端伪造结果');
    await runAsUser(userB, () => check(getLiuyaoSession(forged.session.id) === null, '伪造userId不能向其他账号数据库写入'));
    const v1Read = await responseStatus(await read(request(tokenA), { params: Promise.resolve({ id: v1Id }) }), 200, 'v1快照API仍可回看');
    equal(JSON.stringify(v1Read.detail.session.result), v1Snapshot, 'v1 API不补新作用依据');
    const oldRead = await responseStatus(await read(request(tokenA), { params: Promise.resolve({ id: oldId }) }), 200, '基础旧快照API仍可回看');
    equal(JSON.stringify(oldRead.detail.session.result), oldSnapshot, '基础旧盘API不追加reading');
    console.log(`六爻作用路径专项通过：${checks}项；独立五行矩阵、4096真实组合、用神多现与飞伏、来源自身动变反证、两类共同发动链、三代快照与备份、当前账号隔离和接口防伪；未调用AI服务。`);
  } finally {
    for (const user of users) runAsUser(user, closeDatabaseConnection);
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-liuyao-influence-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
