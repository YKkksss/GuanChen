import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { calculateBaziLuckCycles } from '../lib/bazi/luck-cycle-engine';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createSynthesisSession, deleteSynthesisSession, fingerprintSynthesis, listSynthesisVersions, storeSynthesisSnapshot } from '../lib/db/synthesis';
import { buildDynamicSynthesisFacts, resolveDynamicRange } from '../lib/synthesis/dynamic-engine';
import { buildSynthesisDynamicReview } from '../lib/synthesis/dynamic-review-engine';
import { SYNTHESIS_DYNAMIC_REVIEW_VERSION } from '../lib/synthesis/dynamic-review-types';
import { generateDynamicSynthesisReport, getDynamicSynthesisDetail, saveDynamicSynthesisSnapshot } from '../lib/synthesis/dynamic-service';
import { LEGACY_SYNTHESIS_DYNAMIC_VERSION, SYNTHESIS_DYNAMIC_VERSION, type SynthesisDynamicSelection } from '../lib/synthesis/dynamic-types';
import { buildSynthesisMessages, resolveSynthesisPromptVersion, LEGACY_SYNTHESIS_DYNAMIC_PROMPT_VERSION, SYNTHESIS_DYNAMIC_PROMPT_VERSION, SYNTHESIS_PROMPT_VERSION, validateSynthesisContent } from '../lib/synthesis/interpretation';
import { generateSynthesisReport, getSynthesisDetail } from '../lib/synthesis/service';
import { SYNTHESIS_SECTIONS, SYNTHESIS_TOPICS, type SynthesisContent, type SynthesisFacts, type SynthesisTopic } from '../lib/synthesis/types';
import { GET as read, POST as write } from '../app/api/synthesis/[id]/dynamic/route';

// 测试数据、账号与备份只写入本专项临时目录。模型请求仅发送到下方本机模拟服务。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-synthesis-dynamic-review-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'synthetic-review-only';
process.env.DEEPSEEK_MODEL = 'synthetic-review-model';

let checks = 0, calls = 0;
let mode: 'normal' | 'old-dynamic-only' = 'normal';
const received: Array<{ facts: SynthesisFacts; system: string }> = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
async function rejectsAsync(work: () => Promise<unknown>, label: string) { await assert.rejects(work, label); checks++; }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function selection(dateTime = '2026-10-16T12:00:00', level: SynthesisDynamicSelection['level'] = 'month'): SynthesisDynamicSelection { return { dateTime, level }; }
function shiftSecond(value: string, seconds: number) { return new Date(Date.parse(value.replace(' ', 'T') + '+08:00') + seconds * 1000 + 8 * 3_600_000).toISOString().slice(0, 19); }

const input = { displayName: '动态作用合成盘', birthDate: '1992-07-09', birthTime: '09:30', gender: 'female', timeZoneId: 'Etc/GMT-8', timeStandard: 'civil_time', lateZiPolicy: 'next_day' };
const elements = ['木', '火', '土', '金', '水'];
const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const stemElements: Record<string, string> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
// 只作期望值的独立表，不导入待测关系目录。
const elementRelations = [
  ['same', 'generates', 'controls', 'controlled_by', 'generated_by'],
  ['generated_by', 'same', 'generates', 'controls', 'controlled_by'],
  ['controlled_by', 'generated_by', 'same', 'generates', 'controls'],
  ['controls', 'controlled_by', 'generated_by', 'same', 'generates'],
  ['generates', 'controls', 'controlled_by', 'generated_by', 'same'],
];
const fiveCombines = ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'];
const sixCombines = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
const sixClashes = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
const sixHarms = ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'];
const branchSets = [
  ['branch_three_harmony', '申子辰'], ['branch_three_harmony', '亥卯未'], ['branch_three_harmony', '寅午戌'], ['branch_three_harmony', '巳酉丑'],
  ['branch_three_meeting', '亥子丑'], ['branch_three_meeting', '寅卯辰'], ['branch_three_meeting', '巳午未'], ['branch_three_meeting', '申酉戌'],
  ['branch_three_punishment', '寅巳申'], ['branch_three_punishment', '丑戌未'],
] as const;
function hasPair(pairs: string[], a: string, b: string) { return a !== b && pairs.some(pair => pair.includes(a) && pair.includes(b)); }

