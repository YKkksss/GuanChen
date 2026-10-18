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
import { buildMeihuaMessages, getMeihuaDetail, MEIHUA_IMAGERY_PROMPT_VERSION as MEIHUA_PROMPT_VERSION, resolveMeihuaPromptVersion, sendMeihuaMessage, validateMeihuaReply } from '../lib/meihua/chat';
import { calculateMeihua } from '../lib/meihua/engine';
import { buildMeihuaImagery, meihuaImageryEvidence } from '../lib/meihua/imagery-engine';
import { MEIHUA_IMAGERY_VERSION, MEIHUA_SYMBOL_CATALOG_VERSION, type MeihuaImagery, type MeihuaImageryNodeKey } from '../lib/meihua/imagery-types';
import { LEGACY_MEIHUA_READING_VERSION, LEGACY_MEIHUA_IMAGERY_READING_VERSION, MEIHUA_READING_VERSION } from '../lib/meihua/reading-types';
import type { Line, MeihuaInput, MeihuaResult } from '../lib/meihua/types';
import { GET as read, DELETE as remove } from '../app/api/meihua/[id]/route';
import { POST as preview } from '../app/api/meihua/preview/route';
import { POST as save } from '../app/api/meihua/route';
import { POST as chat } from '../app/api/meihua/[id]/messages/route';

// 所有账号、数据库和备份均限本次临时空间；模型请求只发送到下方本机模拟供应商。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-meihua-imagery-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'synthetic-imagery-only';
process.env.DEEPSEEK_MODEL = 'synthetic-imagery-model';

let checks = 0, calls = 0;
let mode: 'normal' | 'old-only' = 'normal';
const received: Array<{ system: string; result: MeihuaResult }> = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
async function rejectsAsync(work: () => Promise<unknown>, label: string) { await assert.rejects(work, label); checks++; }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