function contentFor(facts: SynthesisFacts, forceOld = false): SynthesisContent {
  const review = facts.dynamic?.review?.version === SYNTHESIS_DYNAMIC_REVIEW_VERSION && !forceOld;
  const prefix = facts.dynamic ? review ? ':dynamic:review:' : ':dynamic:' : ':';
  const find = (system: string) => facts.evidence.find(item => item.id.startsWith(system + prefix) && (!forceOld || !item.id.startsWith(system + ':dynamic:review:')))!.id;
  const z = find('ziwei'), b = find('bazi');
  return { summary: `${facts.topic}合成复核摘要，分别核对主题四化位置与八字跨层结构，保留不同时间边界和适用限制。`, sections: (Object.keys(SYNTHESIS_SECTIONS) as Array<keyof typeof SYNTHESIS_SECTIONS>).map((key, index) => ({ key, content: `第${index + 1}节${key}的合成观察。两侧分别说明已经保存的条件与仍待核对的限制，不将相近主题视为独立证明或现实事件结论。`, evidenceIds: key === 'ziwei' ? [z] : key === 'bazi' ? [b] : [z, b] })) };
}
const server = createServer(async (request, response) => {
  calls++;
  let raw = ''; for await (const chunk of request) raw += chunk;
  const messages = JSON.parse(raw).messages as Array<{ role: string; content: string }>;
  const facts = JSON.parse(messages.at(-1)!.content) as SynthesisFacts;
  received.push({ facts, system: messages[0].content });
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(contentFor(facts, mode === 'old-dynamic-only')) } }], usage: { prompt_tokens: 100, completion_tokens: 120 } }));
});
function request(token?: string, method = 'GET', body?: unknown, query = '') {
  return new Request(`http://local/api/synthesis/dynamic${query}`, { method, headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function responseBody(response: Response, status: number, label: string) { equal(response.status, status, label); return response.json(); }

async function main() {
  const users: Awaited<ReturnType<typeof registerUser>>[] = [];
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('模拟供应商地址无效');
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  try {
    const userA = await registerUser({ username: `sdr-a-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '动态作用合成甲' }); users.push(userA);
    const userB = await registerUser({ username: `sdr-b-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '动态作用合成乙' }); users.push(userB);
    const tokenA = createSession(userA.id), tokenB = createSession(userB.id);
    let id = '', legacyId = '', legacyKey = '', newSnapshot = '', legacySnapshot = '', newKey = '';
    await runAsUser(userA, async () => {
      id = createSynthesisSession(input).session.id;
      const base = getSynthesisDetail(id, 'overview').facts;
      const current = buildDynamicSynthesisFacts(base, selection()), stage = current.dynamic;
      equal(LEGACY_SYNTHESIS_DYNAMIC_VERSION, 'synthesis-dynamic-v1-fixed-utc8-observation', '保留真实动态v1版本常量');
      check(String(SYNTHESIS_DYNAMIC_VERSION) !== String(LEGACY_SYNTHESIS_DYNAMIC_VERSION), '新增复核升级动态阶段键');
      equal(stage.review!.version, SYNTHESIS_DYNAMIC_REVIEW_VERSION, '阶段携带独立复核版本');
      equal(stage.key, `${SYNTHESIS_DYNAMIC_VERSION}:month:${selection().dateTime}`, '同观察点的新规则使用新阶段键');
      equal(stage.review!.observation, stage.selection.dateTime, '复核只对应已选精确观察点');
      equal(resolveSynthesisPromptVersion(current), SYNTHESIS_DYNAMIC_PROMPT_VERSION, '已知复核能力使用新动态策略');
      equal(resolveSynthesisPromptVersion(base), SYNTHESIS_PROMPT_VERSION, '本命没有动态或复核策略');
      const withoutReview = copy(current); delete withoutReview.dynamic.review;
      equal(resolveSynthesisPromptVersion(withoutReview), LEGACY_SYNTHESIS_DYNAMIC_PROMPT_VERSION, '新阶段缺复核字段仍只允许旧动态能力');
      const unknownReview = copy(current); unknownReview.dynamic.review!.version = '未知复核版本';
      equal(resolveSynthesisPromptVersion(unknownReview), LEGACY_SYNTHESIS_DYNAMIC_PROMPT_VERSION, '未知复核版本不借用当前作用能力');
      check(!buildSynthesisMessages(unknownReview)[0].content.includes('本记录带 dynamic.review 主题复核'), '未知复核使用保守提示');
      const oldStageWithKnownReview = copy(current); oldStageWithKnownReview.dynamic.version = LEGACY_SYNTHESIS_DYNAMIC_VERSION;
      equal(resolveSynthesisPromptVersion(oldStageWithKnownReview), SYNTHESIS_DYNAMIC_PROMPT_VERSION, '提示版本按已知复核能力选择，不仅检查外层阶段版本');
      equal(LEGACY_SYNTHESIS_DYNAMIC_PROMPT_VERSION, 'ziwei-bazi-synthesis-dynamic-report-v1', '旧动态提示常量保留');
      const beforeBase = JSON.stringify(base), beforeStage = JSON.stringify(stage);
      buildSynthesisDynamicReview(base, stage);
      equal(JSON.stringify(base), beforeBase, '纯复核不改本命与本命依据');
      equal(JSON.stringify(stage), beforeStage, '纯复核不改原阶段、四化或岁运');

      // 人工旋转主题锚点与四化落点，仅查坐标几何；不冒充实际排星或四化计算验证。
      const matrixBase = getSynthesisDetail(id, 'career').facts;
      const matrixStage = buildDynamicSynthesisFacts(matrixBase, selection(undefined, 'year')).dynamic;
      const natalStart = matrixBase.ziwei.palaces.find(palace => palace.name.replace(/宫$/, '') === '官禄')!.branch;
      const dynamicStart = matrixStage.ziwei.annual.palaceMappings.find(palace => palace.transitPalaceName.replace(/宫$/, '') === '官禄')!.branch;
      for (let anchor = 0; anchor < 12; anchor++) for (let landing = 0; landing < 12; landing++) {
        const alteredBase = copy(matrixBase), alteredStage = copy(matrixStage);
        alteredBase.ziwei.palaces.forEach(palace => { palace.branch = (palace.branch + anchor - natalStart + 12) % 12; });
        const dynamicAnchor = (anchor + 3) % 12;
        alteredStage.ziwei.annual.palaceMappings.forEach(palace => { palace.branch = (palace.branch + dynamicAnchor - dynamicStart + 12) % 12; });
        alteredStage.ziwei.annual.transformations = [{ type: (['禄', '权', '科', '忌'] as const)[landing % 4], starName: '合成坐标星', natalPalaceBranch: landing, natalPalaceName: '合成落宫' }];
        const review = buildSynthesisDynamicReview(alteredBase, alteredStage), layer = review.ziwei.layers[0], transformation = layer.transformations[0];
        equal(layer.level, 'year', '流年粒度不混入流月层');
        equal([transformation.natalPalaceBranch, transformation.type, transformation.located], [landing, alteredStage.ziwei.annual.transformations[0].type, true], '四化保留实际类型与本命落点');
        for (const [reference, branch] of [['natal_topic', anchor], ['dynamic_topic', dynamicAnchor]] as const) {
          const distance = (landing - branch + 12) % 12;
          const expected = distance === 0 ? 'direct' : distance === 6 ? 'opposite' : distance === 4 || distance === 8 ? 'trine' : null;
          const matches = transformation.hits.filter(hit => hit.reference === reference && hit.topicPalace.replace(/宫$/, '') === '官禄');
          equal(matches.map(hit => [hit.branch, hit.relation]), expected ? [[branch, expected]] : [], '本命与动态主题坐标分别按独立十二支偏移表命中');
        }
      }
      const unlocatedStage = copy(matrixStage);
      unlocatedStage.ziwei.annual.transformations = [{ type: '忌', starName: '未定位合成星', natalPalaceBranch: null, natalPalaceName: null }];
      const unlocated = buildSynthesisDynamicReview(matrixBase, unlocatedStage).ziwei.layers[0].transformations[0];
      equal([unlocated.located, unlocated.hits], [false, []], '未定位四化不借宫、不借星、不补造主题命中');

      // 干支矩阵定向覆盖结构字段，不将人工改柱的夹具用于验证出生历法或十神排法。
      for (const dynamicStem of stems) for (const natalStem of stems) {
        const alteredBase = copy(base), alteredStage = copy(matrixStage);
        const natalBranch = stems.indexOf(natalStem) % 2 ? '丑' : '子', dynamicBranch = stems.indexOf(dynamicStem) % 2 ? '丑' : '子';
        alteredBase.bazi.chart.pillars.day.ganZhi = natalStem + natalBranch;
        alteredStage.bazi.year.ganZhi = dynamicStem + dynamicBranch;
        alteredStage.bazi.luck.status = 'unavailable'; alteredStage.bazi.luck.cycle = null;
        const review = buildSynthesisDynamicReview(alteredBase, alteredStage);
        const pair = review.bazi.relations.filter(relation => relation.domain === 'stem' && relation.participants.length === 2 && relation.participants.some(person => person.layer === 'annual') && relation.participants.some(person => person.layer === 'natal' && person.pillarKey === 'day'));
        const relationship = elementRelations[elements.indexOf(stemElements[dynamicStem])][elements.indexOf(stemElements[natalStem])];
        const type = relationship === 'same' ? 'stem_same_element' : ['generates', 'generated_by'].includes(relationship) ? 'stem_generate' : 'stem_control';
        check(pair.some(relation => relation.type === type), '动态年与原局日干关系符合独立五行矩阵');
        equal(pair.some(relation => relation.type === 'stem_five_combine'), hasPair(fiveCombines, dynamicStem, natalStem), '五合仅按独立五对表，不混淆同类生克');
        check(pair.every(relation => relation.scope === 'annual_to_natal' && ['detected_only', 'detected_not_transformed'].includes(relation.conclusion)), '表干结构保留年对原局范围，不裁决效力');
      }
      for (const dynamicBranch of branches) for (const natalBranch of branches) {
        const alteredBase = copy(base), alteredStage = copy(matrixStage);
        alteredBase.bazi.chart.pillars.day.ganZhi = (branches.indexOf(natalBranch) % 2 ? '乙' : '甲') + natalBranch;
        alteredStage.bazi.year.ganZhi = (branches.indexOf(dynamicBranch) % 2 ? '乙' : '甲') + dynamicBranch;
        alteredStage.bazi.luck.status = 'unavailable'; alteredStage.bazi.luck.cycle = null;
        const review = buildSynthesisDynamicReview(alteredBase, alteredStage);
        const pairTypes = review.bazi.relations.filter(relation => relation.domain === 'branch' && relation.participants.length === 2 && relation.participants.some(person => person.layer === 'annual') && relation.participants.some(person => person.layer === 'natal' && person.pillarKey === 'day')).map(relation => relation.type).sort();
        const expected = [hasPair(sixCombines, dynamicBranch, natalBranch) ? 'branch_six_combine' : null, hasPair(sixClashes, dynamicBranch, natalBranch) ? 'branch_clash' : null, hasPair(sixHarms, dynamicBranch, natalBranch) ? 'branch_harm' : null, hasPair(['子卯'], dynamicBranch, natalBranch) ? 'branch_mutual_punishment' : null, dynamicBranch === natalBranch && ['辰', '午', '酉', '亥'].includes(dynamicBranch) ? 'branch_self_punishment' : null].filter(Boolean).sort();
        equal(pairTypes, expected, '十二支跨层关系全矩阵符合独立合冲害刑表');
      }
      for (const [type, members] of branchSets) {
        const alteredBase = copy(base), alteredStage = copy(matrixStage), [first, second, third] = [...members];
        for (const pillar of Object.values(alteredBase.bazi.chart.pillars)) if (pillar) pillar.ganZhi = (branches.indexOf(first) % 2 ? '乙' : '甲') + first;
        alteredBase.bazi.chart.pillars.time = null;
        alteredStage.bazi.luck.status = 'unavailable'; alteredStage.bazi.luck.cycle = null;
        alteredStage.bazi.year.ganZhi = (branches.indexOf(second) % 2 ? '乙' : '甲') + second;
        const partial = buildSynthesisDynamicReview(alteredBase, alteredStage);
        check(!partial.bazi.relations.some(relation => relation.type === type && [...new Set(relation.participants.map(person => person.symbol))].sort().join('') === [...members].sort().join('')), '集合缺第三支不冒充三合、三会或三刑齐支');
        alteredBase.bazi.chart.pillars.month.ganZhi = (branches.indexOf(third) % 2 ? '乙' : '甲') + third;
        const full = buildSynthesisDynamicReview(alteredBase, alteredStage);
        check(full.bazi.relations.some(relation => relation.type === type && [...new Set(relation.participants.map(person => person.symbol))].sort().join('') === [...members].sort().join('')), '完整三支且跨层才保留集合结构');
        check(full.bazi.relations.every(relation => new Set(relation.participants.map(person => person.layer)).size >= 2), '新审计仍仅列跨层关系，不冒充全原局关系清单');
      }

      for (const topic of Object.keys(SYNTHESIS_TOPICS) as SynthesisTopic[]) for (const level of ['year', 'month'] as const) {
        const natal = getSynthesisDetail(id, topic).facts, preservedNatal = JSON.stringify(natal), facts = buildDynamicSynthesisFacts(natal, selection(undefined, level)), review = facts.dynamic.review!;
        equal([review.topic, review.status], [topic, 'available'], '五主题两粒度各自保存复核身份');
        equal(review.ziwei.layers.map(layer => layer.level), level === 'month' ? ['year', 'month'] : ['year'], '层级只含实际选择的年与可选月');
        equal(review.bazi.nodes.filter(node => node.layer === 'natal').map(node => node.pillarKey), ['year', 'month', 'day', 'time'], '完整原局四柱逐项保留');
        equal(review.bazi.nodes.some(node => node.layer === 'month'), level === 'month', '年粒度不补八字流月节点');
        check(review.bazi.nodes.every(node => node.layer !== 'day'), '动态合参不偷加流日或观察时柱');
        check(review.bazi.nodes.filter(node => node.layer !== 'natal').every(node => node.effectiveDate === facts.dynamic.selection.dateTime.replace('T', ' ')), '动态节点绑定精确观察墙钟，不使用年中代表点');
        check(review.bazi.nodes.filter(node => node.layer === 'annual' || node.layer === 'month').every(node => node.annualYear === Number(facts.dynamic.bazi.year.startAt.slice(0, 4))), '八字节点年号取立春区间年份，不能改用紫微农历年');
        check(review.bazi.relations.every(relation => relation.participants.every(person => review.bazi.nodes.some(node => node.id === person.id))), '每条关系参与者均来自本观察点节点');
        if (level === 'month') check(review.bazi.relations.some(relation => relation.scope === 'month_to_annual'), '流月与当前流年结构保留正确跨层范围');
        check(review.bazi.topicRoles.every(role => role.matchesTopic === (SYNTHESIS_TOPICS[topic].roles as readonly string[]).includes(role.stemTenGod) && role.hiddenStems.every(hidden => hidden.matchesTopic === (SYNTHESIS_TOPICS[topic].roles as readonly string[]).includes(hidden.tenGod))), '主题角色只作预先公开集合匹配，不改变十神或删掉不匹配项');
        equal(review.bazi.topicRoles.map(role => [role.key, role.ganZhi, role.stemTenGod]), facts.dynamic.bazi.roles.map(role => [role.key, role.ganZhi, role.stemTenGod]), '主题视图保留阶段各层的真实角色');
        check(review.ziwei.layers.every(layer => layer.anchors.every(anchor => SYNTHESIS_TOPICS[topic].palaces.some(name => name.replace(/宫$/, '') === anchor.topicPalace.replace(/宫$/, '')))), '紫微锚点只属于当前明确主题');
        check(review.ziwei.layers.every(layer => new Set(layer.transformations.map(item => item.evidenceId)).size === layer.transformations.length), '四化引用标识各层内部唯一');
        equal(new Set(facts.evidence.map(item => item.id)).size, facts.evidence.length, '本命、旧动态与复核依据全局不重号');
        check(facts.evidence.some(item => item.id === 'ziwei:dynamic:review:scope') && facts.evidence.some(item => item.id === 'bazi:dynamic:review:scope'), '两侧都有包括受限状态的可引用复核范围');
        check(!Object.hasOwn(review, 'score') && !Object.hasOwn(review, 'confidence') && !Object.hasOwn(review, 'verdict'), '不增加合参总分、置信度或最终结论字段');
        check(review.sideBySide.length > 0 && review.sideBySide.every(item => Boolean(item.ziwei) && Boolean(item.bazi)), '并列条目保留两侧各自说明，不生成跨体系关系边');
        equal(JSON.stringify(natal), preservedNatal, '新动态构建不回写本命事实');
        const report = contentFor(facts);
        equal(validateSynthesisContent(JSON.stringify(report), facts).sections.length, 5, '五主题双侧新复核引用合法');
        rejects(() => validateSynthesisContent(JSON.stringify(contentFor(facts, true)), facts), '新版报告不能只引旧动态定位而漏掉本轮复核');
        const wrong = copy(report); wrong.sections[0].evidenceIds = wrong.sections[1].evidenceIds;
        rejects(() => validateSynthesisContent(JSON.stringify(wrong), facts), '新增复核仍禁止跨体系误引');
      }

      const range = resolveDynamicRange(base);
      rejects(() => buildDynamicSynthesisFacts(base, selection(shiftSecond(range.minDateTime, -1))), '出生前观察一秒仍拒绝');
      const schedule = calculateBaziLuckCycles({ ...base.bazi.chart, input: { ...base.bazi.chart.input, timeZoneId: 'Asia/Shanghai' } });
      equal(schedule.status, 'complete', '合成固定东八区出生资料有可核八步排期');
      for (const cycle of schedule.cycles) {
        const before = buildDynamicSynthesisFacts(base, selection(shiftSecond(cycle.startAt!, -1))).dynamic.review!;
        const at = buildDynamicSynthesisFacts(base, selection(cycle.startAt!.replace(' ', 'T'))).dynamic.review!;
        equal(at.bazi.nodes.filter(node => node.layer === 'luck_cycle').map(node => [node.luckCycleIndex, node.ganZhi]), [[cycle.index, cycle.ganZhi]], '精确交运秒起使用新运节点');
        equal(before.bazi.nodes.filter(node => node.layer === 'luck_cycle').map(node => node.luckCycleIndex), cycle.index === 1 ? [] : [cycle.index - 1], '交运前一秒仍用前运，首运前不补第一运');
      }
      const afterLast = buildDynamicSynthesisFacts(base, selection(schedule.cycles.at(-1)!.endAtExclusive!.replace(' ', 'T'))).dynamic.review!;
      equal(afterLast.bazi.nodes.filter(node => node.layer === 'luck_cycle'), [], '第八步结束撤回当前运，不循环或造第九步');
      check(afterLast.bazi.nodes.some(node => node.layer === 'annual'), '运表外仍保留独立流年结构');

      const unknownId = createSynthesisSession({ ...input, displayName: '动态缺时合成盘', birthTime: undefined, unknownTime: true }).session.id;
      const unknownBase = getSynthesisDetail(unknownId, 'overview').facts;
      const birthDay = buildDynamicSynthesisFacts(unknownBase, selection(`${input.birthDate}T12:00:00`)).dynamic.review!;
      equal([birthDay.status, birthDay.ziwei.referenceOnly], ['birth_time_unconfirmed', true], '缺时出生当日撤回个人适用，紫微保留试排参考');
      equal([birthDay.bazi.nodes, birthDay.bazi.relations, birthDay.bazi.topicRoles], [[], [], []], '出生时刻未确认时不生成个人作用节点、关系或主题角色');
      const nextDay = buildDynamicSynthesisFacts(unknownBase, selection('1992-07-10T00:00:00')).dynamic.review!;
      equal([nextDay.status, nextDay.ziwei.referenceOnly], ['partial_unknown_time', true], '缺时后日仍明确部分复核及子时试排');
      equal(nextDay.bazi.nodes.filter(node => node.layer === 'natal').map(node => node.pillarKey), ['year', 'month', 'day'], '缺时后日仅已知三柱，不补时柱');
      check(!nextDay.bazi.nodes.some(node => node.layer === 'luck_cycle') && nextDay.bazi.nodes.some(node => node.layer === 'annual'), '缺时撤回精确大运，保留年历法与已知柱');
      check(!nextDay.bazi.relations.some(relation => relation.participants.some(person => person.pillarKey === 'time')), '缺时关系中没有伪造时柱目标');

      const beforeCalls = calls;
      const saved = saveDynamicSynthesisSnapshot(id, 'overview', selection());
      newKey = saved.facts.dynamic.key; newSnapshot = JSON.stringify(saved.facts);
      equal(calls, beforeCalls, '保存本轮复核依据不请求供应商');
      equal(saveDynamicSynthesisSnapshot(id, 'overview', selection()).savedSnapshotId, saved.savedSnapshotId, '同事实保存复用固定快照');
      const generated = await generateDynamicSynthesisReport(id, 'overview', selection());
      check(generated.activeVersionId, '新动态可生成五章解读');
      equal(received.at(-1)!.facts.dynamic!.review!.version, SYNTHESIS_DYNAMIC_REVIEW_VERSION, '本机模拟供应商收到当前固定复核而非补算结果');
      equal((getDatabase().prepare('SELECT prompt_version FROM synthesis_report_versions WHERE id = ?').get(generated.activeVersionId) as { prompt_version: string }).prompt_version, SYNTHESIS_DYNAMIC_PROMPT_VERSION, '新动态生成写入实际v2提示版本');
      check(SYNTHESIS_DYNAMIC_PROMPT_VERSION.startsWith('ziwei-bazi-synthesis-dynamic-report-v2'), '本轮动态提示策略升到v2');
      const generatedCalls = calls;
      await generateDynamicSynthesisReport(id, 'overview', selection());
      equal(calls, generatedCalls, '已完成同事实解读回看不再次调用模型');
      mode = 'old-dynamic-only';
      await rejectsAsync(() => generateDynamicSynthesisReport(id, 'overview', selection(), true), '只引旧定位依据的回复在服务端生成链路也拒绝');
      equal(getDynamicSynthesisDetail(id, 'overview', selection()).activeVersionId, generated.activeVersionId, '引用失败不替换已经完成的旧解读');
      mode = 'normal';

      legacyId = createSynthesisSession({ ...input, displayName: '动态v1旧阶段合成' }).session.id;
      const legacyBase = getSynthesisDetail(legacyId, 'overview').facts;
      const legacyFacts = buildDynamicSynthesisFacts(legacyBase, selection());
      legacyFacts.dynamic.version = LEGACY_SYNTHESIS_DYNAMIC_VERSION;
      legacyKey = `${LEGACY_SYNTHESIS_DYNAMIC_VERSION}:month:${selection().dateTime}`;
      legacyFacts.dynamic.key = legacyKey; legacyFacts.dynamic.label = '旧阶段原文标记，不允许新引擎重写';
      delete legacyFacts.dynamic.review;
      legacyFacts.evidence = legacyFacts.evidence.filter(item => !item.id.startsWith('ziwei:dynamic:review:') && !item.id.startsWith('bazi:dynamic:review:'));
      legacySnapshot = JSON.stringify(legacyFacts);
      storeSynthesisSnapshot({ sessionId: legacyId, facts: legacyFacts });
      const legacy = getDynamicSynthesisDetail(legacyId, 'overview', selection(), legacyKey);
      equal(JSON.stringify(legacy.facts), legacySnapshot, '按旧阶段键逐字读取v1，不补本轮复核');
      equal(getDynamicSynthesisDetail(legacyId, 'overview').facts.dynamic.key, legacyKey, '默认历史仍使用旧键，不替换成当前v2');
      const oldMessages = buildSynthesisMessages(legacy.facts), newMessages = buildSynthesisMessages(current);
      check(oldMessages[0].content !== newMessages[0].content, '旧动态和本轮复核使用不同能力提示');
      equal(JSON.parse(oldMessages[1].content).dynamic, legacyFacts.dynamic, '旧动态消息只携带已保存旧阶段');
      equal(validateSynthesisContent(JSON.stringify(contentFor(legacy.facts, true)), legacy.facts).sections.length, 5, '旧动态仍按旧定位引用门槛校验');
      const newCitation = current.evidence.find(item => item.id.startsWith('ziwei:dynamic:review:'))!.id;
      const falseLegacy = contentFor(legacy.facts, true); falseLegacy.sections[0].evidenceIds = [newCitation];
      rejects(() => validateSynthesisContent(JSON.stringify(falseLegacy), legacy.facts), '旧阶段不能引用后来新增的复核依据');
      const oldGenerated = await generateDynamicSynthesisReport(legacyId, 'overview', selection(), false, undefined, legacyKey);
      equal((getDatabase().prepare('SELECT prompt_version FROM synthesis_report_versions WHERE id = ?').get(oldGenerated.activeVersionId) as { prompt_version: string }).prompt_version, 'ziwei-bazi-synthesis-dynamic-report-v1', '对旧动态新生成仍写旧v1提示策略');
      check(!received.at(-1)!.facts.dynamic!.review && received.at(-1)!.facts.dynamic!.key === legacyKey, '旧阶段重生成不偷偷补新作用对象');
      equal(JSON.stringify(getDynamicSynthesisDetail(legacyId, 'overview', selection(), legacyKey).facts), legacySnapshot, '生成旧解读后仍不重写旧事实原文');
      const natalReport = await generateSynthesisReport(id, 'career');
      check(!received.at(-1)!.facts.dynamic, '本命合参生成不混入动态复核');
      equal((getDatabase().prepare('SELECT prompt_version FROM synthesis_report_versions WHERE id = ?').get(natalReport.activeVersionId) as { prompt_version: string }).prompt_version, SYNTHESIS_PROMPT_VERSION, '本命生成仍保留原提示策略');
      rejects(() => getDynamicSynthesisDetail(legacyId, 'career', selection(), legacyKey), '旧键不可跨主题读取');
      rejects(() => getDynamicSynthesisDetail(id, 'overview', selection(), legacyKey), '旧键不可跨合参会话读取');
      rejects(() => getDynamicSynthesisDetail(legacyId, 'overview', selection(shiftSecond(selection().dateTime, 1)), legacyKey), '旧键与观察秒不一致拒绝');
      rejects(() => getDynamicSynthesisDetail(legacyId, 'overview', selection(undefined, 'year'), legacyKey), '旧键与观察粒度不一致拒绝');
      rejects(() => getDynamicSynthesisDetail(id, 'overview', selection(), '未知阶段键'), '未知阶段键不回退到新计算');
      const archive = await createLocalBackupArchive();
      check(deleteSynthesisSession(id) && deleteSynthesisSession(legacyId), '新旧动态会话能各自删除');
      await restoreLocalBackupArchive({ archive: archive.buffer, confirmation: LOCAL_BACKUP_CONFIRMATION });
      equal(JSON.stringify(getDynamicSynthesisDetail(id, 'overview', selection(), newKey).facts), newSnapshot, '备份恢复逐字保留新动态复核');
      equal(JSON.stringify(getDynamicSynthesisDetail(legacyId, 'overview', selection(), legacyKey).facts), legacySnapshot, '备份恢复不升级旧动态');
      equal(getDatabase().pragma('foreign_key_check'), [], '新旧动态还原后外键完整');
      closeDatabaseConnection();
      equal(JSON.stringify(getDynamicSynthesisDetail(id, 'overview', selection(), newKey).facts), newSnapshot, '重新建立连接仍按固定复核回看');
      check(listSynthesisVersions(id, 'career').every(version => !version.facts.dynamic), '本命版本查询继续与动态阶段隔离');
      check(fingerprintSynthesis(current) !== fingerprintSynthesis(legacyFacts), '新作用字段及阶段版本进入事实指纹');
    });

    const query = `?topic=overview&level=month&dateTime=${encodeURIComponent(selection().dateTime)}&stageKey=${encodeURIComponent(newKey)}`;
    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await read(request(token, 'GET', undefined, query), { params: Promise.resolve({ id }) });
      check(/no-store/.test(response.headers.get('cache-control') ?? ''), '动态复核或拒绝响应禁止共享缓存');
      const body = await responseBody(response, status, '匿名和跨账号不能读取新复核');
      if (status === 200) equal(JSON.stringify(body.detail.facts), newSnapshot, 'API按阶段键读取固定新事实');
      else check(!JSON.stringify(body).includes(SYNTHESIS_DYNAMIC_REVIEW_VERSION) && !JSON.stringify(body).includes('动态作用合成甲'), '拒绝响应不泄漏复核或姓名');
    }
    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await write(request(token, 'POST', { topic: 'overview', action: 'save', selection: selection(), stageKey: newKey, userId: userB.id, facts: { dynamic: { review: { version: '客户端伪造' } } } }), { params: Promise.resolve({ id }) });
      const body = await responseBody(response, status, '匿名和跨账号不能保存新作用快照');
      if (status === 200) equal(JSON.stringify(body.detail.facts), newSnapshot, '服务端忽略客户端伪造事实和账号，保存原固定依据');
    }
    const oldQuery = `?topic=overview&stageKey=${encodeURIComponent(legacyKey)}`;
    const legacyRead = await responseBody(await read(request(tokenA, 'GET', undefined, oldQuery), { params: Promise.resolve({ id: legacyId }) }), 200, '旧方法阶段API仍可回看');
    equal(JSON.stringify(legacyRead.detail.facts), legacySnapshot, '旧阶段API不补新作用复核');
    await responseBody(await read(request(tokenB, 'GET', undefined, oldQuery), { params: Promise.resolve({ id: legacyId }) }), 404, '旧键不能绕过账号隔离');
    await responseBody(await write(request(tokenA, 'POST', { topic: 'career', action: 'save', selection: selection(), stageKey: legacyKey }), { params: Promise.resolve({ id: legacyId }) }), 404, 'API旧键不能借别主题存储');
    await responseBody(await write(request(tokenA, 'POST', { topic: 'overview', action: 'save', selection: selection(), stageKey: '不存在' }), { params: Promise.resolve({ id }) }), 404, 'API未知阶段不回退到新事实');
    await responseBody(await write(request(tokenA, 'POST', { topic: 'overview', action: 'save', selection: selection(), stageKey: 1 }), { params: Promise.resolve({ id }) }), 400, 'API拒绝非文本阶段键');
    console.log(`动态合参作用复核专项通过：${checks}项；独立十二支双坐标与四化矩阵、表干和支对及完整集合、五主题双粒度、交运和缺时适用、旧阶段原文与新旧提示、备份与账号阶段引用边界；本机模拟供应商${calls}次，真实供应商0次。`);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const user of users) runAsUser(user, closeDatabaseConnection);
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-synthesis-dynamic-review-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