// 下列八卦爻画、五行和关系矩阵独立定表，不导入待测TRIGRAMS或体用关系函数。
const trigrams: Array<{ number: number; name: string; element: string; lines: Line[] }> = [
  { number: 1, name: '乾', element: '金', lines: [1, 1, 1] }, { number: 2, name: '兑', element: '金', lines: [1, 1, 0] },
  { number: 3, name: '离', element: '火', lines: [1, 0, 1] }, { number: 4, name: '震', element: '木', lines: [1, 0, 0] },
  { number: 5, name: '巽', element: '木', lines: [0, 1, 1] }, { number: 6, name: '坎', element: '水', lines: [0, 1, 0] },
  { number: 7, name: '艮', element: '土', lines: [0, 0, 1] }, { number: 8, name: '坤', element: '土', lines: [0, 0, 0] },
];
const elements = ['木', '火', '土', '金', '水'];
const relationships = [
  ['比和', '体生用', '体克用', '用克体', '用生体'],
  ['用生体', '比和', '体生用', '体克用', '用克体'],
  ['用克体', '用生体', '比和', '体生用', '体克用'],
  ['体克用', '用克体', '用生体', '比和', '体生用'],
  ['体生用', '体克用', '用克体', '用生体', '比和'],
];
const keys: MeihuaImageryNodeKey[] = ['body', 'primary', 'mutual_lower', 'mutual_upper', 'changed'];
const input: MeihuaInput = { method: 'manual', upper: 1, lower: 5, movingLine: 4, mutualPolicy: 'pure_changed' };
function nodeAt(imagery: MeihuaImagery, key: MeihuaImageryNodeKey) {
  const value = imagery.nodes.find(node => node.key === key); assert.ok(value, `需要保留${key}位置`); return value;
}
function replyFor(result: MeihuaResult, forceOld = false) {
  const hasImagery = result.reading?.imagery?.version === MEIHUA_IMAGERY_VERSION && result.reading.imagery.catalogVersion === MEIHUA_SYMBOL_CATALOG_VERSION && !forceOld;
  const evidence = hasImagery ? result.evidence.find(item => item.id.startsWith('reading:imagery:')) : result.reading ? result.evidence.find(item => item.id === 'reading:relations') : result.evidence.find(item => item.id === 'gua:primary');
  assert.ok(evidence, '合成回复必须引用当前快照存在的依据');
  return { content: '## 合成结构观察\n\n这里只核对保存的取象候选、来源爻和共享条件，象意不代表已确认现实对象，重复位置不能作为独立证明。', evidenceIds: [evidence.id] };
}
const server = createServer(async (request, response) => {
  calls++; let raw = ''; for await (const chunk of request) raw += chunk;
  const messages = JSON.parse(raw).messages as Array<{ role: string; content: string }>;
  const { result } = JSON.parse(messages.at(-1)!.content) as { result: MeihuaResult };
  received.push({ result, system: messages[0].content });
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(replyFor(result, mode === 'old-only')) } }], usage: { prompt_tokens: 50, completion_tokens: 70 } }));
});
function request(token?: string, method = 'GET', body?: unknown) {
  return new Request('http://local/api/meihua', { method, headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function responseBody(response: Response, status: number, label: string) { equal(response.status, status, label); return response.json(); }

async function main() {
  const users: Awaited<ReturnType<typeof registerUser>>[] = [];
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('本机供应商端口不存在');
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  try {
    equal(LEGACY_MEIHUA_READING_VERSION, 'meihua-reading-v1-season-conditional-timing', '真实旧季节复核版本保留');
    check(String(MEIHUA_READING_VERSION) !== String(LEGACY_MEIHUA_READING_VERSION), '取象复核独立升级方法版本');
    check(MEIHUA_PROMPT_VERSION.startsWith('meihua-chat-v3-'), '新取象策略为第三代');
    const seenCatalog = new Set<number>();
    let sawChangedMutual = false, sawMovingWithinUnchangedMutual = false, sawRepeated = false;
    for (let upper = 1; upper <= 8; upper++) for (let lower = 1; lower <= 8; lower++) for (let movingLine = 1; movingLine <= 6; movingLine++) for (const mutualPolicy of ['middle_lines', 'pure_changed'] as const) {
      const raw: MeihuaInput = { method: 'manual', upper, lower, movingLine, mutualPolicy }, beforeInput = JSON.stringify(raw);
      const result = calculateMeihua(raw), before = JSON.stringify(result), imagery = result.reading!.imagery!;
      equal([imagery.version, imagery.catalogVersion], [MEIHUA_IMAGERY_VERSION, MEIHUA_SYMBOL_CATALOG_VERSION], '768真实组合保存独立结构与目录版本');
      equal(JSON.stringify(raw), beforeInput, '取象生成不改原始起卦输入');
      buildMeihuaImagery(result, result.reading!); meihuaImageryEvidence(imagery);
      equal(JSON.stringify(result), before, '纯取象和依据生成不改固定结果');
      equal(imagery.nodes.map(node => node.key), keys, '固定体与四用位保序，重复卦不合并');
      const original = [...trigrams[lower - 1].lines, ...trigrams[upper - 1].lines];
      const changed = original.map((value, index) => index === movingLine - 1 ? value === 1 ? 0 : 1 : value) as Line[];
      const pureException = mutualPolicy === 'pure_changed' && upper === lower && (upper === 1 || upper === 8);
      equal(imagery.mutualSource, pureException ? 'changed' : 'primary', '仅纯乾坤指定异例才从变卦取互');
      const usePositions = movingLine <= 3 ? [1, 2, 3] : [4, 5, 6], bodyPositions = movingLine <= 3 ? [4, 5, 6] : [1, 2, 3];
      const positions: Record<MeihuaImageryNodeKey, number[]> = { body: bodyPositions, primary: usePositions, mutual_lower: [2, 3, 4], mutual_upper: [3, 4, 5], changed: usePositions };
      const bodyTrigram = trigrams[(movingLine <= 3 ? upper : lower) - 1];
      for (const key of keys) {
        const node = nodeAt(imagery, key), sourceBoard = key === 'changed' || (key.startsWith('mutual_') && pureException) ? 'changed' : 'primary';
        const values = sourceBoard === 'changed' ? changed : original;
        const expectedLines = positions[key].map(position => values[position - 1]);
        const expectedTrigram = trigrams.find(trigram => trigram.lines.join() === expectedLines.join())!;
        equal([node.sourceBoard, node.sourceLinePositions], [sourceBoard, positions[key]], '节点源板和原六爻位置符合独立取线定义');
        equal(node.trigram.lines, expectedLines, '节点爻值严格来自声明源板，不偷偷另起卦');
        equal([node.trigram.number, node.trigram.name, node.trigram.element], [expectedTrigram.number, expectedTrigram.name, expectedTrigram.element], '独立八卦爻画表核对每位置身份');
        const contains = positions[key].includes(movingLine), applied = contains && sourceBoard === 'changed';
        equal([node.containsMovingOrigin, node.changedApplied], [contains, applied], '含原动位和实际读翻转值分别标记');
        equal(node.lineTrace, positions[key].map((position, index) => ({ position: index + 1, originalPosition: position, originalValue: original[position - 1], value: values[position - 1], flipped: sourceBoard === 'changed' && position === movingLine })), '逐爻轨迹保留局部序、原位置、原值、现值与翻转身份');
        equal(node.relationship, key === 'body' ? '固定体参照' : relationships[elements.indexOf(bodyTrigram.element)][elements.indexOf(expectedTrigram.element)], '五个位置均以本卦固定体比较，方向独立核对');
        equal(node.seasonState, null, '无季节时间不自动取现在或造旺衰');
        equal(node.symbolicCandidates.trigramNumber, expectedTrigram.number, '类象目录按实际八卦绑定，不按位置或卦名猜测');
        check(Array.isArray(node.symbolicCandidates.forms) && node.symbolicCandidates.nature.length > 0 && node.symbolicCandidates.objects.length > 0, '目录保留自然与器物候选，未核实形态允许明确留空');
        check(imagery.sources.some(source => source.id === node.symbolicCandidates.sourceId), '每条类象候选有实际来源条目');
        seenCatalog.add(node.trigram.number);
        sawMovingWithinUnchangedMutual ||= key.startsWith('mutual_') && contains && !applied;
      }
      const body = nodeAt(imagery, 'body'), mainUse = nodeAt(imagery, 'primary'), changedUse = nodeAt(imagery, 'changed');
      equal(body.trigram.number, bodyTrigram.number, '固定体始终取本卦无动侧');
      equal([body.containsMovingOrigin, body.changedApplied], [false, false], '原体不会接收动爻或翻转');
      equal(imagery.change, { from: 'primary', to: 'changed', originalMovingLine: movingLine, localMovingLine: movingLine <= 3 ? movingLine : movingLine - 3, before: original[movingLine - 1], after: changed[movingLine - 1], fixedBodyKey: 'body', evidenceId: imagery.change.evidenceId }, '单动路径严格保留本用至变用及固定体');
      equal(mainUse.trigram.lines.filter((value, index) => value !== changedUse.trigram.lines[index]).length, 1, '本用至变用只变一个局部爻');
      equal(imagery.overlaps.length, 10, '五个位置保留全部十个无序配对');
      equal(new Set(imagery.overlaps.map(pair => [pair.left, pair.right].sort().join(':'))).size, 10, '共享配对无遗漏或反向重复');
      for (const pair of imagery.overlaps) {
        const left = nodeAt(imagery, pair.left), right = nodeAt(imagery, pair.right);
        const intersection = positions[pair.left].filter(position => positions[pair.right].includes(position));
        const different = intersection.filter(position => left.lineTrace.find(line => line.originalPosition === position)!.value !== right.lineTrace.find(line => line.originalPosition === position)!.value);
        equal(pair.originalLines, intersection, '共享按原六爻身份交集，不按相同阴阳值猜重合');
        equal(pair.differentValues, different, '同原位异值准确标记，不把变前与变后当同一读值');
        equal(pair.sameTrigram, left.trigram.number === right.trigram.number, '重复卦只作同卦标签，不删除位置');
        sawRepeated ||= pair.sameTrigram;
      }
      const mutualPair = imagery.overlaps.find(pair => [pair.left, pair.right].includes('mutual_lower') && [pair.left, pair.right].includes('mutual_upper'))!;
      equal([mutualPair.originalLines, mutualPair.differentValues], [[3, 4], []], '上下互固定共享原三四爻且采用同板同值');
      if (movingLine === 1 || movingLine === 6) check(!nodeAt(imagery, 'mutual_lower').containsMovingOrigin && !nodeAt(imagery, 'mutual_upper').containsMovingOrigin, '初爻或上爻不进入任何互卦来源');
      const imageryEvidence = meihuaImageryEvidence(imagery), evidenceIds = new Set(imageryEvidence.map(item => item.id));
      check(imageryEvidence.every(item => item.id.startsWith('reading:imagery:') && item.sourceUrl.startsWith('https://zh.wikisource.org/')), '新增依据命名空间与原典来源完整');
      equal(evidenceIds.size, imageryEvidence.length, '取象依据内部无重号');
      check([...imagery.nodes.map(node => node.evidenceId), imagery.change.evidenceId, ...imagery.overlaps.map(pair => pair.evidenceId)].every(id => evidenceIds.has(id)), '节点、变化和共享都能指向实际依据');
      equal(new Set(result.evidence.map(item => item.id)).size, result.evidence.length, '起卦、季节与取象依据全局无冲突');
      sawChangedMutual ||= imagery.mutualSource === 'changed';
    }
    equal([...seenCatalog].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8], '真实矩阵覆盖完整八卦目录');
    check(sawChangedMutual && sawMovingWithinUnchangedMutual && sawRepeated, '矩阵实际涵盖纯卦异例、含动但未翻转互位与重复卦');
    const noTime = calculateMeihua(input), withTime = calculateMeihua({ ...input, contextDateTime: '2026-10-16T12:00:00' });
    equal([noTime.primary, noTime.mutual, noTime.changed, noTime.movingLine, noTime.body, noTime.use], [withTime.primary, withTime.mutual, withTime.changed, withTime.movingLine, withTime.body, withTime.use], '补季节时间不改变取象所依据的原始卦象');
    const structure = (imagery: MeihuaImagery) => imagery.nodes.map(({ seasonState: _state, ...node }) => node);
    equal(structure(noTime.reading!.imagery!), structure(withTime.reading!.imagery!), '补时间只影响季节，不改来源、类象和依赖');
    check(noTime.reading!.imagery!.nodes.every(node => node.seasonState === null) && withTime.reading!.imagery!.nodes.every(node => node.seasonState !== null), '缺时和明确季节参考分别保留状态');

    const userA = await registerUser({ username: `mi-a-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '梅花取象合成甲' }); users.push(userA);
    const userB = await registerUser({ username: `mi-b-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '梅花取象合成乙' }); users.push(userB);
    const tokenA = createSession(userA.id), tokenB = createSession(userB.id);
    let id = '', v1Id = '', oldId = '', snapshot = '', v1Snapshot = '', oldSnapshot = '';
    await runAsUser(userA, async () => {
      const made = createMeihuaSession({ title: '取象溯源合成验收', question: '合成测试：核对当前结构的来源条件。', input, result: { reading: { imagery: { version: '伪造' } } } });
      // 明确构造实际上一代v2取象快照；本专项继续验证原v3策略，不拿新占类快照冒充旧版本。
      made.session.result.reading!.version = LEGACY_MEIHUA_IMAGERY_READING_VERSION;
      delete made.session.result.reading!.scenario;
      made.session.result.evidence = made.session.result.evidence.filter(item => !item.id.startsWith('reading:scenario:'));
      getDatabase().prepare('UPDATE meihua_sessions SET result_json=? WHERE id=?').run(JSON.stringify(made.session.result), made.session.id);
      id = made.session.id; snapshot = JSON.stringify(made.session.result);
      equal(made.session.result.reading!.imagery!.version, MEIHUA_IMAGERY_VERSION, '保存取象由服务端计算，客户端伪造无效');
      check(createMeihuaSession({ title: made.session.title, question: made.session.question, input }).reused, '同起卦同规则保存保持幂等');
      equal(calls, 0, '预览及保存不调用模型');
      equal(resolveMeihuaPromptVersion(made.session), MEIHUA_PROMPT_VERSION, '已知取象版本使用v3能力');
      const missing = copy(made.session); delete missing.result.reading!.imagery;
      equal(resolveMeihuaPromptVersion(missing), 'meihua-chat-v2-season-conditional-timing', '新版缺取象时仅保留旧季节能力');
      const unknown = copy(made.session); unknown.result.reading!.imagery!.version = '未知取象版本';
      equal(resolveMeihuaPromptVersion(unknown), 'meihua-chat-v2-season-conditional-timing', '未知取象版本不可冒用当前能力');
      const unknownSnapshot = JSON.stringify(unknown), unknownPayload = JSON.parse(buildMeihuaMessages(unknown, [], '核对已支持条件').at(-1)!.content).result as MeihuaResult;
      check(!unknownPayload.reading!.imagery && unknownPayload.evidence.every(item => !item.id.startsWith('reading:imagery:')), '未知取象层及对应依据从模型载荷撤回');
      equal(JSON.stringify(unknown), unknownSnapshot, '撤回模型载荷不修改保存的未知版本原文');
      const unknownCatalog = copy(made.session); unknownCatalog.result.reading!.imagery!.catalogVersion = '未知目录版本';
      equal(resolveMeihuaPromptVersion(unknownCatalog), 'meihua-chat-v2-season-conditional-timing', '未知目录版本同样不冒用取象能力');
      const unknownCatalogSnapshot = JSON.stringify(unknownCatalog), unknownCatalogPayload = JSON.parse(buildMeihuaMessages(unknownCatalog, [], '核对').at(-1)!.content).result as MeihuaResult;
      check(!unknownCatalogPayload.reading!.imagery && unknownCatalogPayload.evidence.every(item => !item.id.startsWith('reading:imagery:')), '未知目录不混入模型的已支持事实');
      equal(JSON.stringify(unknownCatalog), unknownCatalogSnapshot, '未知目录载荷过滤仍保留保存原文');
      const unknownReading = copy(made.session); unknownReading.result.reading!.version = '未知复核版本';
      equal(resolveMeihuaPromptVersion(unknownReading), 'meihua-chat-v1', '未知复核版本降级基础能力');
      const unknownReadingSnapshot = JSON.stringify(unknownReading), unknownReadingPayload = JSON.parse(buildMeihuaMessages(unknownReading, [], '只看原结构').at(-1)!.content).result as MeihuaResult;
      check(!unknownReadingPayload.reading && unknownReadingPayload.evidence.every(item => !item.id.startsWith('reading:')), '未知复核整体及其依据从基础模型载荷撤回');
      equal(JSON.stringify(unknownReading), unknownReadingSnapshot, '基础降级不改保存的未知复核原文');
      const messages = buildMeihuaMessages(made.session, [], '解释取象来源');
      equal(JSON.parse(messages.at(-1)!.content).result, made.session.result, '新问答只收到当前固定取象快照');
      check(/取象|类象/.test(messages[0].content) && /共享|重複|重复/.test(messages[0].content), '新提示包含取象及共享依赖边界');
      const valid = replyFor(made.session.result);
      equal(validateMeihuaReply(JSON.stringify(valid), made.session).evidenceIds, valid.evidenceIds, '允许新快照真实取象引用');
      rejects(() => validateMeihuaReply(JSON.stringify(valid), unknown), '未知取象版本不能引用已撤回层依据');
      rejects(() => validateMeihuaReply(JSON.stringify(valid), unknownCatalog), '未知目录版本不能引用已撤回层依据');
      rejects(() => validateMeihuaReply(JSON.stringify(valid), unknownReading), '未知复核整体不能借取象引用通过校验');
      rejects(() => validateMeihuaReply(JSON.stringify(replyFor(made.session.result, true)), made.session), '新回复不能只引用旧结构或季节依据');
      rejects(() => validateMeihuaReply(JSON.stringify({ ...valid, evidenceIds: ['reading:imagery:不存在'] }), made.session), '拒绝伪造取象依据');
      rejects(() => validateMeihuaReply(JSON.stringify({ ...valid, evidenceIds: Array(9).fill(valid.evidenceIds[0]) }), made.session), '取象引用仍遵守八条上限');
      const generated = await sendMeihuaMessage(id, { message: '解释取象与原爻来源', requestId: randomUUID() });
      equal(generated.turns.at(-1)!.status, 'completed', '新取象问答完整保存');
      equal((getDatabase().prepare('SELECT prompt_version FROM meihua_turns WHERE id=?').get(generated.turns.at(-1)!.id) as { prompt_version: string }).prompt_version, MEIHUA_PROMPT_VERSION, '新轮次记录真实v3提示版本');
      mode = 'old-only';
      await rejectsAsync(() => sendMeihuaMessage(id, { message: '合成旧引用失败验证', requestId: randomUUID() }), '供应商只引旧依据时整条生成链路也拒绝发布');
      equal(getMeihuaDetail(id).turns.at(-1)!.status, 'failed', '错误引用只保留失败问题，不发布正文');
      mode = 'normal';

      const v1 = createMeihuaSession({ title: '旧季节完整结构合成', question: '合成v1条件回看', input: { ...input, contextDateTime: '2026-10-16T12:00:00' } }).session; v1Id = v1.id;
      const v1Result = copy(v1.result); v1Result.reading!.version = LEGACY_MEIHUA_READING_VERSION; delete v1Result.reading!.imagery; delete v1Result.reading!.scenario;
      v1Result.evidence = v1Result.evidence.filter(item => !item.id.startsWith('reading:imagery:') && !item.id.startsWith('reading:scenario:')); v1Snapshot = JSON.stringify(v1Result);
      getDatabase().prepare('UPDATE meihua_sessions SET result_json=? WHERE id=?').run(v1Snapshot, v1Id);
      const v1Read = getMeihuaSession(v1Id)!;
      equal(JSON.stringify(v1Read.result), v1Snapshot, '完整v1季节快照不补新取象');
      equal(resolveMeihuaPromptVersion(v1Read), 'meihua-chat-v2-season-conditional-timing', '旧季节快照准确保留v2能力');
      const v1Messages = buildMeihuaMessages(v1Read, [], '解释原季节条件');
      check(v1Messages[0].content !== messages[0].content && !v1Messages[0].content.includes('本记录为第一版固定快照，未包含季节'), '旧v1不会误称完全没有季节复核');
      equal(JSON.parse(v1Messages.at(-1)!.content).result, v1Result, '旧季节问答只携原有固定事实');
      equal(validateMeihuaReply(JSON.stringify(replyFor(v1Result)), v1Read).evidenceIds, ['reading:relations'], '旧季节回复保留原引用门槛');
      rejects(() => validateMeihuaReply(JSON.stringify(valid), v1Read), 'v1不能引用后来新增的取象ID');
      const oldSeasonTurn = await sendMeihuaMessage(v1Id, { message: '解释原有季节依据', requestId: randomUUID() });
      equal((getDatabase().prepare('SELECT prompt_version FROM meihua_turns WHERE id=?').get(oldSeasonTurn.turns.at(-1)!.id) as { prompt_version: string }).prompt_version, 'meihua-chat-v2-season-conditional-timing', '旧v1新问答记录原v2策略');

      const old = createMeihuaSession({ title: '基础旧卦合成', question: '合成基础结构回看', input }).session; oldId = old.id;
      const oldResult = copy(old.result); delete oldResult.reading;
      oldResult.evidence = oldResult.evidence.filter(item => !item.id.startsWith('reading:')); oldSnapshot = JSON.stringify(oldResult);
      getDatabase().prepare('UPDATE meihua_sessions SET result_json=? WHERE id=?').run(oldSnapshot, oldId);
      const oldRead = getMeihuaSession(oldId)!;
      equal(resolveMeihuaPromptVersion(oldRead), 'meihua-chat-v1', '无reading旧盘继续使用基础v1');
      const oldMessages = buildMeihuaMessages(oldRead, [], '解释基础卦象');
      check(oldMessages[0].content !== v1Messages[0].content && oldMessages[0].content !== messages[0].content, '三代策略各自保留实际能力边界');
      rejects(() => validateMeihuaReply(JSON.stringify(valid), oldRead), '基础旧盘不能引用取象依据');
      const oldTurn = await sendMeihuaMessage(oldId, { message: '只核对旧结构', requestId: randomUUID() });
      equal((getDatabase().prepare('SELECT prompt_version FROM meihua_turns WHERE id=?').get(oldTurn.turns.at(-1)!.id) as { prompt_version: string }).prompt_version, 'meihua-chat-v1', '基础旧盘新问答仍记录原v1策略');
      equal(received.length, 4, '本专项只发送四次明确的本机供应商请求');
      check(received[0].result.reading!.imagery && !received[2].result.reading!.imagery && !received[3].result.reading, '供应商各轮输入不混用三代快照');
      equal(JSON.stringify(getMeihuaSession(id)!.result), snapshot, '成功与失败问答均不改保存的取象事实');
      equal(JSON.stringify(getMeihuaSession(v1Id)!.result), v1Snapshot, '继续问答不升级旧季节原文');
      equal(JSON.stringify(getMeihuaSession(oldId)!.result), oldSnapshot, '基础问答不追加季节或取象');
      const archive = await createLocalBackupArchive();
      check([id, v1Id, oldId].every(value => deleteMeihuaSession(value)), '三代会话可以独立移除');
      await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      equal(JSON.stringify(getMeihuaSession(id)!.result), snapshot, '备份还原完整取象与原爻轨迹');
      equal(JSON.stringify(getMeihuaSession(v1Id)!.result), v1Snapshot, '备份还原不补写v1季节快照');
      equal(JSON.stringify(getMeihuaSession(oldId)!.result), oldSnapshot, '备份还原不升级基础旧盘');
      equal(getDatabase().pragma('foreign_key_check'), [], '三代还原后外键完整');
      closeDatabaseConnection();
      equal(JSON.stringify(getMeihuaSession(id)!.result), snapshot, '重开连接继续使用原固定取象');
    });

    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await read(request(token), { params: Promise.resolve({ id }) });
      check(/no-store/.test(response.headers.get('cache-control') ?? ''), '取象或拒绝响应均禁止共享缓存');
      const body = await responseBody(response, status, '三代取象读取遵守当前账号边界');
      if (status === 200) equal(JSON.stringify(body.detail.session.result), snapshot, 'API读取完整固定取象快照');
      else check(!JSON.stringify(body).includes(MEIHUA_IMAGERY_VERSION) && !JSON.stringify(body).includes('梅花取象合成甲'), '拒绝响应不泄漏账号或新结构');
    }
    await responseBody(await remove(request(tokenB, 'DELETE'), { params: Promise.resolve({ id }) }), 404, '另一账号不能删除取象会话');
    await responseBody(await chat(request(tokenB, 'POST', { message: '越权占问', requestId: randomUUID() }), { params: Promise.resolve({ id }) }), 404, '另一账号不能用取象会话发问');
    await responseBody(await preview(request(undefined, 'POST', input)), 401, '匿名不能计算取象预览');
    const previewed = await responseBody(await preview(request(tokenA, 'POST', { ...input, imagery: { version: '伪造' } })), 200, '当前账号预览取象仍由服务端计算');
    equal(previewed.result.reading.imagery.version, MEIHUA_IMAGERY_VERSION, '输入里的伪造取象结果不能覆盖服务端');
    const saved = await responseBody(await save(request(tokenA, 'POST', { title: '取象防伪合成新盘', question: '合成保存验证', input, userId: userB.id, result: { reading: { imagery: { version: '伪造' } } } })), 201, '有效原始起卦资料可保存');
    equal(saved.session.result.reading.imagery.version, MEIHUA_IMAGERY_VERSION, '保存不接受客户端虚构取象与账号');
    await runAsUser(userB, () => check(getMeihuaSession(saved.session.id) === null, '伪造userId不能向另一账号写入'));
    const v1 = await responseBody(await read(request(tokenA), { params: Promise.resolve({ id: v1Id }) }), 200, '旧v1仍可通过API回看');
    equal(JSON.stringify(v1.detail.session.result), v1Snapshot, '旧v1 API回看不补取象');
    const old = await responseBody(await read(request(tokenA), { params: Promise.resolve({ id: oldId }) }), 200, '基础旧盘API仍可回看');
    equal(JSON.stringify(old.detail.session.result), oldSnapshot, '基础旧盘API不补reading');
    const foreign = await middleware(new NextRequest('http://127.0.0.1:30001/api/meihua', { method: 'POST', headers: { host: '127.0.0.1:30001', origin: 'http://untrusted.invalid', 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, body: JSON.stringify({ input }) }));
    equal(foreign.status, 403, '异源请求在中间件阻断，不进入取象写入'); await foreign.json();
    const sameOrigin = await middleware(new NextRequest('http://127.0.0.1:30001/api/meihua', { method: 'POST', headers: { host: '127.0.0.1:30001', origin: 'http://127.0.0.1:30001', 'content-type': 'application/json' }, body: JSON.stringify({ input }) }));
    check(sameOrigin.status !== 403, '同源有效JSON仍可进入已有身份校验');
    console.log(`梅花取象与溯源专项通过：${checks}项；768组合独立爻画与五行、五位置逐爻来源、纯卦异例、十组共享与同位异值、无时间降级、三代快照及问答引用、备份账号防伪与同源保护；本机模拟供应商${calls}次，真实供应商0次。`);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const user of users) runAsUser(user, closeDatabaseConnection);
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-meihua-imagery-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
